'use client';

import React from 'react';
import SettingsPanel from '@/components/device/SettingsPanel';
import AppTopBar from '@/components/ui/AppTopBar';

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar showBack />
      <main className="flex-1">
        <SettingsPanel variant="page" />
      </main>
    </div>
  );
}