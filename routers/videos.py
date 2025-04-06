from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Any, Dict, List

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
    """
    if current_user.user_type != "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only viewers can earn points for watching videos"
        )

    view_record, points_earned = await record_watch_session(
        video_id,
        str(current_user.id),
        watch_duration
    )

    return {
        "success": True,
        "points_earned": points_earned,
        "watch_duration": watch_duration,
        "video_id": video_id
    }