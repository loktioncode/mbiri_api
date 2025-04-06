'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { TrophyIcon, ClockIcon } from '@heroicons/react/24/outline';

interface PointHistory {
  video_id: string;
  video_title: string;
  points_earned: number;
  watch_duration: number;
  created_at: string;
}

interface PointsData {
  total_points: number;
  view_history: PointHistory[];
}

async function fetchPointsHistory() {
  const response = await axios.get('http://localhost:8000/api/users/points');
  return response.data;
}

export default function PointsPage() {
  const { data, isLoading, error } = useQuery<PointsData>({
    queryKey: ['points-history'],
    queryFn: fetchPointsHistory,
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
        An error occurred while loading your points history
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Your Points</h1>
          <div className="flex items-center rounded-full bg-indigo-100 px-4 py-2 text-indigo-800">
            <TrophyIcon className="mr-2 h-6 w-6" />
            <span className="text-xl font-semibold">{data?.total_points || 0}</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white shadow-lg">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Points History</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {data?.view_history.map((record) => (
            <div key={record.created_at} className="p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{record.video_title}</h3>
                <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
                  +{record.points_earned} points
                </span>
              </div>
              <div className="mt-2 flex items-center text-sm text-gray-500">
                <ClockIcon className="mr-1.5 h-4 w-4" />
                <span>Watched for {Math.floor(record.watch_duration / 60)} minutes</span>
                <span className="mx-2">•</span>
                <span>{new Date(record.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 