'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlayIcon, BookmarkIcon, BookmarkSlashIcon, XMarkIcon, PauseIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEffect, useState, useRef, useCallback } from 'react';
import { toast, Toaster } from 'react-hot-toast';

interface Video {
  _id: string;
  youtube_id: string;
  title: string;
  description: string;
  creator_username: string;
  points_per_minute: number;
  created_at: string;
  duration_seconds: number;
  total_points_awarded: number;
}

interface WatchlistItem {
  videoId: string;
  dateAdded: string;
  watched: boolean;
}

interface User {
  id: string;
  username: string;
  email: string;
  user_type: string;
  token?: string;
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

// Duration display helper function
const formatDuration = (seconds: number | undefined): string => {
  if (!seconds || isNaN(seconds)) return '0:00';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// Progress calculation helper function
const calculateProgress = (currentTime: number, totalDuration: number | undefined): number => {
  if (!totalDuration || isNaN(totalDuration) || totalDuration <= 0) {
    // If we don't have a valid duration, use a default of 10 minutes (600 seconds)
    totalDuration = 600;
  }
  return Math.min((currentTime / totalDuration) * 100, 100);
};

export default function VideoPage() {
  const params = useParams();
  const videoId = params.id as string;
  const { user, updatePoints } = useAuth();
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
  const [alreadyEarnedForThisVideo, setAlreadyEarnedForThisVideo] = useState(false);
  const [video, setVideo] = useState<Video | null>(null);
  const [recommendedVideos, setRecommendedVideos] = useState<Video[]>([]);
  const [watchDuration, setWatchDuration] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(true);
  const [isTimerActive, setTimerActive] = useState<boolean>(false);
  const [watchSessionStarted, setWatchSessionStarted] = useState<boolean>(false);
  const [fullyWatched, setFullyWatched] = useState<boolean>(false);
  const [earnedBonusPoints, setEarnedBonusPoints] = useState(0);
  const [lastBonusToastTime, setLastBonusToastTime] = useState<number>(0);
  const bonusPointsRef = useRef(0);
  const lastReportTimeRef = useRef(0);
  const reportingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: videoData, isLoading: videoLoading, error: videoError } = useQuery<Video>({
    queryKey: ['video', videoId],
    queryFn: () => fetchVideo(videoId),
    retry: 1, // Only retry once on failure
  });

  const { data: recommendedVideosData, isLoading: recommendedLoading } = useQuery<Video[]>({
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
    if (!videoData) return;
    
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
  }, [videoData, videoId]);
  
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
    if (user?.user_type === 'viewer' && videoData && isVideoMounted) {
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
            
            // Calculate bonus points for continuing viewers
            if ((hasEarnedPoints || alreadyEarnedForThisVideo) && !fullyWatched) {
              // Track bonus points accumulation (10% of points per minute)
              bonusPointsRef.current += video?.points_per_minute ? video.points_per_minute / 600 : 0.01;
              
              // Don't update state here - just track it for the next useEffect
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
  }, [user, videoData, isPlaying, isVideoMounted, videoId, hasEarnedPoints, alreadyEarnedForThisVideo, fullyWatched, video?.points_per_minute]);
  
  // Add a separate useEffect to handle toasts and state updates for bonus points
  useEffect(() => {
    // Only run if the video is playing and there are points to accumulate
    if (!isPlaying || !(hasEarnedPoints || alreadyEarnedForThisVideo) || fullyWatched) return;
    
    // Check for whole bonus points
    const wholeBonusPoints = Math.floor(bonusPointsRef.current);
    if (wholeBonusPoints > earnedBonusPoints) {
      // Calculate points earned in this update
      const pointsEarned = wholeBonusPoints - earnedBonusPoints;
      
      // Update state
      setEarnedBonusPoints(wholeBonusPoints);
      
      // Only show toast max once every 60 seconds
      const now = Date.now();
      if (now - lastBonusToastTime > 60000) {
        setLastBonusToastTime(now);
        
        // Update points in the navbar with visual feedback
        updatePoints(pointsEarned);
        
        // Show a comprehensive toast that points were earned and added to profile
        toast.success(
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg">+{pointsEarned} bonus points!</span>
            </div>
            <span className="text-sm mt-1">Added to your profile</span>
          </div>,
          {
            duration: 4000,
            position: 'bottom-center',
            className: 'bg-indigo-50 text-indigo-800 border border-indigo-200',
            icon: '💰',
            style: {
              padding: '16px',
              fontSize: '16px'
            }
          }
        );
      }
    }
  }, [isPlaying, earnedBonusPoints, lastBonusToastTime, hasEarnedPoints, alreadyEarnedForThisVideo, fullyWatched, updatePoints]);
  
  // Reset bonus points when video changes
  useEffect(() => {
    bonusPointsRef.current = 0;
    setEarnedBonusPoints(0);
    setLastBonusToastTime(0);
  }, [videoId]);
  
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
      
      // Set fully watched status
      if (result?.fully_watched) {
        setFullyWatched(true);
      }
      
      // Check if user has already earned points for this video
      if (result?.already_earned) {
        setAlreadyEarnedForThisVideo(true);
        
        // Show a notification about continuing points if points were earned in this session
        if (result?.continuing_points && result?.points_earned > 0) {
          // Update points in the navbar with visual feedback
          updatePoints(result.points_earned);
          
          // Show continuing points notification
          toast.success(
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg">+{result.points_earned} bonus points!</span>
              <span className="text-sm">(for continued watching)</span>
            </div>,
            {
              duration: 5000,
              position: 'bottom-center',
              className: 'bg-indigo-50 text-indigo-800 border border-indigo-200',
              icon: '✨',
              style: {
                padding: '16px',
                fontSize: '16px'
              },
              id: 'continuing-points-earned'
            }
          );
        }
      }
      
      // Show points earned notification if first-time points were earned and notification hasn't been shown yet
      if (result?.points_earned > 0 && !result?.already_earned && !pointsEarnedNotificationShown.current) {
        // Update points in the navbar with visual feedback
        updatePoints(result.points_earned);
        
        // Show navbar update confirmation
        toast.custom((t) => (
          <div className={`${
            t.visible ? 'animate-enter' : 'animate-leave'
          } max-w-sm bg-white shadow-lg rounded-lg pointer-events-auto flex items-center fixed top-16 right-4 z-50`}>
            <div className="flex-1 w-0 p-3">
              <div className="flex items-center">
                <div className="flex-shrink-0 pt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="h-6 w-6 text-green-500">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    Points added to your account!
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Continue watching to earn more at 10% rate!
                  </p>
                </div>
              </div>
            </div>
            <div className="flex border-l border-gray-200">
              <button
                onClick={() => toast.dismiss(t.id)}
                className="w-full h-full p-3 flex items-center justify-center text-sm font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        ), { duration: 3000, id: 'navbar-points-update' });
        
        // Show main points earned toast
        toast.success(
          <div className="flex items-center space-x-2">
            <span className="font-bold text-lg">+{result.points_earned} points!</span>
            <span className="text-sm">(continue for bonus points)</span>
          </div>,
          {
            duration: 5000,
            position: 'bottom-center',
            className: 'bg-green-50 text-green-800 border border-green-200',
            icon: '🎉',
            style: {
              padding: '16px',
              fontSize: '16px'
            },
            id: 'main-points-earned'
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
                      You've earned {result.points_earned} points! Keep watching for bonus points (10% rate).
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
          { duration: 5000, position: 'top-center', id: 'celebratory-toast' }
        );
        
        // Update state and flag
        setHasEarnedPoints(true);
        pointsEarnedNotificationShown.current = true;
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

  // Setup YouTube iframe API and get video duration
  useEffect(() => {
    if (!videoData || !iframeRef.current || !isVideoMounted) return;
    
    // Load YouTube API if not already loaded
    const loadYouTubeAPI = () => {
      if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }
        
        window.onYouTubeIframeAPIReady = initializePlayer;
      } else if (window.YT.Player) {
        initializePlayer();
      }
    };
    
    // Initialize the player once API is ready
    const initializePlayer = () => {
      if (!iframeRef.current || !iframeRef.current.id) return;
      
      try {
        const player = new window.YT.Player(iframeRef.current.id, {
          events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
          }
        });
      } catch (error) {
        console.error('Error initializing YouTube player:', error);
      }
    };
    
    // Handle player ready event
    const onPlayerReady = (event: any) => {
      console.log('YouTube player ready');
      
      // Get video duration
      try {
        const duration = event.target.getDuration();
        if (duration && !isNaN(duration) && duration > 0) {
          console.log(`Video duration from YouTube: ${duration} seconds`);
          
          // Update video object with duration
          setVideo(prev => {
            if (!prev) return null;
            return {
              ...prev,
              duration_seconds: duration
            };
          });
        }
      } catch (error) {
        console.error('Error getting video duration:', error);
      }
    };
    
    // Handle player state changes
    const onPlayerStateChange = (event: any) => {
      const playerState = event.data;
      
      // YT.PlayerState.PLAYING = 1, YT.PlayerState.PAUSED = 2
      if (playerState === 1) {
        setIsPlaying(true);
      } else if (playerState === 2) {
        setIsPlaying(false);
      }
    };
    
    loadYouTubeAPI();
    
    return () => {
      // Clean up
      window.onYouTubeIframeAPIReady = function() {};
    };
  }, [videoData, isVideoMounted]);

  // Initialize watchTime from localStorage if available
  useEffect(() => {
    if (videoData && videoId) {
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
  }, [videoData, videoId]);
  
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
    if (savedTime > 0 && videoData) {
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
  }, [videoData, videoId]);

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

  // Add an effect for beforeunload event to warn users when leaving
  useEffect(() => {
    // Only add warning if user is a viewer, hasn't earned points yet, and has watched some time
    const shouldWarn = user?.user_type === 'viewer' && !hasEarnedPoints && !alreadyEarnedForThisVideo && watchTime > 0 && watchTime < 60;
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (shouldWarn) {
        // Standard way of showing a confirmation dialog before leaving the page
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    
    if (shouldWarn) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    } else {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    }
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user, hasEarnedPoints, alreadyEarnedForThisVideo, watchTime]);

  // Add a warning banner at the top of the video
  const renderWarningBanner = () => {
    if (!user || user.user_type !== 'viewer') return null;
    
    if (watchTime > 0 && watchTime < 60 && !hasEarnedPoints && !alreadyEarnedForThisVideo) {
      return (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong>Watch at least 1 minute to earn points.</strong> If you leave now, you won't earn any points for this video.
              </p>
            </div>
          </div>
        </div>
      );
    }
    
    if (alreadyEarnedForThisVideo) {
      return (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                <strong>You've already earned points for this video.</strong> Keep watching to earn bonus points at 10% of the normal rate!
              </p>
            </div>
          </div>
        </div>
      );
    }
    
    return null;
  };

  // Check if user has already earned points when video loads
  useEffect(() => {
    if (user?.user_type === 'viewer' && videoData && videoId) {
      const checkIfAlreadyEarned = async () => {
        try {
          // Make a minimal API call to check if points were already earned
          const result = await recordWatchSession(videoId, 1);
          if (result?.already_earned) {
            setAlreadyEarnedForThisVideo(true);
            
            // Show a notification that points were already earned but they can earn more
            toast.custom((t) => (
              <div className={`${
                t.visible ? 'animate-enter' : 'animate-leave'
              } max-w-sm bg-blue-50 border border-blue-200 shadow-lg rounded-lg pointer-events-auto flex items-center p-4`}>
                <div className="flex-shrink-0 text-xl mr-2">ℹ️</div>
                <div className="ml-2 flex-1">
                  <p className="text-sm font-medium text-blue-900">
                    You've already earned points for this video
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    Keep watching to earn bonus points at 10% of the normal rate!
                  </p>
                </div>
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="flex-shrink-0 ml-4 text-blue-400 hover:text-blue-600"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            ), { 
              duration: 5000, 
              position: 'top-right',
              id: 'already-earned-points'
            });
          }
        } catch (error) {
          console.error('Error checking video status:', error);
        }
      };
      
      checkIfAlreadyEarned();
    }
  }, [user, videoData, videoId]);

  // Filter out current video from recommended
  const filteredRecommendedVideos: Video[] = recommendedVideosData?.filter(v => v._id !== videoId) || [];

  // Update useEffect to sync videoData with state
  useEffect(() => {
    if (videoData) {
      setVideo(videoData);
    }
  }, [videoData]);

  // Update useEffect to sync recommendedVideosData with state
  useEffect(() => {
    if (recommendedVideosData) {
      setRecommendedVideos(recommendedVideosData);
    }
  }, [recommendedVideosData]);

  // Function to check if a user has fully watched a video
  const checkIfVideoFullyWatched = (videoId: string): boolean => {
    if (typeof window === 'undefined' || !user || user.user_type !== 'viewer') return false;
    
    // Check saved watch time against video duration
    const savedTime = getWatchTime(videoId);
    const videoData = filteredRecommendedVideos.find(v => v._id === videoId);
    
    if (savedTime > 0) {
      if (videoData?.duration_seconds && !isNaN(videoData.duration_seconds) && videoData.duration_seconds > 0) {
        // Consider it watched if they've seen at least 95% of the video
        return savedTime >= (videoData.duration_seconds * 0.95);
      } else {
        // If no valid duration, use 10 minutes (600 seconds) as default
        return savedTime >= 570; // 95% of 10 minutes
      }
    }
    
    return false;
  };

  // Function to calculate bonus points based on watch time
  const calculateBonusPoints = useCallback((seconds: number) => {
    if (!video) return 0;
    const pointsPerMinute = video.points_per_minute * 0.1; // 10% rate
    return Math.floor((seconds / 60) * pointsPerMinute);
  }, [video]);

  // Add a useEffect for tracking bonus points continuously
  useEffect(() => {
    if (
      user?.user_type === 'viewer' && 
      isPlaying && 
      (hasEarnedPoints || alreadyEarnedForThisVideo) && 
      !fullyWatched
    ) {
      // Update bonus points counter each second
      const bonusInterval = setInterval(() => {
        if (isPlaying && watchTime >= 60) {
          // Calculate current bonus points
          const currentBonusPoints = calculateBonusPoints(watchTime);
          
          // Update ref with current calculation
          bonusPointsRef.current = currentBonusPoints;
          
          // Update state for display (this triggers re-render)
          setEarnedBonusPoints(currentBonusPoints);
        }
      }, 1000);
      
      return () => clearInterval(bonusInterval);
    }
  }, [isPlaying, watchTime, hasEarnedPoints, alreadyEarnedForThisVideo, fullyWatched, user, calculateBonusPoints]);
  
  // Add a throttled API reporting system (every 1 minute exactly)
  useEffect(() => {
    // Only set up reporting if conditions are met
    if (
      user?.user_type === 'viewer' && 
      isPlaying && 
      (hasEarnedPoints || alreadyEarnedForThisVideo) && 
      !fullyWatched &&
      watchTime >= 60 // At least 1 minute watched
    ) {
      console.log('Setting up continued watching reporting interval (60s)');
      
      // First clear any existing timer to avoid duplicates
      if (reportingIntervalRef.current) {
        clearInterval(reportingIntervalRef.current);
      }
      
      // Set up interval to report continued watching time every 1 minute exactly
      const interval = setInterval(() => {
        // Get current timestamp
        const now = Date.now();
        
        // Only report if it's been at least 60 seconds since last report
        if (now - lastReportTimeRef.current >= 60000) {
          console.log(`Reporting continued watching time: ${watchTime} seconds`);
          handleReportWatchTime();
          // Update last report time
          lastReportTimeRef.current = now;
        }
      }, 60000); // 1 minute exactly
      
      // Store the interval ID in a ref so we can clear it
      reportingIntervalRef.current = interval;
      
      return () => {
        if (reportingIntervalRef.current) {
          clearInterval(reportingIntervalRef.current);
          reportingIntervalRef.current = null;
        }
      };
    }
  }, [isPlaying, hasEarnedPoints, alreadyEarnedForThisVideo, fullyWatched, watchTime, user]);
  
  // Report final watch time when unmounting
  useEffect(() => {
    return () => {
      // Only report if we've watched enough to earn points and haven't fully watched
      if (
        user?.user_type === 'viewer' && 
        (hasEarnedPoints || alreadyEarnedForThisVideo) && 
        !fullyWatched &&
        watchTime < 60
      ) {
        console.log(`Reporting final watch time on unmount: ${watchTime} seconds`);
        handleReportWatchTime();
      }
    };
  }, [handleReportWatchTime, hasEarnedPoints, alreadyEarnedForThisVideo, fullyWatched, watchTime, user]);
  
  // Progress bar calculation - make this smoother with interpolation
  const calculateProgressPercentage = useCallback(() => {
    if (!bonusPointsRef.current) return 0;
    
    const currentPoints = earnedBonusPoints;
    const totalPoints = bonusPointsRef.current;
    const nextPointThreshold = Math.ceil(totalPoints);
    
    // Calculate percentage to next full point (0-100)
    const fractionalPart = totalPoints - Math.floor(totalPoints);
    return Math.min(fractionalPart * 100, 100);
  }, [earnedBonusPoints]);

  return (
    <div className="container mx-auto px-4 py-6">
      <Toaster />
      
      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Video player and details (taking 2/3 of the screen on larger devices) */}
        <div className="lg:col-span-2">
          {/* Full-width, responsive video player */}
          {renderWarningBanner()}
          <div className="w-full aspect-video bg-black rounded-lg overflow-hidden shadow-lg sticky top-4 relative">
            {videoLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="animate-pulse">Loading video...</div>
              </div>
            ) : videoError || !video ? (
              <div className="rounded-lg bg-red-50 p-4 text-red-800">
                {videoError ? 'An error occurred while loading the video' : 'Video not found'}
              </div>
            ) : (
              <div className="relative w-full h-full">
                <iframe
                  ref={iframeRef}
                  id="youtube-player"
                  src={`https://www.youtube.com/embed/${video.youtube_id}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&rel=0&modestbranding=1&showinfo=0&controls=1`}
                  title={video.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className={`w-full h-full ${fullyWatched ? 'opacity-75' : ''}`}
                ></iframe>
                
                {/* Only show pause overlay when the video is actually paused, not playing */}
                {!isPlaying && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="text-white text-lg font-semibold z-10 bg-black/50 px-4 py-2 rounded">
                      {fullyWatched 
                        ? 'Video paused - Fully watched'
                        : watchTime < 60 && !hasEarnedPoints && !alreadyEarnedForThisVideo
                          ? 'Video paused - Watch 1 minute to earn points'
                          : 'Video paused - Timer paused'
                      }
                    </div>
                    <img 
                      src={`https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`} 
                      alt="Video Thumbnail" 
                      className="absolute inset-0 w-full h-full object-cover opacity-50 z-0" 
                    />
                  </div>
                )}
                
                {/* Fully watched overlay - shown regardless of playing status */}
                {fullyWatched && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                    <div className="bg-green-600 text-white px-6 py-3 rounded-lg z-10 shadow-lg">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2 text-lg font-bold">
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Fully Watched
                        </div>
                        {user?.user_type === 'viewer' && (
                          <div className="text-sm text-white/90">
                            No more points available for this video
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Video details card */}
          <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
            {video && (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">{video.title}</h1>
                    <p className="text-sm text-gray-500 mt-1">By {video.creator_username}</p>
                    
                    {/* Video duration display */}
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-sm text-gray-500">
                        Duration: {formatDuration(video.duration_seconds)}
                      </p>
                      
                      {fullyWatched && (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                          <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-green-400" fill="currentColor" viewBox="0 0 8 8">
                            <circle cx="4" cy="4" r="3" />
                          </svg>
                          Fully Watched
                        </span>
                      )}
                      
                      {video.total_points_awarded > 0 && user?.user_type === 'viewer' && (
                        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                          <svg className="h-3 w-3 text-yellow-500 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.736 6.979C9.208 6.193 9.696 6 10 6c.304 0 .792.193 1.264.979a1 1 0 001.715-1.029C12.279 4.784 11.232 4 10 4s-2.279.784-2.979 1.95a1 1 0 001.715 1.029zM6 12a2 2 0 114 0 2 2 0 01-4 0zm6 0a2 2 0 114 0 2 2 0 01-4 0z" clipRule="evenodd" />
                          </svg>
                          {video.total_points_awarded} points earned
                        </span>
                      )}
                    </div>
                    
                    {/* Add watch progress indicator */}
                    {watchTime > 10 && (
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className={`h-1.5 rounded-full ${fullyWatched ? 'bg-green-600' : 'bg-indigo-600'}`}
                          style={{ 
                            width: `${calculateProgress(watchTime, video.duration_seconds)}%` 
                          }}
                        ></div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {/* Play/Pause button */}
                    <button
                      onClick={handlePlayPauseClick}
                      className={`flex items-center justify-center rounded-full w-10 h-10 ${
                        fullyWatched 
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      title={fullyWatched ? "You've fully watched this video" : isPlaying ? "Pause" : "Play"}
                      disabled={fullyWatched}
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
                        onClick={() => handleWatchLaterClick(video._id)}
                        disabled={isUpdating || fullyWatched}
                        className={`flex items-center justify-center rounded-full w-10 h-10 ${
                          fullyWatched ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                        title={fullyWatched ? 'You have watched this entire video' : 'Add to Watch Later'}
                      >
                        <BookmarkIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Watch time and points indicator */}
                {user?.user_type === 'viewer' && (
                  <div className="mb-4 flex items-center flex-wrap gap-2">
                    <div className={`rounded-full px-3 py-1 text-sm flex items-center ${
                      fullyWatched 
                        ? 'bg-gray-100 text-gray-700'
                        : isPlaying 
                          ? 'bg-indigo-100 text-indigo-800 animate-pulse' 
                          : 'bg-gray-100 text-gray-700'
                    }`}>
                      <span>
                        {isPlaying ? 'Watching: ' : fullyWatched ? 'Watched: ' : 'Paused: '}
                        {Math.floor(watchTime / 60)}m {watchTime % 60}s
                      </span>
                      {!isPlaying && !fullyWatched && <PauseIcon className="h-4 w-4 ml-1" />}
                      {fullyWatched && (
                        <svg className="h-4 w-4 ml-1 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    
                    {!hasEarnedPoints && !alreadyEarnedForThisVideo && !fullyWatched && (
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
                          <>You'll earn {video.points_per_minute} points after watching for 1 minute</>
                        )}
                      </div>
                    )}
                    
                    {(hasEarnedPoints || alreadyEarnedForThisVideo) && !fullyWatched && (
                      <div className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-800 flex items-center">
                        <span className="mr-1">Points earned</span>
                        <span className="inline-block w-1 h-1 rounded-full bg-green-800 mx-1"></span>
                        <span className="flex items-center">
                          <span className="mr-1">Continue for bonus points</span>
                          {isPlaying && (
                            <span className="flex items-center animate-pulse bg-yellow-100 px-1.5 py-0.5 rounded-full text-xs text-yellow-800 ml-1">
                              Earning {Math.floor(video.points_per_minute * 0.1)} pts/min
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    
                    {fullyWatched && (
                      <div className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 flex items-center">
                        <svg className="h-4 w-4 text-green-500 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>You've fully watched this video - no more points available</span>
                      </div>
                    )}
                  </div>
                )}
                
                {fullyWatched && user?.user_type === 'viewer' && (
                  <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
                    <div className="flex items-center">
                      <div className="mr-3 flex-shrink-0">
                        <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Video Completed</p>
                        <p className="text-xs text-gray-500">You've fully watched this video. No more points can be earned.</p>
                      </div>
                    </div>
                  </div>
                )}
                
                <p className="text-gray-700 mb-6">{video.description}</p>
                
                <div className="border-t border-gray-200 pt-4">
                  {user?.user_type === 'viewer' ? (
                    <div className="flex flex-col space-y-2">
                      <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm inline-flex items-center">
                        <span className="font-medium text-indigo-800">First minute:</span>
                        <span className="ml-1 text-indigo-700">{video.points_per_minute} pts/min</span>
                      </span>
                      <span className="rounded-full bg-purple-100 px-3 py-1 text-sm inline-flex items-center">
                        <span className="font-medium text-purple-800">Additional time:</span>
                        <span className="ml-1 text-purple-700">{Math.floor(video.points_per_minute * 0.1)} pts/min (10% rate)</span>
                      </span>
                    </div>
                  ) : !user && (
                    <div className="text-sm text-gray-500">
                      Sign up as a viewer to earn up to {video.points_per_minute} points/min watching this video
                    </div>
                  )}
                </div>
              </>
            )}
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
                        <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 relative">
                          <img
                            src={`https://img.youtube.com/vi/${rec.youtube_id}/mqdefault.jpg`}
                            alt={rec.title}
                            className="w-full h-full object-cover group-hover:opacity-90 transition"
                          />
                          {/* Duration badge */}
                          <div className="absolute bottom-1 right-1 bg-black bg-opacity-70 text-white text-xs px-1.5 py-0.5 rounded">
                            {formatDuration(rec.duration_seconds)}
                          </div>
                          
                          {/* Watched badge */}
                          {checkIfVideoFullyWatched(rec._id) && (
                            <div className="absolute top-1 left-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded-full flex items-center">
                              <svg className="h-3 w-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                              </svg>
                              Watched
                            </div>
                          )}
                          
                          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all">
                            <PlayIcon className="h-12 w-12 text-white opacity-0 group-hover:opacity-100" />
                          </div>
                        </div>
                      </Link>
                      
                      {/* Only show watchlist button for logged-in viewers */}
                      {user?.user_type === 'viewer' && (
                        <button
                          onClick={() => handleWatchLaterClick(rec._id)}
                          className={`absolute top-2 right-2 bg-white rounded-full p-1 shadow-sm transition-opacity opacity-0 group-hover:opacity-100 ${
                            checkIfVideoFullyWatched(rec._id) ? 'bg-opacity-70 hover:bg-opacity-70 cursor-not-allowed' : 'bg-opacity-80 hover:bg-opacity-100'
                          }`}
                          title={checkIfVideoFullyWatched(rec._id) ? "You've fully watched this video" : "Add to Watch Later"}
                          disabled={checkIfVideoFullyWatched(rec._id)}
                        >
                          <BookmarkIcon className={`h-5 w-5 ${checkIfVideoFullyWatched(rec._id) ? 'text-gray-400' : 'text-indigo-600'}`} />
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
                      <div className="mt-1 flex justify-between items-center">
                        <span className="text-xs bg-indigo-50 text-indigo-800 px-2 py-1 rounded-full flex items-center">
                          <svg className="h-3 w-3 text-yellow-500 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 14.5a6.5 6.5 0 110-13 6.5 6.5 0 010 13z" />
                            <path d="M10 5a1 1 0 00-1 1v4a1 1 0 00.293.707l2.5 2.5a1 1 0 001.414-1.414L10.5 9.5V6a1 1 0 00-1-1z" />
                          </svg>
                          {rec.points_per_minute} pts/min
                        </span>
                        {rec.total_points_awarded > 0 && (
                          <span className="text-xs bg-yellow-50 text-yellow-800 px-2 py-1 rounded-full">
                            {rec.total_points_awarded} points
                          </span>
                        )}
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