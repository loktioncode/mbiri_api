from typing import Optional, List
from pydantic import BaseModel, Field, HttpUrl
from datetime import datetime
from bson import ObjectId
from models.user import PyObjectId


class VideoBase(BaseModel):
    youtube_id: str
    title: str
    description: Optional[str] = None
    points_per_minute: int = 10  # Default points per minute


class VideoCreate(VideoBase):
    pass


class VideoInDB(VideoBase):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    creator_id: PyObjectId
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {
            ObjectId: str
        }


class Video(VideoBase):
    id: PyObjectId = Field(alias="_id")
    creator_id: PyObjectId
    created_at: datetime
    youtube_url: HttpUrl = Field(None)

    def __init__(self, **data):
        super().__init__(**data)
        if self.youtube_id:
            self.youtube_url = f"https://www.youtube.com/watch?v={self.youtube_id}"

    class Config:
        populate_by_name = True
        json_encoders = {
            ObjectId: str
        }


class VideoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    points_per_minute: Optional[int] = None