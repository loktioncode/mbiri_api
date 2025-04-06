'use client';

import React from 'react';
import { useAuth } from '@/lib/auth';

export default function AboutPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-gray-900">About Mbiri</h1>
        <p className="mt-4 text-xl text-gray-600">
          Learn, watch, and earn real-world rewards
        </p>
      </div>

      <div className="mb-12 rounded-lg bg-white p-8 shadow-lg">
        <h2 className="mb-6 text-2xl font-semibold text-gray-900">What is Mbiri?</h2>
        
        <p className="mb-4 text-gray-700">
          Mbiri is an innovative platform connecting content creators with viewers in a mutually 
          beneficial ecosystem. Our name, "Mbiri," represents the value and reputation that both 
          creators and viewers build together in our community.
        </p>
        
        <p className="mb-8 text-gray-700">
          We believe that quality educational content deserves recognition, and that viewers 
          should be rewarded for their time and attention. That's why we've built a platform 
          where everyone benefits.
        </p>

        <div className="mb-8 grid gap-8 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-6">
            <h3 className="mb-4 text-xl font-medium text-indigo-600">For Viewers</h3>
            <ul className="ml-6 list-disc space-y-2 text-gray-700">
              <li>Watch educational videos from quality creators</li>
              <li>Earn points for every minute watched (min. 1 minute per video)</li>
              <li>Track your learning progress</li>
              <li>Redeem points for real-world coupons and rewards</li>
              <li>Build your knowledge while earning benefits</li>
            </ul>
          </div>
          
          <div className="rounded-lg border border-gray-200 p-6">
            <h3 className="mb-4 text-xl font-medium text-indigo-600">For Creators</h3>
            <ul className="ml-6 list-disc space-y-2 text-gray-700">
              <li>Share your educational content with engaged viewers</li>
              <li>Build your reputation and audience</li>
              <li>Set custom point values for your content</li>
              <li>Receive detailed analytics on engagement</li>
              <li>Connect with viewers who value your content</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mb-12 rounded-lg bg-indigo-50 p-8">
        <h2 className="mb-6 text-2xl font-semibold text-gray-900">Points to Real-World Rewards</h2>
        
        <p className="mb-6 text-gray-700">
          What makes Mbiri unique is our points system that translates your viewing time into 
          actual rewards. Here's how it works:
        </p>
        
        <div className="mb-8 space-y-4">
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <h3 className="font-medium text-gray-900">Earn Points</h3>
            <p className="text-gray-700">
              Earn points based on each video's points-per-minute rate. You must watch at least 1 
              minute of a video to earn any points, and you can only earn points once per video.
            </p>
          </div>
          
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <h3 className="font-medium text-gray-900">Accumulate Points</h3>
            <p className="text-gray-700">
              Your points are automatically tracked in your account. Watch more videos to 
              accumulate more points. Check your points balance anytime in your profile.
            </p>
          </div>
          
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <h3 className="font-medium text-gray-900">Redeem for Coupons</h3>
            <p className="text-gray-700">
              Once you've accumulated enough points, you can redeem them for real-world coupons 
              from our partner businesses - from coffee shops to online services, bookstores to 
              subscription discounts.
            </p>
          </div>
          
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <h3 className="font-medium text-gray-900">Use Your Coupons</h3>
            <p className="text-gray-700">
              Each coupon comes with simple instructions for redemption. Digital coupons can be 
              used online, while physical coupons can be shown at participating locations.
            </p>
          </div>
        </div>
        
        {!user && (
          <div className="rounded-lg bg-indigo-100 p-4 text-center">
            <p className="mb-4 text-lg font-medium text-indigo-800">
              Ready to start earning rewards?
            </p>
            <div className="space-x-4">
              <a
                href="/register"
                className="inline-block rounded-lg bg-indigo-600 px-6 py-3 text-white hover:bg-indigo-700"
              >
                Sign Up Now
              </a>
              <a
                href="/login"
                className="inline-block rounded-lg border border-indigo-600 px-6 py-3 text-indigo-600 hover:bg-indigo-50"
              >
                Log In
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-white p-8 shadow-lg">
        <h2 className="mb-6 text-2xl font-semibold text-gray-900">Join Our Community</h2>
        
        <p className="mb-4 text-gray-700">
          Mbiri is more than just a platform - it's a community of learners and educators 
          working together. Whether you're here to learn or to share knowledge, you're 
          helping build a new model for educational content that values everyone's contribution.
        </p>
        
        <p className="text-gray-700">
          We're constantly adding new features and partner businesses to improve your 
          experience and expand the rewards you can earn. Have suggestions? We'd love to hear from 
          you at <a href="mailto:contact@mbiri.com" className="text-indigo-600 hover:underline">contact@mbiri.com</a>.
        </p>
      </div>
    </div>
  );
} 