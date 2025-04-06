'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlayIcon, BookmarkIcon, BookmarkSlashIcon, XMarkIcon, PauseIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEffect, useState, useRef } from 'react';
import { toast, Toaster } from 'react-hot-toast';

interface Video {
  _id: string;
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

// Add functions for storing and retrieving watch time
const WATCH_TIME_KEY = 'mbiri_watch_times';

function getWatchTimes(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  const watchTimes = localStorage.getItem(WATCH_TIME_KEY);
  return watchTimes ? JSON.parse(watchTimes) : {};
}

function saveWatchTime(videoId: string, seconds: number) {
  if (typeof window === 'undefined') return;
  const watchTimes = getWatchTimes();
  watchTimes[videoId] = seconds;
  localStorage.setItem(WATCH_TIME_KEY, JSON.stringify(watchTimes));
}

function getWatchTime(videoId: string): number {
  const watchTimes = getWatchTimes();
  return watchTimes[videoId] || 0;
}

async function fetchVideo(id: string) {
  try {
    const response = await api.get(`/api/videos/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching video:', error);
    return null;
  }
}

async function fetchRecommendedVideos() {
  try {
    const response = await api.get('/api/videos/discover');
    return response.data;
  } catch (error) {
    console.error('Error fetching recommended videos:', error);
    return [];
  }
}

async function recordWatchSession(videoId: string, watchDuration: number) {
  try {
    const response = await api.post(`/api/videos/${videoId}/watch?watch_duration=${watchDuration}`);
    return response.data;
  } catch (error) {
    console.error('Error recording watch session:', error);
    return null;
  }
}

// Add types for the YouTube API
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function VideoPage() {
  const params = useParams();
  const videoId = params.id as string;
  const { user } = useAuth();
  const router = useRouter();
  const [watchlistItem, setWatchlistItem] = useState<WatchlistItem | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [watchTime, setWatchTime] = useState(0);
  const [hasEarnedPoints, setHasEarnedPoints] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isVideoMounted, setIsVideoMounted] = useState(false);
  const watchTimeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pointsEarnedNotificationShown = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastActivityTime = useRef(Date.now());

  const { data: video, isLoading: videoLoading, error: videoError } = useQuery<Video>({
    queryKey: ['video', videoId],
    queryFn: () => fetchVideo(videoId),
    retry: 1, // Only retry once on failure
  });

  const { data: recommendedVideos, isLoading: recommendedLoading } = useQuery<Video[]>({
    queryKey: ['recommendedVideos'],
    queryFn: fetchRecommendedVideos,
    retry: 1,
  });

  // Load watchlist item from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && user?.user_type === 'viewer') {
      const watchlist = getWatchlist();
      const item = watchlist.find(item => item.videoId === videoId);
      setWatchlistItem(item || null);
    }
  }, [videoId, user]);
  
  // Setup video activity detection
  useEffect(() => {
    if (!video) return;
    
    // Reset state when video changes
    setIsPlaying(true);
    setIsVideoMounted(true);
    setWatchTime(0);
    pointsEarnedNotificationShown.current = false;
    setHasEarnedPoints(false);
    lastActivityTime.current = Date.now();
    
    // Check for user activity (scrolling, mouse movement, etc.)
    const handleUserActivity = () => {
      lastActivityTime.current = Date.now();
      if (!isPlaying) {
        setIsPlaying(true);
      }
    };
    
    // Activity detection events
    window.addEventListener('scroll', handleUserActivity);
    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('click', handleUserActivity);
    
    // Check if video might be paused due to inactivity
    const checkVideoActivity = setInterval(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityTime.current;
      
      // If no activity for 5 seconds, consider the video might be paused
      if (timeSinceLastActivity > 5000 && isPlaying) {
        // This only flags for potential check - actual pause state will be
        // determined by visibility and other checks
        checkIfVideoIsVisible();
      }
    }, 2000);
    
    return () => {
      setIsVideoMounted(false);
      window.removeEventListener('scroll', handleUserActivity);
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      clearInterval(checkVideoActivity);
    };
  }, [video, videoId]);
  
  // Check if the video is visible in the viewport
  const checkIfVideoIsVisible = () => {
    if (!iframeRef.current) return;
    
    const rect = iframeRef.current.getBoundingClientRect();
    const isVisible = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
    
    // If video is not visible, consider it paused
    if (!isVisible && isPlaying) {
      setIsPlaying(false);
    } else if (isVisible && !isPlaying) {
      // Resume if it's visible again
      setIsPlaying(true);
    }
  };
  
  // Track watch time and report to API
  useEffect(() => {
    if (user?.user_type === 'viewer' && video && isVideoMounted) {
      // Clear any existing interval
      if (watchTimeIntervalRef.current) {
        clearInterval(watchTimeIntervalRef.current);
        watchTimeIntervalRef.current = null;
      }
      
      // Only start the timer if the video is playing
      if (isPlaying) {
        console.log('Starting timer - video is playing');
        watchTimeIntervalRef.current = setInterval(() => {
          setWatchTime(prev => {
            const newWatchTime = prev + 1;
            // If we hit exactly 60 seconds, trigger point earning immediately
            if (newWatchTime === 60) {
              handleReportWatchTime(newWatchTime);
            }
            return newWatchTime;
          });
          lastActivityTime.current = Date.now(); // Update last activity
        }, 1000);
      } else {
        console.log('Timer paused - video is not playing');
      }
      
      return () => {
        if (watchTimeIntervalRef.current) {
          clearInterval(watchTimeIntervalRef.current);
          watchTimeIntervalRef.current = null;
        }
      };
    }
  }, [user, video, isPlaying, isVideoMounted, videoId]);
  
  // Report watch time periodically after the first minute
  useEffect(() => {
    if (user?.user_type === 'viewer' && watchTime > 60 && isPlaying) {
      // Call endpoint periodically to update watch time on the server
      if (watchTime % 30 === 0) {
        handleReportWatchTime(watchTime);
      }
    }
  }, [watchTime, user, isPlaying]);
  
  // Cleanup and report final watch time when unmounting
  useEffect(() => {
    return () => {
      if (user?.user_type === 'viewer' && watchTime > 0) {
        handleReportWatchTime(watchTime);
      }
    };
  }, []);
  
  // Handle reporting watch time to the API
  const handleReportWatchTime = async (duration: number = watchTime) => {
    if (!(user?.user_type === 'viewer') || !video) return;
    
    try {
      const result = await recordWatchSession(videoId, duration);
      
      // Show points earned notification if points were earned and notification hasn't been shown yet
      if (result?.points_earned > 0 && !pointsEarnedNotificationShown.current) {
        // Show toast notification
        toast.success(
          <div className="flex items-center space-x-2">
            <span className="font-bold text-lg">+{result.points_earned} points!</span>
          </div>,
          {
            duration: 5000,
            position: 'bottom-center',
            className: 'bg-green-50 text-green-800 border border-green-200',
            icon: '🎉',
            style: {
              padding: '16px',
              fontSize: '16px'
            }
          }
        );
        
        // Show a more prominent celebratory notification
        toast.custom(
          (t) => (
            <div
              className={`${
                t.visible ? 'animate-enter' : 'animate-leave'
              } max-w-md w-full bg-white shadow-lg rounded-lg pointer-events-auto flex flex-col`}
            >
              <div className="p-4 border-t-4 border-green-500 rounded-t-lg bg-gradient-to-r from-green-50 to-indigo-50">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-2xl">🏆</span>
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-lg font-medium text-gray-900">
                      Congratulations!
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      You've earned {result.points_earned} points for watching this video!
                    </p>
                  </div>
                  <div className="ml-4 flex-shrink-0 flex">
                    <button
                      onClick={() => toast.dismiss(t.id)}
                      className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ),
          { duration: 5000, position: 'top-center' }
        );
        
        // Update state and flag
        pointsEarnedNotificationShown.current = true;
        setHasEarnedPoints(true);
      }
    } catch (error) {
      console.error('Failed to record watch session:', error);
    }
  };

  const handleWatchLaterClick = (id: string = videoId) => {
    if (!user || user.user_type !== 'viewer') {
      // Prompt to login if user is not authenticated
      toast.error('Please sign in as a viewer to add videos to watch later');
      return;
    }
    
    setIsUpdating(true);
    try {
      const watchlist = getWatchlist();
      const item = watchlist.find(item => item.videoId === id);
      
      if (item) {
        removeFromWatchlist(id);
        if (id === videoId) {
          setWatchlistItem(null);
        }
        toast.success('Removed from Watch Later');
      } else {
        const newItem = addToWatchlist(id);
        if (id === videoId) {
          setWatchlistItem(newItem);
        }
        toast.success('Added to Watch Later');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle play/pause button click
  const handlePlayPauseClick = () => {
    try {
      // Access the YouTube player
      if (window.YT && iframeRef.current && iframeRef.current.id) {
        const player = window.YT.get(iframeRef.current.id);
        if (player) {
          // If currently playing, pause it
          if (isPlaying) {
            player.pauseVideo();
          } else {
            // If paused, play it
            player.playVideo();
          }
          return; // Let the state update come from the player state change event
        }
      }
    } catch (error) {
      console.error('Error controlling YouTube player:', error);
    }
    
    // Fallback if we couldn't control the player directly
    setIsPlaying(!isPlaying);
    
    // Try to focus the iframe to ensure events work
    if (iframeRef.current) {
      iframeRef.current.focus();
    }
  };

  // Update the YouTube iframe API integration to better detect if video is actually playing
  useEffect(() => {
    if (!video || !iframeRef.current) return;

    // Initial state - assume not playing until confirmed
    setIsPlaying(false);

    let player: any = null;
    
    // Define the YouTube API callback
    const onYouTubeIframeAPIReady = () => {
      // Safe check in case component unmounted
      if (!iframeRef.current) return;
      
      try {
        // Get iframe ID
        const iframeId = 'youtube-player';
        iframeRef.current.id = iframeId;
        
        // Create YouTube player instance
        player = new window.YT.Player(iframeId, {
          events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
          }
        });
      } catch (error) {
        console.error('Error initializing YouTube player:', error);
        // Fallback to simpler detection
        setupFallbackDetection();
      }
    };
    
    // When player is ready - seek to saved position
    const onPlayerReady = (event: any) => {
      // Check if video is actually playing
      const playerState = event.target.getPlayerState();
      setIsPlaying(playerState === 1); // 1 = playing
      
      // Focus iframe to help with autoplay
      if (iframeRef.current) {
        iframeRef.current.focus();
      }
      
      // If there's a saved position, seek to it
      const savedTime = getWatchTime(videoId);
      if (savedTime > 10 && savedTime < (event.target.getDuration() - 5)) {
        // Only seek if we have a meaningful amount of watch time
        // and we're not at the very end of the video
        try {
          // Seek to the saved position
          event.target.seekTo(savedTime);
          console.log(`Seeking to saved position: ${savedTime} seconds`);
        } catch (error) {
          console.error('Error seeking to saved position:', error);
        }
      }
    };
    
    // When player state changes
    const onPlayerStateChange = (event: any) => {
      // Update playing state based on player state
      const isVideoPlaying = event.data === 1; // 1 = playing
      setIsPlaying(isVideoPlaying);
      
      if (isVideoPlaying) {
        lastActivityTime.current = Date.now();
      }
    };
    
    // Fallback detection when YouTube API integration fails
    const setupFallbackDetection = () => {
      // Try to detect when the video is actually playing
      const checkVideoPlaying = setInterval(() => {
        // If the iframe is focused or has recent activity, consider the video playing
        if (document.activeElement === iframeRef.current) {
          const timeSinceLastActivity = Date.now() - lastActivityTime.current;
          // Only set to playing if recent activity
          if (timeSinceLastActivity < 2000) {
            setIsPlaying(true);
          }
        }
      }, 1000);
      
      return () => {
        clearInterval(checkVideoPlaying);
      };
    };
    
    // Load YouTube API if not already loaded
    if (typeof window !== 'undefined') {
      if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        
        // Set up callback
        window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
      } else {
        // API already loaded
        onYouTubeIframeAPIReady();
      }
    }
    
    // Listen for window focus/blur to detect if the user has switched tabs
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User switched tabs or minimized window - pause timer
        setIsPlaying(false);
      } else if (player && player.getPlayerState) {
        // Check actual player state when returning to tab
        try {
          const playerState = player.getPlayerState();
          setIsPlaying(playerState === 1); // 1 = playing
        } catch (e) {
          // If can't access player state, keep current state
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup function
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (player && player.destroy) {
        try {
          player.destroy();
        } catch (e) {
          // Ignore errors on cleanup
        }
      }
    };
  }, [video]);

  // Initialize watchTime from localStorage if available
  useEffect(() => {
    if (video && videoId) {
      const savedTime = getWatchTime(videoId);
      if (savedTime > 0) {
        setWatchTime(savedTime);
        // If they've already watched more than a minute, mark as earned
        if (savedTime >= 60) {
          setHasEarnedPoints(true);
          pointsEarnedNotificationShown.current = true;
        }
      }
    }
  }, [video, videoId]);
  
  // Save watch time to localStorage periodically and when component unmounts
  useEffect(() => {
    if (!videoId || watchTime <= 0) return;
    
    // Save every 5 seconds to avoid excessive writes
    const saveInterval = setInterval(() => {
      saveWatchTime(videoId, watchTime);
    }, 5000);
    
    // Also save on unmount
    return () => {
      clearInterval(saveInterval);
      saveWatchTime(videoId, watchTime);
    };
  }, [videoId, watchTime]);

  // Add a resume notification if applicable
  useEffect(() => {
    const savedTime = getWatchTime(videoId);
    if (savedTime > 0 && video) {
      const minutes = Math.floor(savedTime / 60);
      const seconds = savedTime % 60;
      
      // Only show the notification if they've watched more than 10 seconds
      if (savedTime > 10) {
        toast.success(
          <div className="flex items-center space-x-2">
            <span>Resuming from {minutes}m {seconds}s</span>
          </div>,
          {
            duration: 3000,
            position: 'bottom-center',
            icon: '⏱️',
          }
        );
      }
    }
  }, [video, videoId]);

  // Add reset function
  const resetWatchProgress = () => {
    // Clear saved watch time
    saveWatchTime(videoId, 0);
    
    // Reset state
    setWatchTime(0);
    setHasEarnedPoints(false);
    pointsEarnedNotificationShown.current = false;
    
    // Try to restart the video
    try {
      if (window.YT && iframeRef.current && iframeRef.current.id) {
        const player = window.YT.get(iframeRef.current.id);
        if (player) {
          player.seekTo(0);
          player.playVideo();
        }
      }
    } catch (error) {
      console.error('Error restarting video:', error);
    }
    
    toast.success('Watch progress reset');
  };

  if (videoLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  if (videoError || !video) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-800">
        {videoError ? 'An error occurred while loading the video' : 'Video not found'}
      </div>
    );
  }

  // Filter out current video from recommended
  const filteredRecommendedVideos: Video[] = recommendedVideos?.filter(v => v._id !== videoId) || [];

  return (
    <div className="container mx-auto px-4 py-6">
      <Toaster />
      
      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Video player and details (taking 2/3 of the screen on larger devices) */}
        <div className="lg:col-span-2">
          {/* Full-width, responsive video player */}
          <div className="w-full aspect-video bg-black rounded-lg overflow-hidden shadow-lg sticky top-4 relative">
            <iframe
              ref={iframeRef}
              id="youtube-player"
              src={`https://www.youtube.com/embed/${video.youtube_id}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&rel=0&modestbranding=1&showinfo=0&controls=1`}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
              loading="lazy"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              onLoad={() => {
                // This will trigger after iframe loads, but video may not be playing yet
                if (iframeRef.current) {
                  iframeRef.current.focus();
                }
              }}
            />
            
            {/* Play/Pause overlay - only visible when paused */}
            {!isPlaying && (
              <div 
                className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center cursor-pointer"
                onClick={handlePlayPauseClick}
              >
                <div className="bg-white bg-opacity-90 rounded-full p-4">
                  <PlayIcon className="h-12 w-12 text-indigo-600" />
                </div>
                <div className="absolute bottom-4 left-4 bg-white bg-opacity-90 rounded-lg px-3 py-1">
                  <p className="text-gray-800 font-medium">Video paused - Timer stopped</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Video details card */}
          <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{video.title}</h1>
                <p className="text-sm text-gray-500 mt-1">By {video.creator_username}</p>
                
                {/* Add watch progress indicator */}
                {watchTime > 10 && (
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-indigo-600 h-1.5 rounded-full" 
                      style={{ 
                        width: `${Math.min((watchTime / (10 * 60)) * 100, 100)}%` 
                      }}
                    ></div>
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                {/* Play/Pause button */}
                <button
                  onClick={handlePlayPauseClick}
                  className="flex items-center justify-center rounded-full w-10 h-10 bg-gray-100 text-gray-700 hover:bg-gray-200"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
                </button>
                
                {/* Restart video button - only show if there's progress */}
                {watchTime > 10 && (
                  <button
                    onClick={resetWatchProgress}
                    className="flex items-center justify-center rounded-full w-10 h-10 bg-gray-100 text-gray-700 hover:bg-gray-200"
                    title="Restart video"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  </button>
                )}
                
                {/* Watchlist button - only for logged in viewers */}
                {user?.user_type === 'viewer' && (
                  <button
                    onClick={() => handleWatchLaterClick()}
                    disabled={isUpdating}
                    className={`flex items-center justify-center rounded-full w-10 h-10 ${
                      watchlistItem
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                    title={watchlistItem ? "Remove from Watch Later" : "Add to Watch Later"}
                  >
                    {watchlistItem ? <BookmarkSlashIcon className="h-5 w-5" /> : <BookmarkIcon className="h-5 w-5" />}
                  </button>
                )}
              </div>
            </div>
            
            {/* Watch time and points indicator */}
            {user?.user_type === 'viewer' && (
              <div className="mb-4 flex items-center flex-wrap gap-2">
                <div className={`rounded-full px-3 py-1 text-sm flex items-center ${
                  isPlaying 
                    ? 'bg-indigo-100 text-indigo-800 animate-pulse' 
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  <span>
                    {isPlaying ? 'Watching: ' : 'Paused: '}
                    {Math.floor(watchTime / 60)}m {watchTime % 60}s
                  </span>
                  {!isPlaying && <PauseIcon className="h-4 w-4 ml-1" />}
                </div>
                
                {hasEarnedPoints && (
                  <div className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
                    Points earned! ✓
                  </div>
                )}
                
                {!hasEarnedPoints && (
                  <div className={`rounded-full px-3 py-1 text-sm ${
                    isPlaying && watchTime < 60
                      ? 'bg-yellow-100 text-yellow-800'
                      : !isPlaying 
                        ? 'bg-gray-100 text-gray-600' 
                        : 'bg-green-100 text-green-800'
                  }`}>
                    {watchTime < 60 ? (
                      <>
                        Watch 1 minute to earn {video.points_per_minute} points
                        {!isPlaying && ' (timer paused)'}
                      </>
                    ) : (
                      <>Continuing to watch earns more points</>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <p className="text-gray-700 mb-6">{video.description}</p>
            
            <div className="border-t border-gray-200 pt-4">
              {user?.user_type === 'viewer' ? (
                <div className="flex items-center text-indigo-600">
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm">
                    Earn {video.points_per_minute} points/min watching this video
                  </span>
                </div>
              ) : !user && (
                <div className="text-sm text-gray-500">
                  Sign up as a viewer to earn {video.points_per_minute} points/min watching this video
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Recommended videos sidebar (taking 1/3 of the screen on larger devices) */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg p-4 shadow-lg">
            <h2 className="text-xl font-semibold mb-4">More Videos</h2>
            
            {recommendedLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredRecommendedVideos.map((rec) => (
                  <div key={rec._id} className="group relative">
                    <div className="relative">
                      <Link href={`/videos/${rec._id}`}>
                        <div className="aspect-video rounded-lg overflow-hidden bg-gray-100">
                          <img
                            src={`https://img.youtube.com/vi/${rec.youtube_id}/mqdefault.jpg`}
                            alt={rec.title}
                            className="w-full h-full object-cover group-hover:opacity-90 transition"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all">
                            <PlayIcon className="h-12 w-12 text-white opacity-0 group-hover:opacity-100" />
                          </div>
                        </div>
                      </Link>
                      
                      {/* Only show watchlist button for logged-in viewers */}
                      {user?.user_type === 'viewer' && (
                        <button
                          onClick={() => handleWatchLaterClick(rec._id)}
                          className="absolute top-2 right-2 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-full p-1 shadow-sm transition-opacity opacity-0 group-hover:opacity-100"
                          title="Add to Watch Later"
                        >
                          <BookmarkIcon className="h-5 w-5 text-indigo-600" />
                        </button>
                      )}
                    </div>
                    
                    <div className="mt-2">
                      <Link href={`/videos/${rec._id}`}>
                        <h3 className="font-medium text-gray-900 line-clamp-2 hover:text-indigo-600">
                          {rec.title}
                        </h3>
                      </Link>
                      <p className="text-sm text-gray-500">{rec.creator_username}</p>
                      <div className="mt-1">
                        <span className="text-xs bg-indigo-50 text-indigo-800 px-2 py-1 rounded-full">
                          {rec.points_per_minute} pts/min
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 