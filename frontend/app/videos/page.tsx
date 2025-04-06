'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { PlayIcon, TrashIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

interface WatchlistItem {
  watchlist_id: string;
  video_id: string;
  watched: boolean;
  points_earned: boolean;
  added_at: string;
  video: {
    id: string;
    youtube_id: string;
    title: string;
    description: string;
    creator_username: string;
    points_per_minute: number;
  };
}

async function fetchWatchlist() {
  const response = await api.get('/api/watchlist');
  return response.data;
}

export default function WatchLaterPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: watchlist, isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
    enabled: !!user && user.user_type === 'viewer',
  });

  const removeMutation = useMutation({
    mutationFn: (watchlistId: string) =>
      api.delete(`/api/watchlist/${watchlistId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  if (!user || user.user_type !== 'viewer') {
    router.push('/');
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  // Calculate potential earnings
  const totalPotentialPoints = watchlist
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

      {watchlist?.length === 0 ? (
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
          {watchlist?.map((item) => (
            <div
              key={item.watchlist_id}
              className={`group relative overflow-hidden rounded-lg bg-white shadow-lg ${
                item.points_earned ? 'opacity-75' : ''
              }`}
            >
              <Link href={`/videos/${item.video.id}`}>
                <div className="relative">
                  <img
                    src={`https://img.youtube.com/vi/${item.video.youtube_id}/maxresdefault.jpg`}
                    alt={item.video.title}
                    className="h-48 w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 transition-opacity group-hover:bg-opacity-50">
                    <PlayIcon className="h-16 w-16 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </div>
              </Link>

              <div className="p-4">
                <div className="mb-2 flex items-start justify-between">
                  <Link href={`/videos/${item.video.id}`}>
                    <h2 className="text-lg font-semibold text-gray-900 hover:text-indigo-600">
                      {item.video.title}
                    </h2>
                  </Link>
                  <button
                    onClick={() => removeMutation.mutate(item.watchlist_id)}
                    className="ml-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>

                <p className="mb-4 text-sm text-gray-600 line-clamp-2">
                  {item.video.description}
                </p>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    By {item.video.creator_username}
                  </span>
                  {item.points_earned ? (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
                      Points earned
                    </span>
                  ) : (
                    <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-800">
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