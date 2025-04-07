from typing import List, Optional
from bson import ObjectId
from fastapi import HTTPException, status
from datetime import datetime

from database import videos_collection, users_collection
from models.video import VideoCreate, VideoInDB, Video
from models.user import UserInDB


async def create_video(video_data: VideoCreate, creator: UserInDB) -> Video:
    """
    Create a new video entry for a creator
    """
    # Verify user is a creator
    if creator.user_type != "creator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only creators can add videos"
        )

    # Extract YouTube ID from URL if full URL is provided
    youtube_id = video_data.youtube_id
    if "youtube.com" in youtube_id or "youtu.be" in youtube_id:
        # Extract ID from URL
        if "v=" in youtube_id:
            youtube_id = youtube_id.split("v=")[1].split("&")[0]
        elif "youtu.be/" in youtube_id:
            youtube_id = youtube_id.split("youtu.be/")[1].split("?")[0]

    # Check if video already exists
    existing_video = await videos_collection.find_one({"youtube_id": youtube_id})
    if existing_video:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This YouTube video has already been added"
        )

    # Create new video document
    video_dict = video_data.dict()
    video_dict["youtube_id"] = youtube_id
    video_dict["creator_id"] = ObjectId(creator.id)
    video_dict["created_at"] = datetime.utcnow()
    
    # Insert into database
    result = await videos_collection.insert_one(video_dict)
    
    # Return complete video object
    created_video = await videos_collection.find_one({"_id": result.inserted_id})
    if created_video:
        created_video["_id"] = str(created_video["_id"])
        created_video["creator_id"] = str(created_video["creator_id"])
    return Video(**created_video)


async def get_videos_by_creator(creator_id: str, skip: int = 0, limit: int = 100) -> List[Video]:
    """
    Get all videos uploaded by a specific creator
    """
    videos = []
    creator_object_id = ObjectId(creator_id)
    cursor = videos_collection.find({"creator_id": creator_object_id}).skip(skip).limit(limit)

    async for video in cursor:
        if not video or not video.get("_id"):
            continue
            
        video["_id"] = str(video["_id"])
        video["creator_id"] = str(video["creator_id"])
        video["created_at"] = video.get("created_at", datetime.utcnow())
        video["points_per_minute"] = video.get("points_per_minute", 10)
            
        videos.append(Video(**video))

    return videos


async def get_video_by_id(video_id: str) -> Optional[Video]:
    """
    Get a specific video by ID
    """
    video = await videos_collection.find_one({"_id": ObjectId(video_id)})
    if not video:
        return None
        
    video["_id"] = str(video["_id"])
    video["creator_id"] = str(video["creator_id"])
    video["created_at"] = video.get("created_at", datetime.utcnow())
    video["points_per_minute"] = video.get("points_per_minute", 10)
    
    return Video(**video)


async def update_video(video_id: str, update_data: dict, current_user: UserInDB) -> Video:
    """
    Update video details
    """
    video = await videos_collection.find_one({"_id": ObjectId(video_id)})
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found"
        )

    if str(video["creator_id"]) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this video"
        )

    await videos_collection.update_one(
        {"_id": ObjectId(video_id)},
        {"$set": update_data}
    )

    updated_video = await videos_collection.find_one({"_id": ObjectId(video_id)})
    updated_video["_id"] = str(updated_video["_id"])
    updated_video["creator_id"] = str(updated_video["creator_id"])
    
    return Video(**updated_video)


async def delete_video(video_id: str, current_user: UserInDB) -> bool:
    """
    Delete a video
    """
    video = await videos_collection.find_one({"_id": ObjectId(video_id)})
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found"
        )

    if str(video["creator_id"]) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this video"
        )

    result = await videos_collection.delete_one({"_id": ObjectId(video_id)})
    return result.deleted_count > 0


async def get_discover_videos(skip: int = 0, limit: int = 20) -> List[Video]:
    """
    Get videos for discovery feed
    """
    videos = []
    cursor = videos_collection.find().sort("created_at", -1).skip(skip).limit(limit)

    async for video in cursor:
        if not video or not video.get("_id"):
            continue
            
        # Convert ObjectIds to strings
        video["_id"] = str(video["_id"])
        video["creator_id"] = str(video.get("creator_id", ""))
        
        # Ensure required fields
        video["created_at"] = video.get("created_at", datetime.utcnow())
        video["points_per_minute"] = video.get("points_per_minute", 10)
        
        # Add creator username
        if video["creator_id"]:
            creator = await users_collection.find_one({"_id": ObjectId(video["creator_id"])})
            video["creator_username"] = creator.get("username", "Unknown") if creator else "Unknown"
        else:
            video["creator_username"] = "Unknown"
            
        videos.append(Video(**video))

    return videos