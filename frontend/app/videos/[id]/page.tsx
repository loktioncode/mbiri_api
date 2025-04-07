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
    console.log(`Making API call to record watch session: video=${videoId}, duration=${watchDuration}s`);
    
    // Add timestamp to ensure the request is unique (prevent browser caching)
    const timestamp = new Date().getTime();
    const url = `/api/videos/${videoId}/watch?watch_duration=${watchDuration}&t=${timestamp}`;
    
    const response = await api.post(url);
    
    if (response.status !== 200) {
      console.error(`Error recording watch session: HTTP ${response.status} - ${response.statusText}`);
      return null;
    }
    
    console.log(`Watch session recorded successfully: ${watchDuration}s`);
    return response.data;
  } catch (error) {
    console.error('Error recording watch session:', error);
    
    // If there's a server-side error, don't keep retrying - return null
    return null;
  }
}

async function updateVideoDuration(videoId: string, durationSeconds: number) {
  try {
    console.log(`Updating video duration in the backend: video=${videoId}, duration=${durationSeconds} seconds`);
    
    // Only use the ObjectId portion of the video ID if it matches the pattern
    let objectIdPattern = /[0-9a-f]{24}/i;
    let match = videoId.match(objectIdPattern);
    
    const cleanVideoId = match ? match[0] : videoId;
    console.log(`Using clean ObjectId: ${cleanVideoId}`);
    
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    
    // Construct the URL - use POST which seems to work better with FastAPI
    const url = `/api/videos/${cleanVideoId}/duration?duration_seconds=${durationSeconds}&t=${timestamp}`;
    console.log(`Making API request to URL: ${url} (using POST)`);
    
    try {
      // Use POST instead of PUT to avoid 404 errors
      const response = await api.post(url);
      console.log('Duration update response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Error updating video duration via POST:', error);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      
      // Continue even if the duration update fails - it's not critical
      return {
        success: false,
        message: 'Could not update video duration, but continuing playback'
      };
    }
  } catch (error: any) {
    console.error('Error in updateVideoDuration:', error);
    
    // Don't prevent video playback if duration update fails
    console.log('Continuing with video playback despite duration update failure');
    return {
      success: false,
      message: 'Error in duration update process, continuing playback'
    };
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
    console.log(`Using default duration (600s) for progress calculation - current watch time: ${currentTime}s`);
    totalDuration = 600;
  } else {
    console.log(`Calculating progress: ${currentTime}s of ${totalDuration}s = ${Math.min((currentTime / totalDuration) * 100, 100).toFixed(1)}%`);
  }
  
  // Ensure progress is between 0-100%
  return Math.min(Math.max(0, (currentTime / totalDuration) * 100), 100);
};

// Adjust toast duration setting for all toasts
const TOAST_DURATION = 1500; 

// Constant for bonus points rate (fixed 1 point per minute)
const POINTS_PER_MINUTE = 1;

// Add function to fetch watch time from backend
async function fetchWatchTime(videoId: string) {
  try {
    console.log(`Fetching watch time for video ${videoId} from backend`);
    const response = await api.get(`/api/videos/${videoId}/watch-time`);
    return response.data;
  } catch (error) {
    console.error('Error fetching watch time:', error);
    return null;
  }
}

export default function VideoPage() {
  const params = useParams();
  const videoId = params.id as string;
  const { user, updatePoints } = useAuth();
  const router = useRouter();
  const [watchlistItem, setWatchlistItem] = useState<WatchlistItem | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [watchTime, setWatchTime] = useState(0);
  const watchTimeRef = useRef(0);
  const [hasEarnedPoints, setHasEarnedPoints] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
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
  const [watchSessionStarted, setWatchSessionStarted] = useState(false);
  const [fullyWatched, setFullyWatched] = useState(false);
  const previousVideoIdRef = useRef<string | null>(null);
  const reportingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastReportTimeRef = useRef<number>(0);
  
  // Progress tracking
  const [progress, setProgress] = useState(0);

  // Add a state variable to track the actual player state
  const [playerState, setPlayerState] = useState<number>(0);

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
  
  // Track watch time and report to API - only for logged-in viewers
  useEffect(() => {
    // Skip all tracking for guest users
    if (user?.user_type !== 'viewer' || !videoData || !isVideoMounted) return;

    // Clear any existing interval
    if (watchTimeIntervalRef.current) {
      clearInterval(watchTimeIntervalRef.current);
      watchTimeIntervalRef.current = null;
    }
    
    return () => {
      if (watchTimeIntervalRef.current) {
        clearInterval(watchTimeIntervalRef.current);
        watchTimeIntervalRef.current = null;
      }
    };
  }, [user, videoData, isVideoMounted, videoId]);
  
  // Reset state when video changes
  useEffect(() => {
    if (!videoId) return;
    // Reset state when video ID changes
    lastReportTimeRef.current = 0;
  }, [videoId]);
  
  // Add a throttled API reporting system (every 60 seconds exactly)
  useEffect(() => {
    // Only set up reporting if conditions are met
    if (
      user?.user_type === 'viewer' && 
      isPlaying && 
      watchTime >= 60 // At least 1 minute watched
    ) {
      console.log('Setting up continued watching reporting interval (60s)');
      
      // First clear any existing timer to avoid duplicates
      if (reportingIntervalRef.current) {
        clearInterval(reportingIntervalRef.current);
      }
      
      // Set up interval to report continued watching time every 60 seconds exactly
      const interval = setInterval(() => {
        console.log(`Reporting continued watching time: ${watchTime} seconds`);
        handleReportWatchTime();
      }, 60000); // 60 seconds exactly
      
      // Store the interval ID in a ref so we can clear it
      reportingIntervalRef.current = interval;
      
      return () => {
        if (reportingIntervalRef.current) {
          clearInterval(reportingIntervalRef.current);
          reportingIntervalRef.current = null;
        }
      };
    }
  }, [isPlaying, user]);
  
  // Report final watch time when unmounting
  useEffect(() => {
    return () => {
      if (user?.user_type === 'viewer' && watchTime > 0) {
        console.log(`Reporting final watch time on unmount: ${watchTime} seconds`);
        handleReportWatchTime();
      }
    };
  }, [watchTime, user, videoId]);
  
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

  // Modify handleReportWatchTime to use the watchTime state with throttling
  const handleReportWatchTime = async () => {
    if (!(user?.user_type === 'viewer') || !video) return;
    
    // Only report if the video is actually playing
    try {
      let isCurrentlyPlaying = isPlaying;
      
      // Double-check with the actual player state
      if (playerRef.current && typeof playerRef.current.getPlayerState === 'function') {
        const actualState = playerRef.current.getPlayerState();
        
        // YT.PlayerState.PLAYING = 1
        if (actualState !== 1 && isCurrentlyPlaying) {
          console.log(`Player says it's not playing (state=${actualState}), but our state says it is. Syncing state.`);
          setIsPlaying(false);
          isCurrentlyPlaying = false;
        }
      }
      
      // Skip reporting if player is not active
      if (!isCurrentlyPlaying && !fullyWatched) {
        console.log('Skipping report - video is not actively playing');
        return;
      }
    } catch (error) {
      console.error('Error checking player state:', error);
      // Continue with report even if we can't check player state
    }
    
    // Check if enough time has passed since last report (minimum 30 seconds between reports)
    const now = Date.now();
    if (now - lastReportTimeRef.current < 30000) {
      console.log(`Skipping report - too soon since last report (${Math.floor((now - lastReportTimeRef.current)/1000)}s ago)`);
      return;
    }
    
    try {
      console.log(`Reporting watch time: ${watchTime} seconds for video ${videoId}`);
      const result = await recordWatchSession(videoId, watchTime);
      console.log("Watch session report result:", result);
      
      // Update last report time
      lastReportTimeRef.current = now;
      
      // Update video information with duration if available
      if (result?.video_duration && result.video_duration > 0) {
        console.log(`Got video duration from API: ${result.video_duration} seconds`);
        
        // Determine which duration is more accurate - prefer the larger one
        // (YouTube API sometimes reports shorter duration than the actual video)
        const currentDuration = video.duration_seconds || 0;
        const newDuration = result.video_duration;
        const finalDuration = Math.max(currentDuration, newDuration);
        
        console.log(`Current duration: ${currentDuration}s, API duration: ${newDuration}s, Using: ${finalDuration}s`);
        
        // Only update if the duration has changed
        if (finalDuration !== currentDuration) {
          setVideo(prev => {
            if (!prev) return null;
            return {
              ...prev,
              duration_seconds: finalDuration
            };
          });
        }
        
        // Update progress
        if (result.completion_percentage) {
          console.log(`Completion percentage from API: ${result.completion_percentage}%`);
          setProgress(result.completion_percentage);
        }
      }
      
      // Set fully watched status
      if (result?.fully_watched) {
        console.log("Video fully watched");
        setFullyWatched(true);
      }
      
      // Check if user has already earned points for this video
      if (result?.already_earned) {
        console.log("User already earned points for this video");
        setAlreadyEarnedForThisVideo(true);
    
        // Show a notification about continuing points if points were earned in this session
        if (result?.continuing_points && result?.points_earned > 0) {
          console.log(`Earned ${result.points_earned} points for continued watching`);
          // Update points in the navbar with visual feedback
          updatePoints(result.points_earned);
          
          // Show continuing points notification
          toast.success(
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg">+{result.points_earned} points!</span>
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
        } else {
          console.log("No bonus points earned in this session");
        }
      } else if (result?.points_earned > 0) {
        // First time earning points
        console.log(`First time earnings: ${result.points_earned} points`);
        
        // Update points in the navbar with visual feedback
        updatePoints(result.points_earned);
        
        // Show main points earned toast
        showPointsEarnedToast(result.points_earned);
        
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

  // Update the onPlayerStateChange handler to track the actual state
  const onPlayerStateChange = (event: any) => {
    const newState = event.data;
    setPlayerState(newState);
    
    // YT.PlayerState.PLAYING = 1, YT.PlayerState.PAUSED = 2, YT.PlayerState.ENDED = 0
    if (newState === 1) {
      // Video is playing
      setIsPlaying(true);
      // Start timer
      if (watchTimeIntervalRef.current) {
        clearInterval(watchTimeIntervalRef.current);
      }
      watchTimeIntervalRef.current = setInterval(() => {
        setWatchTime(prev => {
          const newTime = prev + 1;
          watchTimeRef.current = newTime;
          return newTime;
        });
      }, 1000);
    } else if (newState === 2 || newState === 0) {
      // Video is paused or ended
      setIsPlaying(false);
      // Stop timer
      if (watchTimeIntervalRef.current) {
        clearInterval(watchTimeIntervalRef.current);
        watchTimeIntervalRef.current = null;
      }
    }
  };

  // Fix the onPlayerReady handler
  const onPlayerReady = (event: any) => {
    if (user?.user_type === 'viewer') {
      try {
        // First, ensure timer is stopped and state is reset
        if (watchTimeIntervalRef.current) {
          clearInterval(watchTimeIntervalRef.current);
          watchTimeIntervalRef.current = null;
        }
        setIsPlaying(false);

        const duration = event.target.getDuration();
        if (duration && !isNaN(duration) && duration > 0) {
          setVideo(prev => prev ? { ...prev, duration_seconds: duration } : null);
          updateVideoDuration(videoId, duration);
        }
        
        // Seek to saved watch time or 0
        const savedWatchTime = getWatchTime(videoId);
        if (savedWatchTime > 0) {
          event.target.seekTo(savedWatchTime);
          setWatchTime(savedWatchTime);
          // Ensure video is paused
          event.target.pauseVideo();
        } else {
          event.target.seekTo(0);
          setWatchTime(0);
          // Ensure video is paused
          event.target.pauseVideo();
        }
      } catch (error) {
        console.error('Error getting video duration:', error);
      }
    }
  };

  // Add a play button click handler
  const handlePlayClick = () => {
    try {
      if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
        playerRef.current.playVideo();
      }
    } catch (error) {
      console.error('Error playing video:', error);
    }
  };

  // Modify the initialization useEffect to fetch and sync watch times
  useEffect(() => {
    if (videoData && videoId && user?.user_type === 'viewer') {
      const initializeWatchTime = async () => {
        // First check local storage
        const localWatchTime = getWatchTime(videoId);
        
        try {
          // Fetch watch time from backend
          const backendData = await fetchWatchTime(videoId);
          
          if (backendData?.watch_duration) {
            console.log(`Got watch duration from backend: ${backendData.watch_duration}s`);
            
            // Compare with local storage and use the higher value
            const finalWatchTime = Math.max(localWatchTime, backendData.watch_duration);
            
            if (finalWatchTime > 0) {
              console.log(`Setting initial watch time to ${finalWatchTime}s`);
              setWatchTime(finalWatchTime);
              saveWatchTime(videoId, finalWatchTime);
              
              // If they've already watched more than a minute, mark as earned
              if (finalWatchTime >= 60) {
                setHasEarnedPoints(true);
                pointsEarnedNotificationShown.current = true;
              }
              
              // Show resume notification
              if (finalWatchTime > 10) {
                const minutes = Math.floor(finalWatchTime / 60);
                const seconds = finalWatchTime % 60;
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
            
            // If backend indicates video is fully watched
            if (backendData.fully_watched) {
              setFullyWatched(true);
            }
            
            // If backend indicates points were already earned
            if (backendData.points_earned) {
              setAlreadyEarnedForThisVideo(true);
            }
          }
        } catch (error) {
          console.error('Error initializing watch time:', error);
          // Fallback to local storage value if backend fetch fails
          if (localWatchTime > 0) {
            setWatchTime(localWatchTime);
          }
        }
      };
      
      initializeWatchTime();
    }
  }, [videoData, videoId, user]);

  // Fix the cleanup function in the YouTube API initialization
  useEffect(() => {
    if (!videoData || !iframeRef.current || !isVideoMounted) return;
    
    const loadYouTubeAPI = () => {
      if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag?.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }
        window.onYouTubeIframeAPIReady = initializePlayer;
      } else if (window.YT.Player) {
        initializePlayer();
      }
    };
    
    const initializePlayer = () => {
      if (!iframeRef.current?.id) return;
      
      try {
        const player = new window.YT.Player(iframeRef.current.id, {
          events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange
          }
        });
        playerRef.current = player;
      } catch (error) {
        console.error('Error initializing YouTube player:', error);
      }
    };
    
    loadYouTubeAPI();
    
    return () => {
      if (typeof window !== 'undefined') {
        window.onYouTubeIframeAPIReady = () => {};
      }
    };
  }, [videoData, isVideoMounted, user, videoId]);

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

  // Add effect to handle document visibility changes
  useEffect(() => {
    if (!user || !videoData) return;
    
    // Handler for when page visibility changes
    const handleVisibilityChange = () => {
      console.log(`Document visibility changed: ${document.visibilityState}`);
      
      if (document.visibilityState === 'hidden') {
        // Page is not visible, pause the timer and video if playing
        if (isPlaying) {
          console.log('Page hidden, pausing video and timer');
          
          // Try to pause the video player
          try {
            if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
              playerRef.current.pauseVideo();
            }
          } catch (error) {
            console.error('Error pausing video on visibility change:', error);
          }
          
          // Force isPlaying to false and clear timer
          setIsPlaying(false);
          if (watchTimeIntervalRef.current) {
            clearInterval(watchTimeIntervalRef.current);
            watchTimeIntervalRef.current = null;
          }
          
          // Save current progress
          saveWatchTime(videoId, watchTime);
        }
      } else if (document.visibilityState === 'visible') {
        // When page becomes visible again, check actual player state
        try {
          if (playerRef.current && typeof playerRef.current.getPlayerState === 'function') {
            const playerState = playerRef.current.getPlayerState();
            
            // Synchronize our state with actual player state
            // YT.PlayerState.PLAYING = 1
            const actuallyPlaying = playerState === 1;
            if (isPlaying !== actuallyPlaying) {
              console.log(`Syncing play state with YouTube player: ${actuallyPlaying ? 'playing' : 'paused'}`);
              setIsPlaying(actuallyPlaying);
            }
          }
        } catch (error) {
          console.error('Error checking player state on visibility change:', error);
        }
      }
    };
    
    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Clean up
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, videoData, isPlaying, videoId, watchTime]);

  return (
    <div className="container mx-auto px-4 py-6">
      <Toaster />
      
      <div className="mb-4">
        <button 
          onClick={() => router.back()}
          className="inline-flex items-center text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-1" />
          <span>Back</span>
        </button>
      </div>
      
      <div className="flex flex-col space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className={`${user?.user_type === 'viewer' ? 'lg:col-span-3' : 'lg:col-span-4'} w-full`}>
            {user?.user_type === 'viewer' && renderWarningBanner()}
            
            {video && (
              <div className="mb-3">
                <h1 className="text-2xl font-bold text-gray-900">{video.title}</h1>
                <div className="flex items-center text-sm text-gray-500 mt-1">
                  <span>By {video.creator_username}</span>
                  <span className="mx-2">•</span>
                  <span>{formatDuration(video.duration_seconds)}</span>
                  {user?.user_type === 'viewer' && fullyWatched && (
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
                    className="w-full h-full"
                  />
                </div>
              )}
            </div>
          </div>
          
          {video && user?.user_type === 'viewer' && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-lg p-5 sticky top-24 h-fit">
                <h3 className="text-lg font-semibold mb-4 border-b pb-2">Points Tracker</h3>
                
                {/* Watch time display */}
                <div className={`mb-3 rounded-lg px-4 py-2 transition-colors duration-300 ${
                  fullyWatched 
                    ? 'bg-gray-100'
                    : isPlaying 
                      ? 'bg-indigo-50 border border-indigo-100' 
                      : 'bg-gray-50'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Watch Time:</span>
                    <span className={`font-bold transition-colors duration-300 ${
                      isPlaying && !fullyWatched 
                        ? 'text-indigo-600' 
                        : 'text-gray-700'
                    }`}>
                      {Math.floor(watchTime / 60)}m {watchTime % 60}s
                    </span>
                  </div>
                  
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        fullyWatched ? 'bg-green-600' : 'bg-indigo-600'
                      }`}
                      style={{ 
                        width: `${progress || calculateProgress(watchTime, video.duration_seconds)}%`,
                        transition: 'width 300ms ease-out'
                      }}
                    />
                  </div>
                  
                  <div className="mt-2 flex items-center">
                    {isPlaying && !fullyWatched ? (
                      <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full flex items-center">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 mr-1.5" 
                          style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
                        />
                        {/* Currently watching */}
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
                      <span className="text-sm font-semibold text-purple-700">1 pt/min</span>
                    </div>
                    {video.total_points_awarded > 0 && (
                      <div className="flex justify-between items-center pt-1 mt-1 border-t border-gray-200">
                        <span className="text-xs text-gray-600">You've earned:</span>
                        <span className="text-sm font-semibold text-green-700">{video.total_points_awarded} pts</span>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center pt-1 mt-1 border-t border-gray-200">
                      <span className="text-xs text-gray-600">Video duration:</span>
                      <span className="text-sm font-semibold text-gray-700">
                        {formatDuration(video.duration_seconds)} ({video.duration_seconds}s)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">Progress:</span>
                      <span className="text-sm font-semibold text-gray-700">
                        {Math.round(progress || calculateProgress(watchTime, video.duration_seconds))}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Points status */}
                {!hasEarnedPoints && !alreadyEarnedForThisVideo && !fullyWatched && (
                  <div className={`mb-3 rounded-lg p-3 transition-colors duration-300 ${
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
                        <div className="mt-2 w-full bg-gray-200 rounded-full h-1 overflow-hidden">
                          <div 
                            className="h-1 rounded-full bg-yellow-500 transition-all duration-300"
                            style={{ 
                              width: `${(watchTime / 60) * 100}%`,
                              transition: 'width 300ms ease-out'
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm">
                        You earned {video.points_per_minute} points for the first minute. Continue watching to earn 1 point per minute.
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
                      Continue watching to earn 1 point per minute
                    </p>
                    <div className={`flex items-center px-2 py-1 rounded text-xs ${
                      playerState === 1 
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {playerState === 1 ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-yellow-500 mr-1.5" 
                            style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
                          />
                          Currently watching
                        </>
                      ) : (
                        <>
                          <PauseIcon className="w-3 h-3 mr-1" />
                          Paused
                        </>
                      )}
                    </div>
                  </div>
                )}
                
                {fullyWatched && (
                  <div className="mb-3 rounded-lg p-3 bg-gray-50 border border-gray-200">
                    <div className="flex items-start">
                      <svg className="h-4 w-4 text-
                      green-500 mt-0.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  {watchTime > 0 && watchTime < 60 && (
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
            </div>
          )}
        </div>
        
        <div className="w-full">
          <div className="bg-white rounded-lg p-4 shadow-lg">
            <h2 className="text-xl font-semibold mb-4">More Videos</h2>
            
            {recommendedLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredRecommendedVideos.map((rec) => (
                  <div
                    key={rec._id}
                    className="group overflow-hidden rounded-lg bg-white shadow-lg transition-transform hover:scale-105"
                  >
                    <div className="relative h-48">
                      <iframe
                        src={`https://www.youtube.com/embed/${rec.youtube_id}?autoplay=1&mute=1&controls=0&modestbranding=1&showinfo=0&rel=0&loop=1&playlist=${rec.youtube_id}&start=5&end=15`}
                        title={rec.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        className="absolute inset-0 w-full h-full"
                      />
                      
                      <Link href={`/videos/${rec._id}`} className="absolute inset-0 z-10">
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors">
                          <div className="bg-indigo-600/80 hover:bg-indigo-700/90 rounded-full p-4 flex items-center justify-center transition-all">
                            <PlayIcon className="h-8 w-8 text-white" />
                          </div>
                        </div>
                      </Link>
                      
                      <div className="absolute bottom-8 left-0 right-0 flex justify-center z-20">
                        <div className="bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                          Click to watch full video
                        </div>
                      </div>
                      
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded z-20">
                        {formatDuration(rec.duration_seconds)}
                      </div>
                      
                      {checkIfVideoFullyWatched(rec._id) && (
                        <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded-full flex items-center z-20">
                          <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
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
                            Earn {rec.points_per_minute} pts/1st min
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                            {rec.points_per_minute} pts/1st min
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