'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { BookmarkIcon, BookmarkSlashIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEffect, useState } from 'react';

interface Video {
  id: string;
  youtube_id: string;
  title: string;
  description: string;
  creator_username: string;
  points_per_minute: number;
}

interface WatchlistItem {
  videoId: string;
  dateAdded: string;
  watched: boolean;
}

// Local storage key
const WATCHLIST_KEY = 'mbiri_watchlist';

// Helper functions for localStorage
function getWatchlist(): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  const watchlist = localStorage.getItem(WATCHLIST_KEY);
  return watchlist ? JSON.parse(watchlist) : [];
}

function addToWatchlist(videoId: string) {
  const watchlist = getWatchlist();
  const newItem: WatchlistItem = {
    videoId,
    dateAdded: new Date().toISOString(),
    watched: false
  };
  const updatedWatchlist = [...watchlist, newItem];
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updatedWatchlist));
  return newItem;
}

function removeFromWatchlist(videoId: string) {
  const watchlist = getWatchlist();
  const updatedWatchlist = watchlist.filter(item => item.videoId !== videoId);
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updatedWatchlist));
}

async function fetchVideo(id: string) {
  const response = await api.get(`/api/videos/${id}`);
  return response.data;
}

export default function VideoPage() {
  const params = useParams();
  const videoId = params.id as string;
  const { user } = useAuth();
  const [watchlistItem, setWatchlistItem] = useState<WatchlistItem | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: video, isLoading: videoLoading } = useQuery<Video>({
    queryKey: ['video', videoId],
    queryFn: () => fetchVideo(videoId),
  });

  // Load watchlist item from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && user?.user_type === 'viewer') {
      const watchlist = getWatchlist();
      const item = watchlist.find(item => item.videoId === videoId);
      setWatchlistItem(item || null);
    }
  }, [videoId, user]);

  const handleWatchLaterClick = () => {
    if (!user || user.user_type !== 'viewer') return;
    
    setIsUpdating(true);
    try {
      if (watchlistItem) {
        removeFromWatchlist(videoId);
        setWatchlistItem(null);
      } else {
        const newItem = addToWatchlist(videoId);
        setWatchlistItem(newItem);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  if (videoLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-800">
        Video not found
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="aspect-video overflow-hidden rounded-lg bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${video.youtube_id}`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>

      <div className="mt-6 rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{video.title}</h1>
            <p className="mt-1 text-sm text-gray-500">By {video.creator_username}</p>
          </div>

          {user?.user_type === 'viewer' && (
            <button
              onClick={handleWatchLaterClick}
              disabled={isUpdating}
              className={`flex items-center rounded-lg px-4 py-2 text-sm font-medium ${
                watchlistItem
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {watchlistItem ? (
                <>
                  <BookmarkSlashIcon className="mr-2 h-5 w-5" />
                  Remove from Watch Later
                </>
              ) : (
                <>
                  <BookmarkIcon className="mr-2 h-5 w-5" />
                  Add to Watch Later
                </>
              )}
            </button>
          )}
        </div>

        <p className="mb-6 text-gray-600">{video.description}</p>

        <div className="border-t border-gray-200 pt-4">
          {user?.user_type === 'viewer' ? (
            <div className="flex items-center text-indigo-600">
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm">
                Earn {video.points_per_minute} points/min watching this video
              </span>
              {watchlistItem?.watched && (
                <span className="ml-3 text-sm text-green-600">
                  ✓ Watched
                </span>
              )}
            </div>
          ) : !user && (
            <div className="text-sm text-gray-500">
              Sign up as a viewer to earn {video.points_per_minute} points/min watching this video
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 