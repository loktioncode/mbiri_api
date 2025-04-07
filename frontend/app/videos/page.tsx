'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PlayIcon, TrashIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Add types for the YouTube API
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

// Interface for videos
interface Video {
  id: string;
  youtube_id: string;
  title: string;
  description: string;
  creator_username: string;
  points_per_minute: number;
}

// Interface for watchlist items from localStorage
interface WatchlistItem {
  videoId: string;
  dateAdded: string;
  watched: boolean;
}

// Interface for watchlist items with video data
interface WatchlistItemWithVideo {
  watchlist_id: string; // using videoId as the ID
  video_id: string;
  watched: boolean;
  points_earned: boolean;
  added_at: string;
  video: Video;
}

// Local storage key - must match the one used in [id]/page.tsx
const WATCHLIST_KEY = 'mbiri_watchlist';

// Helper functions for localStorage
function getWatchlist(): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  const watchlist = localStorage.getItem(WATCHLIST_KEY);
  return watchlist ? JSON.parse(watchlist) : [];
}

function removeFromWatchlist(videoId: string) {
  const watchlist = getWatchlist();
  const updatedWatchlist = watchlist.filter(item => item.videoId !== videoId);
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updatedWatchlist));
}

// Function to fetch videos for items in the watchlist
async function fetchWatchlistVideos(videoIds: string[]): Promise<Record<string, Video>> {
  if (!videoIds.length) return {};
  
  try {
    // Fetch videos one by one
    const videos: Record<string, Video> = {};
    
    for (const id of videoIds) {
      try {
        const response = await api.get(`/api/videos/${id}`);
        videos[id] = response.data;
      } catch (error) {
        console.error(`Error fetching video ${id}:`, error);
      }
    }
    
    return videos;
  } catch (error) {
    console.error('Error fetching watchlist videos:', error);
    return {};
  }
}

export default function WatchLaterPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [watchlistWithVideos, setWatchlistWithVideos] = useState<WatchlistItemWithVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Use useEffect for navigation
  useEffect(() => {
    if (!user || user.user_type !== 'viewer') {
      router.push('/');
    }
  }, [user, router]);
  
  // Load YouTube API
  useEffect(() => {
    if (!window.YT && watchlistWithVideos.length > 0) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    }
  }, [watchlistWithVideos]);

  // Load watchlist data from localStorage
  useEffect(() => {
    async function loadWatchlistData() {
      if (!user || user.user_type !== 'viewer') return;
      
      setIsLoading(true);
      try {
        const watchlistItems = getWatchlist();
        
        if (watchlistItems.length === 0) {
          setWatchlistWithVideos([]);
          setIsLoading(false);
          return;
        }
        
        // Get all video IDs in the watchlist
        const videoIds = watchlistItems.map(item => item.videoId);
        
        // Fetch video data for all IDs
        const videosData = await fetchWatchlistVideos(videoIds);
        
        // Combine watchlist items with video data
        const watchlistWithVideoData = watchlistItems
          .filter(item => videosData[item.videoId]) // Only include items where we could fetch the video
          .map(item => ({
            watchlist_id: item.videoId, // Use videoId as the watchlist_id
            video_id: item.videoId,
            watched: item.watched,
            points_earned: false, // We don't track points earned in localStorage yet
            added_at: item.dateAdded,
            video: videosData[item.videoId]
          }));
        
        setWatchlistWithVideos(watchlistWithVideoData);
      } catch (error) {
        console.error('Error processing watchlist:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadWatchlistData();
  }, [user]);

  // Handle removing an item from the watchlist
  const handleRemoveFromWatchlist = (videoId: string) => {
    removeFromWatchlist(videoId);
    setWatchlistWithVideos(prev => prev.filter(item => item.video_id !== videoId));
  };

  // Don't render anything significant if we're redirecting
  if (!user || user.user_type !== 'viewer') {
    return <div className="flex h-96 items-center justify-center">Loading...</div>;
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  // Calculate potential earnings
  const totalPotentialPoints = watchlistWithVideos
    ?.filter(item => !item.points_earned)
    .reduce((total, item) => total + item.video.points_per_minute, 0) || 0;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Watch Later</h1>
        <div className="rounded-lg bg-indigo-100 px-4 py-2">
          <span className="text-sm text-indigo-800">
            Potential earnings: {totalPotentialPoints} points/min
          </span>
        </div>
      </div>

      {watchlistWithVideos.length === 0 ? (
        <div className="rounded-lg bg-gray-50 p-8 text-center">
          <p className="text-gray-600">Your watch later list is empty.</p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Discover videos →
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {watchlistWithVideos.map((item) => (
            <div
              key={item.watchlist_id}
              className={`group overflow-hidden rounded-lg bg-white shadow-lg transition-transform hover:scale-105 ${
                item.points_earned ? 'opacity-75' : ''
              }`}
            >
              <div className="relative h-48">
                {/* Video preview - autoplaying but muted */}
                <iframe
                  src={`https://www.youtube.com/embed/${item.video.youtube_id}?autoplay=1&mute=1&controls=0&modestbranding=1&showinfo=0&rel=0&loop=1&playlist=${item.video.youtube_id}&start=5&end=15`}
                  title={item.video.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  className="absolute inset-0 w-full h-full"
                ></iframe>
                
                {/* Click overlay to go to video page */}
                <Link href={`/videos/${item.video.id}`} className="absolute inset-0 z-10">
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors">
                    <div className="bg-indigo-600/80 hover:bg-indigo-700/90 rounded-full p-4 flex items-center justify-center transition-all">
                      <PlayIcon className="h-8 w-8 text-white" />
                    </div>
                  </div>
                </Link>
                
                {/* Watch full video label */}
                <div className="absolute bottom-8 left-0 right-0 flex justify-center z-20">
                  <div className="bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                    Click to watch full video
                  </div>
                </div>
                
                {/* Remove button */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRemoveFromWatchlist(item.video_id);
                  }}
                  className="absolute top-2 right-2 z-30 bg-white/80 hover:bg-white rounded-full p-1.5 text-gray-600 hover:text-red-500 shadow-md transition-colors"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4">
                <Link href={`/videos/${item.video.id}`}>
                  <h2 className="mb-2 text-base font-semibold text-gray-900 line-clamp-2 hover:text-indigo-600">
                    {item.video.title}
                  </h2>
                </Link>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    By {item.video.creator_username}
                  </span>
                  {item.points_earned ? (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs text-green-800">
                      Points earned
                    </span>
                  ) : (
                    <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs text-indigo-800">
                      Earn {item.video.points_per_minute} pts/min
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 