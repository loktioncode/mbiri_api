'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PlayIcon } from '@heroicons/react/24/solid';
import { UserPlusIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useState, useRef, useEffect } from 'react';

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
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const playerRef = useRef<{ [key: string]: any }>({});
  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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
  
  // Handle mouse enter on video card
  const handleMouseEnter = (videoId: string, event: React.MouseEvent) => {
    // Clear any existing timeout
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }
    
    // Set a timeout before showing preview to avoid flickering on quick mouse movements
    previewTimeoutRef.current = setTimeout(() => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      setPreviewPosition({
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY + 10
      });
      setPreviewVideo(videoId);
      setShowPreview(true);
      
      // Initialize player if YouTube API is loaded
      if (window.YT && window.YT.Player) {
        // Wait for the iframe to be in the DOM
        setTimeout(() => {
          const iframe = document.getElementById(`preview-${videoId}`);
          if (iframe && !playerRef.current[videoId]) {
            try {
              playerRef.current[videoId] = new window.YT.Player(`preview-${videoId}`, {
                events: {
                  'onReady': (event: any) => {
                    event.target.mute(); // Always mute previews
                    event.target.playVideo();
                  }
                }
              });
            } catch (error) {
              console.error('Failed to initialize YouTube preview player', error);
            }
          } else if (playerRef.current[videoId]) {
            playerRef.current[videoId].playVideo();
          }
        }, 100);
      }
    }, 500); // 500ms delay before showing preview
  };
  
  // Handle mouse leave on video card
  const handleMouseLeave = () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    
    if (previewVideo && playerRef.current[previewVideo]) {
      try {
        playerRef.current[previewVideo].pauseVideo();
      } catch (error) {
        console.error('Failed to pause preview video', error);
      }
    }
    
    setShowPreview(false);
    setPreviewVideo(null);
  };

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
      {!user && (
        <div className="mb-8 rounded-lg bg-indigo-50 p-4">
          <div className="flex items-center">
            <UserPlusIcon className="h-6 w-6 text-indigo-600" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-indigo-800">
                Sign up to earn points!
              </h3>
              <p className="mt-1 text-sm text-indigo-600">
                Create an account to track your progress and earn points for watching videos.
              </p>
            </div>
            <div className="ml-auto">
              <Link
                href="/register"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Sign up now
              </Link>
            </div>
          </div>
        </div>
      )}

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
            onMouseEnter={(e) => handleMouseEnter(video.youtube_id, e)}
            onMouseLeave={handleMouseLeave}
          >
            <Link href={`/videos/${video._id}`}>
              <div className="relative">
                <img
                  src={`https://img.youtube.com/vi/${video.youtube_id}/maxresdefault.jpg`}
                  alt={video.title}
                  className="h-48 w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 transition-opacity group-hover:bg-opacity-50">
                  <PlayIcon className="h-16 w-16 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                {video.duration_seconds && (
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                    {formatDuration(video.duration_seconds)}
                  </div>
                )}
              </div>
            </Link>
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
      
      {/* Video Preview Popup */}
      {showPreview && previewVideo && (
        <div 
          className="fixed z-50 shadow-2xl rounded-lg overflow-hidden animate-fade-in"
          style={{
            top: `${previewPosition.y}px`,
            left: `${previewPosition.x}px`,
            transform: 'translateX(-50%)',
            width: '320px',
            height: '180px'
          }}
        >
          <iframe
            id={`preview-${previewVideo}`}
            src={`https://www.youtube.com/embed/${previewVideo}?autoplay=1&mute=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&rel=0&modestbranding=1&showinfo=0&controls=0&start=5`}
            title="Video preview"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            className="w-full h-full"
          ></iframe>
          <div className="absolute top-0 left-0 w-full h-full pointer-events-none bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-2 left-2 text-white text-xs bg-black/50 px-2 py-1 rounded">
            Preview • Hover to watch
          </div>
        </div>
      )}
    </div>
  );
}
