'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PlayIcon } from '@heroicons/react/24/solid';
import { api } from '@/lib/api';

interface Video {
  id: string;
  youtube_id: string;
  title: string;
  description: string;
  creator_username: string;
  points_per_minute: number;
}

async function fetchVideos() {
  const response = await api.get('/api/videos/discover');
  return response.data;
}

export default function Home() {
  const { data: videos, isLoading, error } = useQuery<Video[]>({
    queryKey: ['videos'],
    queryFn: fetchVideos,
  });

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
    <div>
      <h1 className="mb-8 text-3xl font-bold">Featured Videos</h1>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {videos?.map((video) => (
          <Link
            key={video.id}
            href={`/videos/${video.id}`}
            className="group overflow-hidden rounded-lg bg-white shadow-lg transition-transform hover:scale-105"
          >
            <div className="relative">
              <img
                src={`https://img.youtube.com/vi/${video.youtube_id}/maxresdefault.jpg`}
                alt={video.title}
                className="h-48 w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 transition-opacity group-hover:bg-opacity-50">
                <PlayIcon className="h-16 w-16 text-white opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </div>
            <div className="p-4">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">{video.title}</h2>
              <p className="mb-4 text-sm text-gray-600 line-clamp-2">{video.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">By {video.creator_username}</span>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-800">
                  {video.points_per_minute} pts/min
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
