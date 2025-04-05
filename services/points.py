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
) -> Tuple[ViewRecord, int]:
    """
    Record a watch session and award points
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

    # Calculate points earned
    points_per_minute = video.get("points_per_minute", DEFAULT_POINTS_PER_MINUTE)
    minutes_watched = watch_duration / 60
    points_earned = int(points_per_minute * minutes_watched)

    # Create view record
    view_record = {
        "video_id": ObjectId(video_id),
        "viewer_id": ObjectId(viewer_id),
        "watch_duration": watch_duration,
        "points_earned": points_earned,
        "created_at": datetime.utcnow()
    }

    # Insert view record
    result = await views_collection.insert_one(view_record)
    view_record["_id"] = str(result.inserted_id)
    view_record["video_id"] = str(view_record["video_id"])
    view_record["viewer_id"] = str(view_record["viewer_id"])

    # Update viewer's points
    await users_collection.update_one(
        {"_id": ObjectId(viewer_id)},
        {"$inc": {"points": points_earned}}
    )

    return ViewRecord(**view_record), points_earned


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