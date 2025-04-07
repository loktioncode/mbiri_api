from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from bson import ObjectId
from models.user import PyObjectId


class ViewRecord(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    video_id: PyObjectId
    viewer_id: PyObjectId
    watch_duration: int  # Duration in seconds
    video_duration: int = 0  # Total video duration in seconds
    fully_watched: bool = False
    points_earned: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {
            ObjectId: str
        }


class VideoAnalytics(BaseModel):
    video_id: PyObjectId
    total_views: int
    total_watch_time: int  # Total seconds watched
    average_watch_time: float  # Average seconds per view
    total_points_awarded: int
    viewers_count: int
    completion_rate: float  # Percentage of viewers who completed the video

    class Config:
        json_encoders = {
            ObjectId: str
        }


class ViewerPointsHistory(BaseModel):
    viewer_id: PyObjectId
    total_points: int
    videos_watched: int
    points_history: List[dict]  # List of {video_id, points, timestamp}

    class Config:
        json_encoders = {
            ObjectId: str
        }