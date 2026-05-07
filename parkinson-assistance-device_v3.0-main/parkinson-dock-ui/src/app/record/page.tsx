'use client';

import React, { useState } from 'react';
import { Activity, Mic } from 'lucide-react';
import AppTopBar from '@/components/ui/AppTopBar';
import MotionRecorder from '@/components/record/MotionRecorder';
import VoiceRecorder from '@/components/record/VoiceRecorder';

type Tab = 'motion' | 'voice';

export default function RecordPage() {
  const [tab, setTab] = useState<Tab>('motion');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar showBack />

      <main className="flex-1 container mx-auto py-10 px-4 max-w-5xl w-full">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Record</h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400 text-sm">
            Capture motion, sensor and voice data for multimodal analysis.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="inline-flex items-center gap-1 p-1 mb-6 rounded-xl bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700">
          <TabButton
            active={tab === 'motion'}
            onClick={() => setTab('motion')}
            icon={<Activity size={16} />}
            label="Motion & Sensor"
          />
          <TabButton
            active={tab === 'voice'}
            onClick={() => setTab('voice')}
            icon={<Mic size={16} />}
            label="Voice"
          />
        </div>

        {/* Content */}
        {tab === 'motion' ? <MotionRecorder /> : <VoiceRecorder />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-white dark:bg-neutral-900 text-gray-900 dark:text-white shadow-sm'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
