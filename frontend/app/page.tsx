'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PlayIcon } from '@heroicons/react/24/solid';
import { UserPlusIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

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
  const { user } = useAuth();

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
        <h1 className="text-3xl font-bold">Featured Videos</h1>
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
            key={video.id}
            className="group overflow-hidden rounded-lg bg-white shadow-lg transition-transform hover:scale-105"
          >
            <Link href={`/videos/${video.id}`}>
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
            </Link>
            <div className="p-4">
              <Link href={`/videos/${video.id}`}>
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
