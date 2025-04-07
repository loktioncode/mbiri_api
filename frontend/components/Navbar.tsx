'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { HomeIcon, VideoCameraIcon, TrophyIcon, UserCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/lib/auth';

// Base navigation that's always visible
const baseNavigation = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'About', href: '/about', icon: UserCircleIcon },
];

// Navigation items only for authenticated users
const authNavigation = [
  { name: 'Videos', href: '/videos', icon: VideoCameraIcon },
  { name: 'Leaderboard', href: '/leaderboard', icon: TrophyIcon },
];

export default function Navbar() {
  const pathname = usePathname();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { user, logout, isLoading, refreshUserData } = useAuth();
  const [isPointsAnimating, setIsPointsAnimating] = useState(false);
  const prevPointsRef = useRef<number | null>(null);

  // Monitor user points for changes to trigger animation
  useEffect(() => {
    if (!user) {
      prevPointsRef.current = null;
      return;
    }
    
    // If this is the first time setting points, just store them
    if (prevPointsRef.current === null) {
      prevPointsRef.current = user.points;
      return;
    }
    
    // If points have increased, trigger the animation
    if (user.points > prevPointsRef.current) {
      setIsPointsAnimating(true);
      
      // Reset animation after it completes
      const timer = setTimeout(() => {
        setIsPointsAnimating(false);
        prevPointsRef.current = user.points;
      }, 1500); // Animation duration
      
      return () => clearTimeout(timer);
    }
    
    prevPointsRef.current = user.points;
  }, [user?.points]);

  // Determine which navigation items to show based on authentication status
  const navigationItems = user 
    ? [...baseNavigation, ...authNavigation] 
    : baseNavigation;

  // Updated points badge with animation and refresh button
  const renderPointsBadge = () => {
    if (!user || user.user_type !== 'viewer') return null;
    
    const handleRefreshPoints = async (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent opening the dropdown
      await refreshUserData();
    };
    
    return (
      <div className="flex items-center mr-2">
        <span 
          className={`rounded-full px-2 py-1 text-xs font-medium transition-all duration-500 ${
            isPointsAnimating
              ? 'animate-pulse bg-green-200 text-green-800 scale-110'
              : 'bg-indigo-100 text-indigo-800'
          }`}
        >
          {user.points} pts
          {isPointsAnimating && (
            <span className="ml-1 text-green-700">+</span>
          )}
        </span>
      </div>
    );
  };

  return (
    <nav className="bg-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <div className="flex flex-shrink-0 items-center">
              <Link href="/" className="text-xl font-bold text-indigo-600 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 mr-2">
                  <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM8.25 9.75a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5H9a.75.75 0 01-.75-.75zm4.5 0a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5a.75.75 0 01-.75-.75zm1.444 6.329a.75.75 0 00-1.388-.058l-.002.003a.75.75 0 00.048.849c.591.7 1.364 1.127 2.146 1.127.78 0 1.554-.427 2.146-1.127a.75.75 0 00.048-.849l-.002-.003a.75.75 0 00-1.388.058c-.134.158-.328.343-.804.343-.476 0-.67-.185-.804-.343z" clipRule="evenodd" />
                </svg>
                SIFA
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navigationItems.map((item) => {
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
              <div className="relative ml-3 flex items-center">
                {/* Refresh points button - separate from profile button */}
                {user.user_type === 'viewer' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      refreshUserData();
                    }}
                    className="mr-2 p-1 rounded-full hover:bg-gray-100 text-gray-500"
                    title="Refresh points"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                  </button>
                )}
                
                {/* User profile button */}
                <button
                  type="button"
                  className="flex items-center rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                >
                  <span className="mr-2 text-gray-700">{user.username}</span>
                  {renderPointsBadge()}
                  <UserCircleIcon className="h-8 w-8 text-gray-400" />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 z-50">
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