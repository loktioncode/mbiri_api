from datetime import datetime
from typing import Dict, Any, Optional, Tuple
from bson import ObjectId
from fastapi import HTTPException, status

from database import users_collection, videos_collection, views_collection
from models.analytics import ViewRecord
from models.user import UserInDB
from config import DEFAULT_POINTS_PER_MINUTE


async def record_watch_session(
        video_id: str,
        viewer_id: str,
        watch_duration: int
) -> Tuple[ViewRecord, int, bool]:
    """
    Record a watch session and award points
    
    Points are awarded at full rate for first-time viewers who watch at least 1 minute.
    Viewers who have already earned points for this video can earn additional points at 10% rate.
    No points are awarded when the video is fully watched.
    
    This function will always update the existing record if one exists,
    rather than creating multiple records for the same user/video.
    """
    # Validate video exists
    video = await videos_collection.find_one({"_id": ObjectId(video_id)})
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found"
        )

    # Validate viewer exists
    viewer = await users_collection.find_one({"_id": ObjectId(viewer_id)})
    if not viewer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viewer not found"
        )

    # Check if user is a viewer
    if viewer.get("user_type") != "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only viewers can earn points"
        )
    
    # Get video length (defaults to 10 minutes = 600 seconds if not specified)
    video_length = video.get("duration_seconds", 600)
    
    # Check if viewer has already watched the video (any amount)
    existing_view = await views_collection.find_one({
        "video_id": ObjectId(video_id),
        "viewer_id": ObjectId(viewer_id)
    })
    
    # If video is fully watched, no more points can be earned
    if existing_view and existing_view.get("fully_watched", False):
        return ViewRecord(**{
            "_id": str(existing_view["_id"]),
            "video_id": str(existing_view["video_id"]),
            "viewer_id": str(existing_view["viewer_id"]),
            "watch_duration": existing_view["watch_duration"],
            "points_earned": existing_view.get("points_earned", 0),
            "created_at": existing_view["created_at"],
            "fully_watched": True
        }), 0, True
    
    fully_watched = watch_duration >= video_length
    points_earned = 0
    already_earned = existing_view is not None and existing_view.get("points_earned", 0) > 0
    
    # Calculate points earned in this session
    if watch_duration >= 60:  # Must watch at least 1 minute
        points_per_minute = video.get("points_per_minute", DEFAULT_POINTS_PER_MINUTE)
        
        if existing_view:
            # Get previous watch duration
            previous_duration = existing_view.get("watch_duration", 0)
            
            # Only award points for additional time if more time was watched
            if watch_duration > previous_duration and not fully_watched:
                additional_minutes = (watch_duration - previous_duration) / 60
                
                # If they've earned points before, award at 10% rate
                if already_earned:
                    # 10% of the points per minute for continued watching
                    points_earned = int((points_per_minute * 0.1) * additional_minutes)
                else:
                    # First time earning points - award full rate
                    minutes_watched = watch_duration / 60
                    points_earned = int(points_per_minute * minutes_watched)
        else:
            # First time watching - award full points
            minutes_watched = watch_duration / 60
            points_earned = int(points_per_minute * minutes_watched)
    
    # Update user's total points if points were earned
    if points_earned > 0:
        await users_collection.update_one(
            {"_id": ObjectId(viewer_id)},
            {"$inc": {"points": points_earned}}
        )
    
    # Now handle record creation or update
    if existing_view:
        # Always update the existing record with the latest watch time
        # and increment points_earned if applicable
        total_points = existing_view.get("points_earned", 0) + points_earned
        
        update_fields = {
            "watch_duration": max(watch_duration, existing_view.get("watch_duration", 0)),
            "fully_watched": fully_watched
        }
        
        # Only update points if new points were earned
        if points_earned > 0:
            update_fields["points_earned"] = total_points
        
        # Update the record
        await views_collection.update_one(
            {"_id": existing_view["_id"]},
            {"$set": update_fields}
        )
        
        # Get the updated record
        updated_view = await views_collection.find_one({"_id": existing_view["_id"]})
        if updated_view:
            updated_view["_id"] = str(updated_view["_id"])
            updated_view["video_id"] = str(updated_view["video_id"])
            updated_view["viewer_id"] = str(updated_view["viewer_id"])
            return ViewRecord(**updated_view), points_earned, already_earned
        
        # Fallback to existing view if we can't get the updated one
        existing_view["_id"] = str(existing_view["_id"])
        existing_view["video_id"] = str(existing_view["video_id"])
        existing_view["viewer_id"] = str(existing_view["viewer_id"])
        existing_view["watch_duration"] = max(watch_duration, existing_view.get("watch_duration", 0))
        existing_view["points_earned"] = total_points if points_earned > 0 else existing_view.get("points_earned", 0)
        existing_view["fully_watched"] = fully_watched
        return ViewRecord(**existing_view), points_earned, already_earned
    else:
        # Create new view record for first-time viewers
        view_record = {
            "video_id": ObjectId(video_id),
            "viewer_id": ObjectId(viewer_id),
            "watch_duration": watch_duration,
            "points_earned": points_earned,
            "created_at": datetime.utcnow(),
            "fully_watched": fully_watched
        }

        # Insert view record
        result = await views_collection.insert_one(view_record)
        view_record["_id"] = str(result.inserted_id)
        view_record["video_id"] = str(view_record["video_id"])
        view_record["viewer_id"] = str(view_record["viewer_id"])

        return ViewRecord(**view_record), points_earned, False  # False indicates first time earning


async def get_user_points(user_id: str) -> Dict[str, Any]:
    """
    Get a user's points and point history
    """
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Get view history
    cursor = views_collection.find({"viewer_id": ObjectId(user_id)})
    view_history = []
    async for view in cursor:
        view["_id"] = str(view["_id"])
        view["video_id"] = str(view["video_id"])
        view["viewer_id"] = str(view["viewer_id"])
        view_history.append(view)

    return {
        "total_points": user.get("points", 0),
        "view_history": view_history
    }


async def transfer_points(creator_id: str, points: int, recipient_id: str) -> bool:
    """
    Transfer points from creator to recipient
    """
    # Validate creator exists and has enough points
    creator = await users_collection.find_one({"_id": ObjectId(creator_id)})
    if not creator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Creator not found"
        )

    if creator.get("points", 0) < points:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient points"
        )

    # Validate recipient exists
    recipient = await users_collection.find_one({"_id": ObjectId(recipient_id)})
    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipient not found"
        )

    # Perform transfer
    await users_collection.update_one(
        {"_id": ObjectId(creator_id)},
        {"$inc": {"points": -points}}
    )

    await users_collection.update_one(
        {"_id": ObjectId(recipient_id)},
        {"$inc": {"points": points}}
    )

    return True