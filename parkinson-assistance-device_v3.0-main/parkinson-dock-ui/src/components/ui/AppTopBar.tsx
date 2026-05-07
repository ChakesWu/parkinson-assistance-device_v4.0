'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export interface AppTopBarProps {
  /** Show a back arrow that navigates to `/`. */
  showBack?: boolean;
  /** Right-side content (status pills, buttons, etc.) */
  right?: React.ReactNode;
}

/**
 * Unified application top bar used across home, onboarding, device,
 * and settings pages. Always shows the SteadiGrip logo on the left;
 * page-specific actions go on the right via the `right` prop.
 */
export default function AppTopBar({ showBack, right }: AppTopBarProps) {
  return (
    <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 shadow-sm">
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
      {right && <div className="flex items-center gap-3">{right}</div>}
    </header>
  );
}
