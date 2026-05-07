'use client';

import React, { useState } from 'react';
import { AnimatedDock } from '@/components/ui/animated-dock';
import { Home, Activity, Book, Settings, Brain, Gamepad2 } from 'lucide-react';


export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [vibration, setVibration] = useState(false);
  const [dataSharing, setDataSharing] = useState(true);

  // Dynamic button configuration
  const dockItems = [
    {
      link: "/",
      Icon: <Home size={22} />,
    },
    {
      link: "/device",
      Icon: <Activity size={22} />,
    },
    {
      link: "/rehab-game",
      Icon: <Gamepad2 size={22} />,
    },
    {
      link: "/records",
      Icon: <Book size={22} />,
    },
    {
      link: "/ai-analysis",
      Icon: <Brain size={22} />,
    },
    {
      link: "/settings",
      Icon: <Settings size={22} />,
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-900">
      <main className="container mx-auto py-12 max-w-3xl">
        <h1 className="text-3xl font-bold text-center mb-8">System Settings</h1>

        <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg overflow-hidden">
          {/* Appearance settings */}
          <div className="p-6 border-b border-gray-200 dark:border-neutral-700">
            <h2 className="text-xl font-semibold mb-4">Appearance</h2>
            <div className="flex items-center justify-between py-3">
              <span>Dark Mode</span>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`relative w-12 h-6 rounded-full transition-colors ${darkMode ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${darkMode ? 'left-7' : 'left-1'}`}
                ></span>
              </button>
            </div>
          </div>

          {/* Notification settings */}
          <div className="p-6 border-b border-gray-200 dark:border-neutral-700">
            <h2 className="text-xl font-semibold mb-4">Notifications</h2>
            <div className="flex items-center justify-between py-3">
              <span>Enable Notifications</span>
              <button
                onClick={() => setNotifications(!notifications)}
                className={`relative w-12 h-6 rounded-full transition-colors ${notifications ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${notifications ? 'left-7' : 'left-1'}`}
                ></span>
              </button>
            </div>
            <div className="flex items-center justify-between py-3">
              <span>Vibration Alerts</span>
              <button
                onClick={() => setVibration(!vibration)}
                className={`relative w-12 h-6 rounded-full transition-colors ${vibration ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${vibration ? 'left-7' : 'left-1'}`}
                ></span>
              </button>
            </div>
          </div>

          {/* Data settings */}
          <div className="p-6 border-b border-gray-200 dark:border-neutral-700">
            <h2 className="text-xl font-semibold mb-4">Data & Privacy</h2>
            <div className="flex items-center justify-between py-3">
              <span>Share Anonymous Data</span>
              <button
                onClick={() => setDataSharing(!dataSharing)}
                className={`relative w-12 h-6 rounded-full transition-colors ${dataSharing ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${dataSharing ? 'left-7' : 'left-1'}`}
                ></span>
              </button>
            </div>
          </div>

          {/* Account settings */}
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">Account</h2>
            <div className="flex items-center justify-between py-3">
              <span>Logout</span>
              <button className="text-blue-500 hover:text-blue-700">
                Click to Logout
              </button>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-red-500">Delete Account</span>
              <button className="text-red-500 hover:text-red-700">
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Add floating dynamic buttons */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <AnimatedDock items={dockItems} />
      </div>
    </div>
  );
}