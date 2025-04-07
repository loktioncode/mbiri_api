'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PlayIcon } from '@heroicons/react/24/solid';
import { UserPlusIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEffect } from 'react';

interface Video {
  _id: string;
  youtube_id: string;
  title: string;
  description: string;
  creator_id: string;
  creator_username: string;
  points_per_minute: number;
  duration_seconds?: number;
}

// Add types for the YouTube API
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

async function fetchVideos() {
  const response = await api.get('/api/videos/discover');
  return response.data;
}

// Helper function to format duration
const formatDuration = (seconds: number | undefined): string => {
  if (!seconds || isNaN(seconds)) return '0:00';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export default function Home() {
  const { data: videos, isLoading, error } = useQuery<Video[]>({
    queryKey: ['videos'],
    queryFn: fetchVideos,
  });
  const { user } = useAuth();
  
  // Load YouTube API
  useEffect(() => {
    if (!window.YT && videos && videos.length > 0) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    }
  }, [videos]);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-800">
        An error occurred while loading videos
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Featured Videos</h1>
        {user?.user_type === 'viewer' && (
          <Link
            href="/videos"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            View Watch Later →
          </Link>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {videos?.map((video) => (
          <div
            key={video._id}
            className="group overflow-hidden rounded-lg bg-white shadow-lg transition-transform hover:scale-105"
          >
            <div className="relative h-48">
              {/* Video preview - autoplaying but muted */}
              <iframe
                src={`https://www.youtube.com/embed/${video.youtube_id}?autoplay=1&mute=1&controls=0&modestbranding=1&showinfo=0&rel=0&loop=1&playlist=${video.youtube_id}&start=5&end=15`}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                className="absolute inset-0 w-full h-full"
              ></iframe>
              
              {/* Click overlay to go to video page */}
              <Link href={`/videos/${video._id}`} className="absolute inset-0 z-10">
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
              
              {/* Duration badge */}
              {video.duration_seconds && (
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded z-20">
                  {formatDuration(video.duration_seconds)}
                </div>
              )}
            </div>
            <div className="p-4">
              <Link href={`/videos/${video._id}`}>
                <h2 className="mb-2 text-lg font-semibold text-gray-900 hover:text-indigo-600">
                  {video.title}
                </h2>
              </Link>
              <p className="mb-4 text-sm text-gray-600 line-clamp-2">
                {video.description}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  By {video.creator_username}
                </span>
                {user?.user_type === 'viewer' ? (
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-800">
                    Earn {video.points_per_minute} pts/min
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
                    {video.points_per_minute} pts/min
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
