from fastapi import APIRouter, Depends, HTTPException, status
from typing import Any, Dict, List

from models.user import UserInDB
from services.auth import get_current_user, get_creator
from services.analytics import (
    get_video_analytics,
    get_creator_analytics,
    get_trending_videos
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/videos/{video_id}")
async def video_analytics(
    video_id: str,
    current_user: UserInDB = Depends(get_creator)
) -> Dict[str, Any]:
    """
    Get analytics for a specific video (creator only)
    """
    return await get_video_analytics(video_id, str(current_user.id))

@router.get("/my-videos")
async def creator_analytics(
    current_user: UserInDB = Depends(get_creator)
) -> Dict[str, Any]:
    """
    Get aggregated analytics for all videos by current creator
    """
    return await get_creator_analytics(str(current_user.id))

@router.get("/trending")
async def trending_videos(
    limit: int = 10,
    current_user: UserInDB = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    Get trending videos based on recent views
    """
    return await get_trending_videos(limit)