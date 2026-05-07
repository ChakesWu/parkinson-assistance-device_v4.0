'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Settings as SettingsIcon, X } from 'lucide-react';
import { useConnectionState } from '@/hooks/useGlobalConnection';
import DeviceDashboard from '@/components/device/DeviceDashboard';
import SettingsPanel from '@/components/device/SettingsPanel';
import AppTopBar from '@/components/ui/AppTopBar';

interface UserProfile {
  name: string;
  age: string;
  sex: string;
  race?: string;
  onboardingComplete?: boolean;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getStreak(): number {
  try {
    const raw = localStorage.getItem('parkinson_analysis_records');
    if (!raw) return 0;
    const records: Array<{ timestamp: string }> = JSON.parse(raw);
    const days = new Set(records.map((r) => r.timestamp?.split('T')[0]).filter(Boolean));
    return days.size;
  } catch {
    return 0;
  }
}

function getLastSession(): string | null {
  try {
    const raw = localStorage.getItem('parkinson_analysis_records');
    if (!raw) return null;
    const records: Array<{ timestamp: string }> = JSON.parse(raw);
    if (records.length === 0) return null;
    return records[records.length - 1].timestamp;
  } catch {
    return null;
  }
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function HomePage() {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [streak, setStreak] = useState(0);
  const [lastSession, setLastSession] = useState<string | null>(null);
  const { isConnected } = useConnectionState();

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Resizable split — right panel width in px
  const [rightWidth, setRightWidth] = useState(420);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const raw = localStorage.getItem('steadigrip_user_profile');
    if (raw) {
      try {
        const p = JSON.parse(raw) as UserProfile;
        setProfile(p);
        setHasProfile(p.onboardingComplete === true);
      } catch {
        setHasProfile(false);
      }
    } else {
      setHasProfile(false);
    }
    setStreak(getStreak());
    setLastSession(getLastSession());
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const onDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = rightWidth;

    const maxWidth = Math.floor(window.innerWidth * 0.7);
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = startX - ev.clientX;
      setRightWidth(Math.max(300, Math.min(maxWidth, startWidth + delta)));
    };
    const onUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  if (hasProfile === null) {
    return <div className="min-h-screen bg-gray-50 dark:bg-neutral-950" />;
  }

  const mainContent = (
    <div className="px-6 py-10 w-full max-w-3xl mx-auto">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {getGreeting()}{hasProfile && profile?.name ? `, ${profile.name}` : ''} 👋
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400 text-base">
          {hasProfile ? 'Welcome back to SteadiGrip!' : 'Welcome to SteadiGrip!'}
        </p>
      </div>

      {hasProfile ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <DashCard
            icon="📋"
            title="Profile"
            description="View your analysis history and progress."
            cta="View Records"
            href="/records"
            accentClass="from-blue-500 to-blue-600"
          />
          <DashCard
            icon="🔬"
            title="Record"
            description="Start a new multimodal data collection."
            cta="Start Collection"
            href="/multimodal-analysis"
            accentClass="from-indigo-500 to-indigo-600"
          />
          <DashCard
            icon="🏋️"
            title="Rehab"
            description={streak > 0 ? `🔥 ${streak}-day streak` : 'Start your rehab journey.'}
            cta="Start Session"
            href="/rehab-game"
            accentClass="from-purple-500 to-purple-600"
            extra={lastSession ? `Last: ${formatRelativeTime(lastSession)}` : undefined}
          />
        </div>
      ) : (
        <div className="relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pointer-events-none select-none">
            <BlurCard icon="📋" title="Profile" />
            <BlurCard icon="🏋️" title="Rehab" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="mt-40 bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-neutral-700 p-8 w-full max-w-sm text-center">
              <div className="text-5xl mb-4">🩺</div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Build your SteadiGrip Profile Today
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                Complete your first data collection to unlock your personalised dashboard.
              </p>
              <Link
                href="/onboarding"
                className="block w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all"
              >
                Continue
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col overflow-hidden">
      <AppTopBar
        right={
          <>
            <span className="text-sm text-gray-400 dark:text-gray-500 hidden sm:block">{today}</span>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-200 hover:shadow-sm transition-all"
            >
              <SettingsIcon size={14} />
              Settings
            </button>
            <button
              onClick={() => setPanelOpen((o) => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                panelOpen
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                  : 'bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-200 hover:shadow-sm'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-400'}`} />
              <Activity size={14} />
              Device
            </button>
          </>
        }
      />

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main scroll area */}
        <div className="flex-1 overflow-y-auto">
          {mainContent}
        </div>

        {/* ── Desktop split panel ── */}
        {panelOpen && !isMobile && (
          <>
            {/* Draggable divider */}
            <div
              onMouseDown={onDividerMouseDown}
              className="flex-shrink-0 w-1.5 cursor-col-resize bg-gray-200 dark:bg-neutral-700 hover:bg-blue-400 dark:hover:bg-blue-600 transition-colors active:bg-blue-500"
            />
            {/* Right panel */}
            <div
              style={{ width: rightWidth }}
              className="flex-shrink-0 flex flex-col bg-white dark:bg-neutral-900 border-l border-gray-200 dark:border-neutral-800 overflow-hidden"
            >
              {/* Minimal close row */}
              <div className="flex items-center justify-end px-3 py-2 border-b border-gray-200 dark:border-neutral-800 flex-shrink-0">
                <button
                  onClick={() => setPanelOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              {/* Panel content */}
              <div className="flex-1 overflow-y-auto">
                <DeviceDashboard variant="modal" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Mobile bottom sheet ── */}
      <AnimatePresence>
        {panelOpen && isMobile && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-40 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPanelOpen(false)}
            />
            {/* Sheet */}
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-white dark:bg-neutral-900 rounded-t-2xl shadow-2xl"
              style={{ maxHeight: '80vh' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              {/* Drag handle + close */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex-1 flex justify-center">
                  <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-neutral-600" />
                </div>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                <DeviceDashboard variant="sheet" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Settings pop-up modal ── */}
      <AnimatePresence>
        {settingsOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSettingsOpen(false)}
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            >
              <div className="pointer-events-auto w-full max-w-2xl max-h-[80vh] flex flex-col bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-neutral-800 flex-shrink-0">
                  <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                    <SettingsIcon size={16} />
                    Settings
                  </div>
                  <button
                    onClick={() => setSettingsOpen(false)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <SettingsPanel variant="embedded" />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function BlurCard({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="border-2 border-dashed border-gray-300 dark:border-neutral-700 rounded-2xl p-6 h-52 blur-sm opacity-40 bg-white dark:bg-neutral-800">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">{title}</h3>
      <div className="space-y-2">
        <div className="h-3 bg-gray-200 dark:bg-neutral-600 rounded-full w-4/5" />
        <div className="h-3 bg-gray-200 dark:bg-neutral-600 rounded-full w-3/5" />
        <div className="h-8 bg-gray-200 dark:bg-neutral-600 rounded-xl w-2/5 mt-4" />
      </div>
    </div>
  );
}

function DashCard({
  icon,
  title,
  description,
  cta,
  href,
  accentClass,
  extra,
}: {
  icon: string;
  title: string;
  description: string;
  cta: string;
  href: string;
  accentClass: string;
  extra?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-2xl p-6 hover:shadow-lg transition-shadow"
    >
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 flex-1">{description}</p>
      {extra && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{extra}</p>
      )}
      <span className={`inline-block mt-4 text-sm font-medium bg-gradient-to-r ${accentClass} bg-clip-text text-transparent group-hover:underline`}>
        {cta} →
      </span>
    </Link>
  );
}
