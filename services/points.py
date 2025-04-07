import logging
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
from bson import ObjectId
from fastapi import HTTPException, status

from database import users_collection, videos_collection, views_collection
from models.analytics import ViewRecord
from models.user import UserInDB
from config import DEFAULT_POINTS_PER_MINUTE

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def record_watch_session(
        video_id: str,
        viewer_id: str,
        watch_duration: int
) -> Tuple[ViewRecord, int, bool]:
    """
    Record a watch session and award points
    
    Points are awarded at video's rate for first-time viewers for first minute,
    and at 1 point per minute for continued watching.
    No points are awarded when the video is fully watched.
    
    This function will always update the existing record if one exists,
    rather than creating multiple records for the same user/video.
    """
    logger.info(f"Recording watch session: video_id={video_id}, viewer_id={viewer_id}, watch_duration={watch_duration}")
    
    # Validate video exists
    video = await videos_collection.find_one({"_id": ObjectId(video_id)})
    if not video:
        logger.error(f"Video not found: {video_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found"
        )

    # Validate viewer exists
    viewer = await users_collection.find_one({"_id": ObjectId(viewer_id)})
    if not viewer:
        logger.error(f"Viewer not found: {viewer_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viewer not found"
        )

    # Check if user is a viewer
    if viewer.get("user_type") != "viewer":
        logger.error(f"Non-viewer user attempted to earn points: {viewer_id}, type={viewer.get('user_type')}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only viewers can earn points"
        )
    
    # Get video length (defaults to 10 minutes = 600 seconds if not specified)
    video_length = video.get("duration_seconds", 600)
    logger.info(f"Video length: {video_length} seconds")
    
    # Check if viewer has already watched the video (any amount)
    existing_view = await views_collection.find_one({
        "video_id": ObjectId(video_id),
        "viewer_id": ObjectId(viewer_id)
    })
    
    logger.info(f"Existing view record found: {existing_view is not None}")
    if existing_view:
        logger.info(f"Existing view details: duration={existing_view.get('watch_duration', 0)}, "
                    f"fully_watched={existing_view.get('fully_watched', False)}, "
                    f"points_earned={existing_view.get('points_earned', 0)}")
        logger.info(f"Raw existing view: {existing_view}")
    
    # If video is fully watched, no more points can be earned
    if existing_view and existing_view.get("fully_watched", False):
        logger.info("Video is already fully watched, no more points will be earned")
        return ViewRecord(**{
            "_id": str(existing_view["_id"]),
            "video_id": str(existing_view["video_id"]),
            "viewer_id": str(existing_view["viewer_id"]),
            "watch_duration": existing_view["watch_duration"],
            "video_duration": existing_view.get("video_duration", video_length),
            "points_earned": existing_view.get("points_earned", 0),
            "created_at": existing_view["created_at"],
            "fully_watched": True
        }), 0, True
    
    # Use video_duration from view record if available, otherwise use from video
    record_video_length = existing_view.get("video_duration", video_length) if existing_view else video_length
    
    # If the reported watch duration is very small (< 10 seconds), this might be an initial
    # request to store the video duration. In this case, we prioritize using the video's 
    # duration_seconds value from the database, which may have been updated by the frontend.
    if watch_duration < 10 and video.get("duration_seconds", 0) > 0:
        # Update our record_video_length to use the most accurate video duration
        record_video_length = video.get("duration_seconds")
        logger.info(f"Using video duration from database: {record_video_length} seconds (initial report)")
    
    # A video is fully watched if watch_duration is at least 95% of the video_duration
    fully_watched = watch_duration >= min(video_length, int(record_video_length * 0.95))
    
    logger.info(f"Fully watched: {fully_watched} (watched {watch_duration} of {record_video_length} seconds, "
                f"threshold: {int(record_video_length * 0.95)} seconds (95%))")
    
    points_earned = 0
    already_earned = existing_view is not None and existing_view.get("points_earned", 0) > 0
    logger.info(f"Already earned points: {already_earned}")
    
    # Calculate points earned in this session
    if watch_duration >= 60:  # Must watch at least 1 minute
        # Get the video's specified points_per_minute rate (for first minute/first-time watchers)
        video_points_per_minute = video.get("points_per_minute", DEFAULT_POINTS_PER_MINUTE)
        logger.info(f"Video points per minute: {video_points_per_minute}")
        
        # Fixed at 1 point per minute for continued watching
        continued_points_per_minute = 1
        logger.info(f"Continued points per minute: {continued_points_per_minute}")
        
        if existing_view:
            # Get previous watch duration
            previous_duration = existing_view.get("watch_duration", 0)
            logger.info(f"Previous watch duration: {previous_duration} seconds")
            
            # Only award points for additional time if more time was watched
            if watch_duration > previous_duration and not fully_watched:
                additional_seconds = watch_duration - previous_duration
                additional_minutes = additional_seconds / 60.0  # Use floating point for more precise calculation
                logger.info(f"Additional time watched: {additional_seconds} seconds = {additional_minutes:.2f} minutes")
                
                # Check if we should award points for continued watching
                if already_earned:
                    # If the user has already earned their first points, and video_duration is more than watch_duration,
                    # award 1 point per minute check (UI calls this every minute)
                    if video_length > watch_duration:
                        # Award 1 point for this minute check, since the UI calls this every minute
                        points_earned = 1
                        logger.info(f"CALCULATION: Awarding 1 point for this minute check (already earned first minute points)")
                        logger.info(f"Awarding points: {points_earned} point for continued watching")
                    else:
                        logger.info(f"No points awarded: video_length ({video_length}) not greater than watch_duration ({watch_duration})")
                        points_earned = 0
                else:
                    # Award 1 point per minute for continued watching (this handles if they haven't earned points yet)
                    points_earned = int(continued_points_per_minute * additional_minutes)
                    logger.info(f"CALCULATION: continued_points_per_minute ({continued_points_per_minute}) * additional_minutes ({additional_minutes:.2f}) = {points_earned}")
                    logger.info(f"Awarding points: {points_earned} points for {additional_minutes:.2f} additional minutes")
            else:
                logger.info(f"No additional time watched or video fully watched. "
                            f"Current: {watch_duration}, Previous: {previous_duration}, Fully watched: {fully_watched}")
        else:
            # First time watching - award video's specified points for first minute, then 1 point per minute after that
            minutes_watched = watch_duration / 60.0
            logger.info(f"First time watching - minutes watched: {minutes_watched:.2f}")
            logger.info(f"Watch duration: {watch_duration} seconds, Video points per minute: {video_points_per_minute}")
            
            if minutes_watched < 1:
                # Less than one minute - award video's specified points rate
                points_earned = int(video_points_per_minute * minutes_watched)
                logger.info(f"CALCULATION: video_points_per_minute ({video_points_per_minute}) * minutes_watched ({minutes_watched:.2f}) = {points_earned}")
                logger.info(f"First-time viewer, first minute: awarding {points_earned} points at rate of {video_points_per_minute} for {minutes_watched:.2f} minutes")
            else:
                # One minute or more - award video's points for first minute plus 1 point per additional minute
                first_minute_points = video_points_per_minute
                additional_minutes = minutes_watched - 1
                additional_points = int(continued_points_per_minute * additional_minutes)
                points_earned = first_minute_points + additional_points
                logger.info(f"CALCULATION: first_minute_points ({first_minute_points}) + additional_points ({additional_points}) = {points_earned}")
                logger.info(f"First-time viewer: awarding {first_minute_points} points for first minute plus {additional_points} points for {additional_minutes:.2f} additional minutes, total: {points_earned}")
    else:
        logger.info(f"Not enough watch time to earn points: {watch_duration} seconds (need 60 seconds)")
    
    # Update user's total points if points were earned
    if points_earned > 0:
        logger.info(f"Updating user points: +{points_earned} points")
        update_result = await users_collection.update_one(
            {"_id": ObjectId(viewer_id)},
            {"$inc": {"points": points_earned}}
        )
        logger.info(f"User points update result: modified_count={update_result.modified_count}, matched_count={update_result.matched_count}")
        
        # Double-check user points were updated
        updated_user = await users_collection.find_one({"_id": ObjectId(viewer_id)})
        if updated_user:
            logger.info(f"User points after update: {updated_user.get('points', 0)}")
    
    # Now handle record creation or update
    if existing_view:
        # Always update the existing record with the latest watch time
        # and increment points_earned if applicable
        total_points = existing_view.get("points_earned", 0) + points_earned
        logger.info(f"Updating existing record: existing={existing_view.get('points_earned', 0)}, "
                    f"new={points_earned}, total={total_points}")
        
        update_fields = {
            "watch_duration": max(watch_duration, existing_view.get("watch_duration", 0)),
            "fully_watched": fully_watched,
            "video_duration": record_video_length  # Store the current known video length
        }
        
        # Only update points if new points were earned
        if points_earned > 0:
            update_fields["points_earned"] = total_points
        
        # Update the record
        logger.info(f"Updating view record: {update_fields}")
        update_result = await views_collection.update_one(
            {"_id": existing_view["_id"]},
            {"$set": update_fields}
        )
        logger.info(f"View record update result: modified_count={update_result.modified_count}, matched_count={update_result.matched_count}")
        
        # Get the updated record
        updated_view = await views_collection.find_one({"_id": existing_view["_id"]})
        if updated_view:
            updated_view["_id"] = str(updated_view["_id"])
            updated_view["video_id"] = str(updated_view["video_id"])
            updated_view["viewer_id"] = str(updated_view["viewer_id"])
            logger.info(f"Returning updated view record: {updated_view}")
            return ViewRecord(**updated_view), points_earned, already_earned
        
        # Fallback to existing view if we can't get the updated one
        existing_view["_id"] = str(existing_view["_id"])
        existing_view["video_id"] = str(existing_view["video_id"])
        existing_view["viewer_id"] = str(existing_view["viewer_id"])
        existing_view["watch_duration"] = max(watch_duration, existing_view.get("watch_duration", 0))
        existing_view["points_earned"] = total_points if points_earned > 0 else existing_view.get("points_earned", 0)
        existing_view["fully_watched"] = fully_watched
        logger.info(f"Returning fallback view record: {existing_view}")
        return ViewRecord(**existing_view), points_earned, already_earned
    else:
        # Create new view record for first-time viewers
        view_record = {
            "video_id": ObjectId(video_id),
            "viewer_id": ObjectId(viewer_id),
            "watch_duration": watch_duration,
            "video_duration": record_video_length,  # Store the video duration
            "points_earned": points_earned,
            "created_at": datetime.utcnow(),
            "fully_watched": fully_watched
        }

        # Attempt to create new record with upsert to handle potential race condition
        # This ensures we don't create duplicate records even if multiple requests come in at once
        logger.info(f"Creating or updating view record: {view_record}")
        try:
            # Try to use upsert to safely handle potential duplicate records
            result = await views_collection.update_one(
                {
                    "video_id": ObjectId(video_id),
                    "viewer_id": ObjectId(viewer_id)
                },
                {"$set": view_record},
                upsert=True
            )
            logger.info(f"View record creation result: modified_count={result.modified_count}, matched_count={result.matched_count}, upserted_id={result.upserted_id}")
            
            # If we didn't upsert, get the ID from the result
            if result.upserted_id:
                view_record["_id"] = result.upserted_id
            else:
                # If it was an update, we need to find the record to get its ID
                updated_record = await views_collection.find_one({
                    "video_id": ObjectId(video_id),
                    "viewer_id": ObjectId(viewer_id)
                })
                if updated_record:
                    view_record["_id"] = updated_record["_id"]
        
        except Exception as e:
            logger.error(f"Error creating view record: {e}")
            # If we encounter an error, try to get the existing record
            existing_record = await views_collection.find_one({
                "video_id": ObjectId(video_id),
                "viewer_id": ObjectId(viewer_id)
            })
            
            if existing_record:
                logger.info(f"Found existing record after error: {existing_record}")
                # If we found an existing record, use that instead
                existing_record["_id"] = str(existing_record["_id"])
                existing_record["video_id"] = str(existing_record["video_id"])
                existing_record["viewer_id"] = str(existing_record["viewer_id"])
                return ViewRecord(**existing_record), points_earned, False
            else:
                # Re-raise the error if we couldn't find an existing record
                raise
        
        # Convert ObjectId to string for response
        view_record["_id"] = str(view_record["_id"])
        view_record["video_id"] = str(view_record["video_id"])
        view_record["viewer_id"] = str(view_record["viewer_id"])

        logger.info(f"Returning new view record: {view_record}")
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