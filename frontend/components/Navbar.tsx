'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { HomeIcon, VideoCameraIcon, TrophyIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/lib/auth';

const navigation = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Videos', href: '/videos', icon: VideoCameraIcon },
  { name: 'Leaderboard', href: '/leaderboard', icon: TrophyIcon },
];

export default function Navbar() {
  const pathname = usePathname();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { user, logout, isLoading } = useAuth();

  return (
    <nav className="bg-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <div className="flex flex-shrink-0 items-center">
              <Link href="/" className="text-xl font-bold text-indigo-600">
                VideoLearn
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                      isActive
                        ? 'border-b-2 border-indigo-500 text-gray-900'
                        : 'border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    <item.icon className="mr-2 h-5 w-5" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center">
            {isLoading ? (
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
            ) : user ? (
              <div className="relative ml-3">
                <button
                  type="button"
                  className="flex items-center rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                >
                  <span className="mr-2 text-gray-700">{user.username}</span>
                  {user.user_type === 'viewer' && (
                    <span className="mr-2 rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-800">
                      {user.points} pts
                    </span>
                  )}
                  <UserCircleIcon className="h-8 w-8 text-gray-400" />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                    <Link
                      href="/profile"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      Your Profile
                    </Link>
                    {user.user_type === 'viewer' && (
                      <Link
                        href="/points"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        Points History
                      </Link>
                    )}
                    {user.user_type === 'creator' && (
                      <Link
                        href="/videos/new"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        Upload Video
                      </Link>
                    )}
                    <button
                      className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => {
                        logout();
                        setIsUserMenuOpen(false);
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Link
                  href="/login"
                  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-gray-50"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
} 