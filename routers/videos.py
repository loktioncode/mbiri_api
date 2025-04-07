from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Any, Dict, List
from bson import ObjectId

from models.user import UserInDB
from models.video import Video, VideoCreate, VideoUpdate
from services.auth import get_current_user, get_creator
from services.video import (
    create_video,
    get_videos_by_creator,
    get_video_by_id,
    update_video,
    delete_video,
    get_discover_videos
)
from services.points import record_watch_session
from database import videos_collection

router = APIRouter(prefix="/api/videos", tags=["videos"])


@router.post("", response_model=Video)
async def add_video(
        video_data: VideoCreate,
        current_user: UserInDB = Depends(get_creator)
) -> Any:
    """
    Add a new video (creator only)
    """
    return await create_video(video_data, current_user)


@router.get("/my-videos", response_model=List[Video])
async def get_my_videos(
        skip: int = 0,
        limit: int = 100,
        current_user: UserInDB = Depends(get_creator)
) -> Any:
    """
    Get all videos by current creator
    """
    return await get_videos_by_creator(str(current_user.id), skip, limit)


@router.get("/discover", response_model=List[Video])
async def discover_videos(
        skip: int = 0,
        limit: int = 20
) -> Any:
    """
    Get videos for discovery feed
    """
    return await get_discover_videos(skip, limit)


@router.get("/{video_id}", response_model=Video)
async def get_video(
        video_id: str
) -> Any:
    """
    Get a specific video
    """
    video = await get_video_by_id(video_id)
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found"
        )
    return video


@router.put("/{video_id}", response_model=Video)
async def update_video_details(
        video_id: str,
        update_data: VideoUpdate,
        current_user: UserInDB = Depends(get_creator)
) -> Any:
    """
    Update video details (creator only)
    """
    update_dict = update_data.dict(exclude_unset=True)
    return await update_video(video_id, update_dict, current_user)


@router.delete("/{video_id}")
async def remove_video(
        video_id: str,
        current_user: UserInDB = Depends(get_creator)
) -> Dict[str, Any]:
    """
    Delete a video (creator only)
    """
    result = await delete_video(video_id, current_user)
    return {"success": result}


@router.post("/{video_id}/watch")
async def record_video_watch(
        video_id: str,
        watch_duration: int = Query(..., description="Watch duration in seconds"),
        current_user: UserInDB = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Record a video watch session and earn points (viewer only)
    
    Points awarded:
    - First-time viewers earn the video's specified points_per_minute rate for the first minute
    - All viewers earn 1 point per minute for continued watching
    - No points are awarded once the video is fully watched (95% completion)
    """
    if current_user.user_type != "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only viewers can earn points for watching videos"
        )

    view_record, points_earned, already_earned = await record_watch_session(
        video_id,
        str(current_user.id),
        watch_duration
    )

    return {
        "success": True,
        "points_earned": points_earned,
        "watch_duration": watch_duration,
        "stored_duration": getattr(view_record, "watch_duration", 0),
        "video_id": video_id,
        "video_duration": getattr(view_record, "video_duration", 0),
        "completion_percentage": min(100, round((watch_duration / getattr(view_record, "video_duration", 600)) * 100)) if getattr(view_record, "video_duration", 0) > 0 else 0,
        "already_earned": already_earned,
        "fully_watched": getattr(view_record, "fully_watched", False),
        "continuing_points": already_earned and points_earned > 0,
        "is_bonus_points": False,  # No longer using bonus points concept
        "bonus_rate": 1.0,  # Fixed 1 point per minute rate
        "total_points": getattr(view_record, "points_earned", 0),
        "record_id": str(getattr(view_record, "id", "")),
        "created_at": getattr(view_record, "created_at", None)
    }


@router.put("/{video_id}/duration", name="update_video_duration")
@router.put("/{video_id}/duration/", name="update_video_duration_slash")
async def update_video_duration(
        video_id: str,
        duration_seconds: int = Query(..., description="Video duration in seconds", gt=0),
        current_user: UserInDB = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Update the duration of a video
    This can be called by viewers who have the accurate duration from the YouTube player
    """
    print(f"===> DURATION UPDATE (PUT): video_id={video_id}, duration={duration_seconds}, user={current_user.username}")
    
    try:
        # Validate the ObjectId
        try:
            object_id = ObjectId(video_id)
            print(f"Valid ObjectId: {object_id}")
        except Exception as id_err:
            print(f"Invalid ObjectId: {video_id}, error: {id_err}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid video ID format: {video_id}"
            )
            
        # Get the video first to check if the duration is significantly different
        video = await get_video_by_id(video_id)
        if not video:
            print(f"Video not found: {video_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video not found"
            )
            
        current_duration = getattr(video, "duration_seconds", 0)
        print(f"Current duration: {current_duration}, New duration: {duration_seconds}")
        
        # Always update the duration when requested from the frontend
        # This ensures the video duration is accurate and up-to-date
        update_result = await videos_collection.update_one(
            {"_id": ObjectId(video_id)},
            {"$set": {"duration_seconds": duration_seconds}}
        )
        
        print(f"Duration updated successfully: {duration_seconds} seconds, modified={update_result.modified_count}")
        return {
            "success": True,
            "message": f"Duration updated from {current_duration} to {duration_seconds} seconds",
            "video_id": video_id,
            "duration_seconds": duration_seconds
        }
    except HTTPException as http_err:
        # Re-raise HTTP exceptions
        raise http_err
    except Exception as e:
        print(f"Error updating duration: {str(e)}")
        # Return a 200 response even on error, with error info in the response body
        # This helps frontend debugging while not breaking the flow
        return {
            "success": False,
            "message": str(e),
            "video_id": video_id,
            "duration_seconds": duration_seconds
        }


@router.post("/{video_id}/duration", name="update_video_duration_post")
@router.post("/{video_id}/duration/", name="update_video_duration_post_slash")
async def update_video_duration_post(
        video_id: str,
        duration_seconds: int = Query(..., description="Video duration in seconds", gt=0),
        current_user: UserInDB = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Update the duration of a video (POST alternative)
    This is an alternative to the PUT endpoint for clients that have issues with PUT requests
    """
    print(f"===> DURATION UPDATE (POST): video_id={video_id}, duration={duration_seconds}, user={current_user.username}")
    
    try:
        # Validate the ObjectId
        try:
            object_id = ObjectId(video_id)
            print(f"Valid ObjectId: {object_id}")
        except Exception as id_err:
            print(f"Invalid ObjectId: {video_id}, error: {id_err}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid video ID format: {video_id}"
            )
            
        # Get the video first to check if the duration is significantly different
        video = await get_video_by_id(video_id)
        if not video:
            print(f"Video not found: {video_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video not found"
            )
            
        current_duration = getattr(video, "duration_seconds", 0)
        print(f"Current duration: {current_duration}, New duration: {duration_seconds}")
        
        # Always update the duration when requested from the frontend
        # This ensures the video duration is accurate and up-to-date
        update_result = await videos_collection.update_one(
            {"_id": ObjectId(video_id)},
            {"$set": {"duration_seconds": duration_seconds}}
        )
        
        print(f"Duration updated successfully via POST: {duration_seconds} seconds, modified={update_result.modified_count}")
        return {
            "success": True,
            "message": f"Duration updated from {current_duration} to {duration_seconds} seconds (via POST)",
            "video_id": video_id,
            "duration_seconds": duration_seconds
        }
    except HTTPException as http_err:
        # Re-raise HTTP exceptions
        raise http_err
    except Exception as e:
        print(f"Error updating duration via POST: {str(e)}")
        # Return a 200 response even on error, with error info in the response body
        # This helps frontend debugging while not breaking the flow
        return {
            "success": False,
            "message": str(e),
            "video_id": video_id,
            "duration_seconds": duration_seconds
        }