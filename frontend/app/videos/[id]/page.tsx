'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import ReactPlayer from 'react-player';
import { ClockIcon, TrophyIcon } from '@heroicons/react/24/outline';

interface Video {
  id: string;
  youtube_id: string;
  title: string;
  description: string;
  creator_username: string;
  points_per_minute: number;
}

interface WatchSession {
  video_id: string;
  watch_duration: number;
}

async function fetchVideo(id: string) {
  const response = await axios.get(`http://localhost:8000/api/videos/${id}`);
  return response.data;
}

async function recordWatchSession(session: WatchSession) {
  const response = await axios.post(
    `http://localhost:8000/api/videos/${session.video_id}/watch`,
    { watch_duration: session.watch_duration }
  );
  return response.data;
}

export default function VideoPage({ params }: { params: { id: string } }) {
  const playerRef = useRef<ReactPlayer>(null);
  const [watchTime, setWatchTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const watchTimeRef = useRef(0);
  const lastUpdateRef = useRef(Date.now());

  const { data: video, isLoading: videoLoading } = useQuery<Video>({
    queryKey: ['video', params.id],
    queryFn: () => fetchVideo(params.id),
  });

  const watchMutation = useMutation({
    mutationFn: recordWatchSession,
    onSuccess: (data) => {
      console.log('Points earned:', data.points_earned);
    },
  });

  // Update watch time every second while playing
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isPlaying) {
      intervalId = setInterval(() => {
        const now = Date.now();
        const timeDiff = now - lastUpdateRef.current;
        watchTimeRef.current += timeDiff / 1000;
        lastUpdateRef.current = now;
        setWatchTime(Math.floor(watchTimeRef.current));
      }, 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPlaying]);

  // Record watch session when user stops watching
  useEffect(() => {
    const recordSession = async () => {
      if (watchTime > 0) {
        await watchMutation.mutateAsync({
          video_id: params.id,
          watch_duration: watchTime,
        });
      }
    };

    return () => {
      recordSession();
    };
  }, []);

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
      <div className="overflow-hidden rounded-lg bg-black">
        <ReactPlayer
          ref={playerRef}
          url={`https://www.youtube.com/watch?v=${video.youtube_id}`}
          width="100%"
          height="600px"
          controls
          playing={isPlaying}
          onPlay={() => {
            setIsPlaying(true);
            lastUpdateRef.current = Date.now();
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
      </div>

      <div className="mt-6 rounded-lg bg-white p-6 shadow-lg">
        <h1 className="mb-4 text-2xl font-bold">{video.title}</h1>
        <p className="mb-6 text-gray-600">{video.description}</p>

        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-gray-500">
              <ClockIcon className="mr-2 h-5 w-5" />
              <span>Watch time: {Math.floor(watchTime)} seconds</span>
            </div>
            <div className="flex items-center text-indigo-600">
              <TrophyIcon className="mr-2 h-5 w-5" />
              <span>{video.points_per_minute} points/min</span>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            By {video.creator_username}
          </div>
        </div>
      </div>
    </div>
  );
} 