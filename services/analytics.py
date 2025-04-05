from typing import Dict, List, Any
from datetime import datetime, timedelta
from bson import ObjectId
from fastapi import HTTPException, status

from database import videos_collection, views_collection, users_collection
from models.analytics import VideoAnalytics


async def get_video_analytics(video_id: str, creator_id: str) -> Dict[str, Any]:
    """
    Get analytics for a specific video

    Args:
        video_id: ID of the video
        creator_id: ID of the creator (for authorization)

    Returns:
        Dictionary of analytics data
    """
    # Validate video exists
    video = await videos_collection.find_one({"_id": ObjectId(video_id)})
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found"
        )

    # Check ownership
    if str(video["creator_id"]) != creator_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view analytics for this video"
        )

    # Get view records
    views = []
    cursor = views_collection.find({"video_id": ObjectId(video_id)})
    async for view in cursor:
        views.append(view)

    # Calculate analytics
    total_views = len(views)
    total_watch_time = sum(view["watch_duration"] for view in views)
    average_watch_time = total_watch_time / total_views if total_views > 0 else 0
    total_points_awarded = sum(view["points_earned"] for view in views)

    # Get unique viewers
    unique_viewers = set(str(view["viewer_id"]) for view in views)
    viewers_count = len(unique_viewers)

    # Get viewer demographics
    viewer_data = []
    for viewer_id in unique_viewers:
        viewer = await users_collection.find_one({"_id": ObjectId(viewer_id)})
        if viewer:
            viewer_data.append({
                "id": str(viewer["_id"]),
                "username": viewer["username"],
                "watch_time": sum(view["watch_duration"] for view in views if str(view["viewer_id"]) == viewer_id),
                "points_earned": sum(view["points_earned"] for view in views if str(view["viewer_id"]) == viewer_id)
            })

    # Time-based trends (views by day)
    time_trends = {}
    for view in views:
        date_str = view["created_at"].date().isoformat()
        if date_str not in time_trends:
            time_trends[date_str] = {
                "views": 0,
                "watch_time": 0,
                "points": 0
            }
        time_trends[date_str]["views"] += 1
        time_trends[date_str]["watch_time"] += view["watch_duration"]
        time_trends[date_str]["points"] += view["points_earned"]

    # Format time trends for response
    time_trends_list = [
        {
            "date": date,
            "views": data["views"],
            "watch_time": data["watch_time"],
            "points": data["points"]
        }
        for date, data in time_trends.items()
    ]

    # Sort by date
    time_trends_list.sort(key=lambda x: x["date"])

    return {
        "video_id": str(video["_id"]),
        "title": video["title"],
        "total_views": total_views,
        "total_watch_time": total_watch_time,
        "average_watch_time": average_watch_time,
        "total_points_awarded": total_points_awarded,
        "viewers_count": viewers_count,
        "viewer_data": viewer_data,
        "time_trends": time_trends_list
    }


async def get_creator_analytics(creator_id: str) -> Dict[str, Any]:
    """
    Get aggregated analytics for all videos by a creator

    Args:
        creator_id: ID of the creator

    Returns:
        Dictionary of analytics data
    """
    # Get all videos by creator
    videos = []
    cursor = videos_collection.find({"creator_id": ObjectId(creator_id)})
    async for video in cursor:
        videos.append(video)

    if not videos:
        return {
            "creator_id": creator_id,
            "total_videos": 0,
            "total_views": 0,
            "total_watch_time": 0,
            "total_points_awarded": 0,
            "videos_analytics": []
        }

    # Initialize analytics data
    videos_analytics = []
    total_views = 0
    total_watch_time = 0
    total_points_awarded = 0

    # Process each video
    for video in videos:
        video_id = str(video["_id"])

        # Get views for this video
        video_views = []
        views_cursor = views_collection.find({"video_id": video["_id"]})
        async for view in views_cursor:
            video_views.append(view)

        # Calculate video-specific analytics
        video_total_views = len(video_views)
        video_watch_time = sum(view["watch_duration"] for view in video_views)
        video_avg_watch_time = video_watch_time / video_total_views if video_total_views > 0 else 0
        video_points = sum(view["points_earned"] for view in video_views)

        # Add to totals
        total_views += video_total_views
        total_watch_time += video_watch_time
        total_points_awarded += video_points

        # Add video analytics
        videos_analytics.append({
            "video_id": video_id,
            "title": video["title"],
            "total_views": video_total_views,
            "total_watch_time": video_watch_time,
            "average_watch_time": video_avg_watch_time,
            "total_points_awarded": video_points,
            "created_at": video["created_at"]
        })

    # Sort videos by most viewed
    videos_analytics.sort(key=lambda x: x["total_views"], reverse=True)

    return {
        "creator_id": creator_id,
        "total_videos": len(videos),
        "total_views": total_views,
        "total_watch_time": total_watch_time,
        "total_points_awarded": total_points_awarded,
        "videos_analytics": videos_analytics
    }


async def get_trending_videos(limit: int = 10) -> List[Dict[str, Any]]:
    """
    Get trending videos based on recent views

    Args:
        limit: Maximum number of videos to return

    Returns:
        List of trending videos with analytics
    """
    # Get recent views (within the last 7 days)
    one_week_ago = datetime.utcnow() - timedelta(days=7)

    # Get all views within the time period
    recent_views = []
    cursor = views_collection.find({"created_at": {"$gte": one_week_ago}})
    async for view in cursor:
        recent_views.append(view)

    # Count views per video
    video_view_counts = {}
    for view in recent_views:
        video_id = str(view["video_id"])
        if video_id not in video_view_counts:
            video_view_counts[video_id] = {
                "views": 0,
                "watch_time": 0,
                "points": 0
            }
        video_view_counts[video_id]["views"] += 1
        video_view_counts[video_id]["watch_time"] += view["watch_duration"]
        video_view_counts[video_id]["points"] += view["points_earned"]

    # Sort videos by view count
    sorted_videos = sorted(
        video_view_counts.items(),
        key=lambda x: x[1]["views"],
        reverse=True
    )[:limit]

    # Get video details
    trending_videos = []
    for video_id, stats in sorted_videos:
        video = await videos_collection.find_one({"_id": ObjectId(video_id)})
        if video:
            creator = await users_collection.find_one({"_id": video["creator_id"]})
            creator_name = creator["username"] if creator else "Unknown"

            trending_videos.append({
                "video_id": video_id,
                "title": video["title"],
                "youtube_id": video["youtube_id"],
                "creator_id": str(video["creator_id"]),
                "creator_name": creator_name,
                "recent_views": stats["views"],
                "recent_watch_time": stats["watch_time"],
                "recent_points": stats["points"],
                "created_at": video["created_at"]
            })

    return trending_videos