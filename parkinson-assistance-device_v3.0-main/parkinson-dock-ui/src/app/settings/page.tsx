'use client';

import React from 'react';
import { AnimatedDock } from '@/components/ui/animated-dock';
import { Home, Book, Brain, Gamepad2 } from 'lucide-react';
import SettingsPanel from '@/components/device/SettingsPanel';

export default function SettingsPage() {
  // Dynamic button configuration
  const dockItems = [
    {
      link: "/",
      Icon: <Home size={22} />,
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
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-900">
      <main>
        <SettingsPanel variant="page" />
      </main>

      {/* Add floating dynamic buttons */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <AnimatedDock items={dockItems} />
      </div>
    </div>
  );
}