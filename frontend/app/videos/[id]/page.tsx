'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlayIcon, BookmarkIcon, BookmarkSlashIcon, XMarkIcon, PauseIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
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

// Adjust toast duration setting for all toasts
const TOAST_DURATION = 15000; // 15 seconds

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
  const playerRef = useRef<any>(null); // Reference to store the YouTube player instance
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
            duration: TOAST_DURATION,
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
  
  // Update toast configuration for point earnings
  const showPointsEarnedToast = (points: number) => {
    toast.success(
      <div className="flex items-center space-x-2">
        <span className="font-bold text-lg">+{points} points!</span>
        <span className="text-sm">(continue for bonus points)</span>
      </div>,
      {
        duration: TOAST_DURATION,
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
  };

  // Modify handleReportWatchTime to use the new toast function
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
              duration: TOAST_DURATION,
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
        ), { duration: TOAST_DURATION, id: 'navbar-points-update' });
        
        // Show main points earned toast
        showPointsEarnedToast(result.points_earned);
        
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
          { duration: TOAST_DURATION, position: 'top-center', id: 'celebratory-toast' }
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
      // Use the stored player reference if available
      if (playerRef.current && typeof playerRef.current.getPlayerState === 'function') {
        const playerState = playerRef.current.getPlayerState();
        // YT.PlayerState.PLAYING = 1, YT.PlayerState.PAUSED = 2
        if (playerState === 1) {
          playerRef.current.pauseVideo();
        } else {
          playerRef.current.playVideo();
        }
        return; // Let the state update come from the player state change event
      }
      
      // Fallback to YouTube iframe API if playerRef is not available
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
        playerRef.current = player;
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
        
        // Seek to the saved time position if available
        const savedTime = getWatchTime(videoId);
        if (savedTime > 0) {
          console.log(`Seeking to saved time: ${savedTime} seconds`);
          // Seek to saved position
          event.target.seekTo(savedTime);
          // Ensure video plays after seeking
          setTimeout(() => {
            if (event.target && typeof event.target.playVideo === 'function') {
              event.target.playVideo();
              setWatchTime(savedTime);
            }
          }, 500);
        }
      } catch (error) {
        console.error('Error getting video duration or seeking:', error);
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
    }, 30000);
    
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
            duration: TOAST_DURATION,
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
    
    toast.success('Watch progress reset', {
      duration: TOAST_DURATION
    });
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
              duration: TOAST_DURATION, 
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
      
      {/* Back button */}
      <div className="mb-4">
        <button 
          onClick={() => router.back()}
          className="inline-flex items-center text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-1" />
          <span>Back</span>
        </button>
      </div>
      
      {/* Main content area with video player and tracker side by side */}
      <div className="flex flex-col space-y-8">
        {/* Video player and tracker side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Video player - 3/4 width on large screens */}
          <div className="lg:col-span-3 w-full">
            {renderWarningBanner()}
            
            {/* Video title above player */}
            {video && (
              <div className="mb-3">
                <h1 className="text-2xl font-bold text-gray-900">{video.title}</h1>
                <div className="flex items-center text-sm text-gray-500 mt-1">
                  <span>By {video.creator_username}</span>
                  <span className="mx-2">•</span>
                  <span>{formatDuration(video.duration_seconds)}</span>
                  {fullyWatched && (
                    <>
                      <span className="mx-2">•</span>
                      <span className="inline-flex items-center text-green-600">
                        <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Fully Watched
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
            
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
    
          </div>
          
          {/* Tracker sidebar - 1/4 width on large screens */}
          <div className="lg:col-span-1">
            {video && user?.user_type === 'viewer' && (
              <div className="bg-white rounded-lg shadow-lg p-5 sticky top-24 h-fit">
                <h3 className="text-lg font-semibold mb-4 border-b pb-2">Points Tracker</h3>
                
                {/* Watch time display */}
                <div className={`mb-3 rounded-lg px-4 py-2 ${
                  fullyWatched 
                    ? 'bg-gray-100'
                    : isPlaying 
                      ? 'bg-indigo-50 border border-indigo-100' 
                      : 'bg-gray-50'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Watch Time:</span>
                    <span className={`font-bold ${isPlaying && !fullyWatched ? 'text-indigo-600 animate-pulse' : 'text-gray-700'}`}>
                      {Math.floor(watchTime / 60)}m {watchTime % 60}s
                    </span>
                  </div>
                  
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                    <div 
                      className={`h-1.5 rounded-full ${fullyWatched ? 'bg-green-600' : 'bg-indigo-600'}`}
                      style={{ 
                        width: `${calculateProgress(watchTime, video.duration_seconds)}%` 
                      }}
                    ></div>
                  </div>
                  
                  {/* Status indicator */}
                  <div className="mt-2 flex items-center">
                    {isPlaying && !fullyWatched ? (
                      <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full flex items-center">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 mr-1.5 animate-pulse"></span>
                        Currently watching
                      </span>
                    ) : !isPlaying && !fullyWatched ? (
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full flex items-center">
                        <PauseIcon className="w-3 h-3 mr-1" />
                        Paused
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full flex items-center">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Fully watched
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Points info */}
                <div className="mb-4 border rounded-lg p-3 bg-gray-50">
                  <h4 className="font-medium text-sm text-gray-800 mb-2">Points Available:</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">First minute:</span>
                      <span className="text-sm font-semibold text-indigo-700">{video.points_per_minute} pts</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">Continued watching:</span>
                      <span className="text-sm font-semibold text-purple-700">{Math.floor(video.points_per_minute * 0.1)} pts/min</span>
                    </div>
                    {video.total_points_awarded > 0 && (
                      <div className="flex justify-between items-center pt-1 mt-1 border-t border-gray-200">
                        <span className="text-xs text-gray-600">You've earned:</span>
                        <span className="text-sm font-semibold text-green-700">{video.total_points_awarded} pts</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Points status */}
                {!hasEarnedPoints && !alreadyEarnedForThisVideo && !fullyWatched && (
                  <div className={`mb-3 rounded-lg p-3 ${
                    isPlaying && watchTime < 60
                      ? 'bg-yellow-50 border border-yellow-100'
                      : 'bg-gray-50 border border-gray-100' 
                  }`}>
                    {watchTime < 60 ? (
                      <div>
                        <h4 className="text-sm font-medium mb-1">
                          {isPlaying ? 'Earning Status:' : 'Paused:'}
                        </h4>
                        <div className="text-xs">
                          Watch {60 - watchTime} more seconds to earn {video.points_per_minute} points
                          {!isPlaying && ' (timer paused)'}
                        </div>
                        <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
                          <div 
                            className="h-1 rounded-full bg-yellow-500"
                            style={{ width: `${(watchTime / 60) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm">
                        You'll earn {video.points_per_minute} points after watching for 1 minute
                      </div>
                    )}
                  </div>
                )}
                
                {(hasEarnedPoints || alreadyEarnedForThisVideo) && !fullyWatched && (
                  <div className="mb-3 rounded-lg p-3 bg-green-50 border border-green-100">
                    <h4 className="text-sm font-medium text-green-800 mb-1">
                      Points Earned!
                    </h4>
                    <p className="text-xs text-green-700 mb-2">
                      Continue watching to earn bonus points
                    </p>
                    {isPlaying && (
                      <div className="flex items-center bg-yellow-100 px-2 py-1 rounded text-xs text-yellow-800 animate-pulse">
                        <svg className="h-3 w-3 text-yellow-500 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 14.5a6.5 6.5 0 110-13 6.5 6.5 0 010 13z" />
                          <path d="M10 5a1 1 0 00-1 1v4a1 1 0 00.293.707l2.5 2.5a1 1 0 001.414-1.414L10.5 9.5V6a1 1 0 00-1-1z" />
                        </svg>
                        Currently earning {Math.floor(video.points_per_minute * 0.1)} pts/min
                      </div>
                    )}
                  </div>
                )}
                
                {fullyWatched && (
                  <div className="mb-3 rounded-lg p-3 bg-gray-50 border border-gray-200">
                    <div className="flex items-start">
                      <svg className="h-4 w-4 text-green-500 mt-0.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <div>
                        <h4 className="text-sm font-medium text-gray-800">
                          Video Completed
                        </h4>
                        <p className="text-xs text-gray-600 mt-1">
                          You've fully watched this video. No more points available.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Video controls */}
                <div className="flex flex-col space-y-2 mt-4">
                  <button
                    onClick={handlePlayPauseClick}
                    disabled={fullyWatched}
                    className={`w-full flex items-center justify-center py-2 px-3 rounded-md ${
                      fullyWatched 
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : isPlaying
                          ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <PauseIcon className="h-4 w-4 mr-2" />
                        Pause Video
                      </>
                    ) : (
                      <>
                        <PlayIcon className="h-4 w-4 mr-2" />
                        Play Video
                      </>
                    )}
                  </button>
                  
                  {watchTime > 10 && (
                    <button
                      onClick={resetWatchProgress}
                      className="w-full flex items-center justify-center py-2 px-3 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      Restart Video
                    </button>
                  )}
                  
                  {!fullyWatched && (
                    <button
                      onClick={() => handleWatchLaterClick(video._id)}
                      disabled={isUpdating}
                      className="w-full flex items-center justify-center py-2 px-3 rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
                    >
                      <BookmarkIcon className="h-4 w-4 mr-2" />
                      {watchlistItem ? 'Remove from Watchlist' : 'Add to Watchlist'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Recommended videos section - placed below the main video and sidebar */}
        <div className="w-full">
          <div className="bg-white rounded-lg p-4 shadow-lg">
            <h2 className="text-xl font-semibold mb-4">More Videos</h2>
            
            {recommendedLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredRecommendedVideos.map((rec) => (
                  <div
                    key={rec._id}
                    className="group overflow-hidden rounded-lg bg-white shadow-lg transition-transform hover:scale-105"
                  >
                    <div className="relative h-48">
                      {/* Video preview - autoplaying but muted */}
                      <iframe
                        src={`https://www.youtube.com/embed/${rec.youtube_id}?autoplay=1&mute=1&controls=0&modestbranding=1&showinfo=0&rel=0&loop=1&playlist=${rec.youtube_id}&start=5&end=15`}
                        title={rec.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        className="absolute inset-0 w-full h-full"
                      ></iframe>
                      
                      {/* Click overlay to go to video page */}
                      <Link href={`/videos/${rec._id}`} className="absolute inset-0 z-10">
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
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded z-20">
                        {formatDuration(rec.duration_seconds)}
                      </div>
                      
                      {/* Watched badge */}
                      {checkIfVideoFullyWatched(rec._id) && (
                        <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded-full flex items-center z-20">
                          <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                          </svg>
                          Watched
                        </div>
                      )}
                    </div>
                    
                    <div className="p-4">
                      <Link href={`/videos/${rec._id}`}>
                        <h3 className="mb-2 text-base font-semibold text-gray-900 line-clamp-2 hover:text-indigo-600">
                          {rec.title}
                        </h3>
                      </Link>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">
                          By {rec.creator_username}
                        </span>
                        {user?.user_type === 'viewer' ? (
                          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs text-indigo-800">
                            Earn {rec.points_per_minute} pts/min
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                            {rec.points_per_minute} pts/min
                          </span>
                        )}
                      </div>
                      
                      {/* Only show watchlist button for logged-in viewers */}
                      {user?.user_type === 'viewer' && (
                        <div className="mt-2 flex justify-end">
                          <button
                            onClick={() => handleWatchLaterClick(rec._id)}
                            disabled={checkIfVideoFullyWatched(rec._id)}
                            className={`flex items-center justify-center py-1 px-2 rounded-md text-xs ${
                              checkIfVideoFullyWatched(rec._id) 
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                            }`}
                          >
                            <BookmarkIcon className="h-3 w-3 mr-1" />
                            {checkIfVideoFullyWatched(rec._id) ? 'Watched' : 'Watch Later'}
                          </button>
                        </div>
                      )}
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