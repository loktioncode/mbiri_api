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
    
    # Check if viewer has already watched the entire video
    existing_view = await views_collection.find_one({
        "video_id": ObjectId(video_id),
        "viewer_id": ObjectId(viewer_id)
    })
    
    fully_watched = False
    if existing_view and existing_view.get("watch_duration", 0) >= video_length:
        fully_watched = True
        return ViewRecord(**{
            "_id": str(existing_view["_id"]),
            "video_id": str(existing_view["video_id"]),
            "viewer_id": str(existing_view["viewer_id"]),
            "watch_duration": existing_view["watch_duration"],
            "points_earned": existing_view.get("points_earned", 0),
            "created_at": existing_view["created_at"],
            "fully_watched": True
        }), 0, True
        
    # Calculate base points - users need to watch at least a minute to earn anything
    points_earned = 0
    
    # Only proceed if sufficient watch time
    if watch_duration >= 60:  # 60 seconds = 1 minute
        points_per_minute = video.get("points_per_minute", DEFAULT_POINTS_PER_MINUTE)
        
        # Check if viewer has already earned points for this video
        if existing_view and existing_view.get("points_earned", 0) > 0:
            # Viewer already earned points - award at 10% rate for additional time
            previous_duration = existing_view.get("watch_duration", 0)
            
            # Only award points for additional time watched and if not fully watched
            if watch_duration > previous_duration and watch_duration < video_length:
                additional_minutes = (watch_duration - previous_duration) / 60
                # 10% of the points per minute for continued watching
                points_earned = int((points_per_minute * 0.1) * additional_minutes)
                
                # Update the existing record with the new duration and additional points
                if points_earned > 0:
                    previous_points = existing_view.get("points_earned", 0)
                    total_points = previous_points + points_earned
                    
                    # Update fully watched status if applicable
                    fully_watched = watch_duration >= video_length
                    
                    await views_collection.update_one(
                        {"_id": existing_view["_id"]},
                        {"$set": {
                            "watch_duration": watch_duration, 
                            "points_earned": total_points,
                            "fully_watched": fully_watched
                        }}
                    )
                    
                    # Update user's total points
                    await users_collection.update_one(
                        {"_id": ObjectId(viewer_id)},
                        {"$inc": {"points": points_earned}}
                    )
                    
                    # Return the updated record
                    updated_view = await views_collection.find_one({"_id": existing_view["_id"]})
                    if updated_view:
                        updated_view["_id"] = str(updated_view["_id"])
                        updated_view["video_id"] = str(updated_view["video_id"])
                        updated_view["viewer_id"] = str(updated_view["viewer_id"])
                        updated_view["fully_watched"] = fully_watched
                        
                        return ViewRecord(**updated_view), points_earned, True
            
            # If no additional points earned or no additional time watched
            existing_view["_id"] = str(existing_view["_id"])
            existing_view["video_id"] = str(existing_view["video_id"])
            existing_view["viewer_id"] = str(existing_view["viewer_id"])
            existing_view["fully_watched"] = watch_duration >= video_length
            
            # Update watch duration if it increased, even if no points awarded
            if watch_duration > existing_view.get("watch_duration", 0):
                await views_collection.update_one(
                    {"_id": ObjectId(existing_view["_id"])},
                    {"$set": {
                        "watch_duration": watch_duration,
                        "fully_watched": watch_duration >= video_length
                    }}
                )
            
            return ViewRecord(**existing_view), 0, True
        else:
            # First time viewer - award full points
            minutes_watched = watch_duration / 60
            points_earned = int(points_per_minute * minutes_watched)
            fully_watched = watch_duration >= video_length

    # Create new view record
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

    # Update viewer's points only if points were earned
    if points_earned > 0:
        await users_collection.update_one(
            {"_id": ObjectId(viewer_id)},
            {"$inc": {"points": points_earned}}
        )

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