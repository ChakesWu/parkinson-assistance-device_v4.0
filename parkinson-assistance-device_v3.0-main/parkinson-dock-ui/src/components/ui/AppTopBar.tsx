'use client';

import React from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, Settings as SettingsIcon } from 'lucide-react';
import { useConnectionState } from '@/hooks/useGlobalConnection';
import { useDevicePanel } from '@/components/ui/AppShell';

export interface AppTopBarProps {
  showBack?: boolean;
}

/**
 * Top bar — header only. The persistent device side panel and settings
 * modal live in `AppShell` (mounted once at the layout level), so navigation
 * does not unmount them. Buttons here just toggle shared context state.
 */
export default function AppTopBar({ showBack }: AppTopBarProps) {
  const { isConnected } = useConnectionState();
  const { panelOpen, togglePanel, setSettingsOpen } = useDevicePanel();

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 shadow-sm z-20 relative">
      {/* Left */}
      <div className="flex items-center gap-3">
        {showBack && (
          <Link
            href="/"
            aria-label="Back to home"
            className="flex items-center justify-center h-8 w-8 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-neutral-800 transition"
          >
            <ArrowLeft size={16} />
          </Link>
        )}
        <Link
          href="/"
          className="font-semibold text-gray-900 dark:text-white tracking-tight hover:opacity-80 transition"
        >
          SteadiGrip
        </Link>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400 dark:text-gray-500 hidden sm:block">{today}</span>

        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-200 hover:shadow-sm transition-all"
        >
          <SettingsIcon size={14} />
          <span className="hidden sm:inline">Settings</span>
        </button>

        <button
          onClick={togglePanel}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
            panelOpen
              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
              : 'bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-200 hover:shadow-sm'
          }`}
        >
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-green-500' : 'bg-red-400'}`} />
          <Activity size={14} />
          <span className="hidden sm:inline">Device</span>
        </button>
      </div>
    </header>
  );
}
