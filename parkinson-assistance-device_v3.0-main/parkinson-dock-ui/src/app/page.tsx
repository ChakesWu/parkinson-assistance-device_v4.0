'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Calendar, TrendingDown, TrendingUp } from 'lucide-react';
import AppTopBar from '@/components/ui/AppTopBar';
import { analysisRecordService } from '@/services/analysisRecordService';

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

function severityToMdsUpdrs(overallSeverity: number): number {
  return Math.round((overallSeverity / 100) * 108);
}

export default function HomePage() {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [streak, setStreak] = useState(0);
  const [lastSession, setLastSession] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, avgScore: 0, trend: 'stable' as 'improving' | 'declining' | 'stable' });
  const [recentSessions, setRecentSessions] = useState<Array<{ id: string; timestamp: string; score: number; level: number }>>([]);

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

    // Load stats and recent sessions
    const records = analysisRecordService.getAllRecords();
    if (records.length > 0) {
      const scores = records
        .filter((r) => r.analysisDetails?.overallSeverity != null)
        .map((r) => severityToMdsUpdrs(r.analysisDetails!.overallSeverity as number));

      const avg = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (scores.length >= 2) {
        const latest = scores.at(-1)!;
        const prev = scores.slice(-5, -1);
        const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
        const diff = latest - prevAvg;
        if (diff <= -3) trend = 'improving';
        else if (diff >= 3) trend = 'declining';
      }

      setStats({ total: records.length, avgScore: avg, trend });

      // Get last 5 sessions
      const recent = records.slice(-5).reverse().map((r) => ({
        id: r.id || '',
        timestamp: r.timestamp,
        score: r.analysisDetails?.overallSeverity
          ? severityToMdsUpdrs(r.analysisDetails.overallSeverity)
          : Math.round((r.parkinsonLevel / 5) * 108),
        level: r.parkinsonLevel,
      }));
      setRecentSessions(recent);
    }
  }, []);

  if (hasProfile === null) {
    return <div className="min-h-screen bg-gray-50 dark:bg-neutral-950" />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar />

              {/* News ticker - double layer */}
        <div className="w-full overflow-hidden flex flex-col" style={{ backgroundColor: '#004E80' }}>
          {/* Top row — scrolls left */}
          <div className="h-16 sm:h-28 md:h-40 overflow-hidden relative flex items-center">
            <div className="absolute whitespace-nowrap animate-ticker-slow flex items-center h-full">
              <span className="inline-block px-8 sm:px-14 md:px-20 text-5xl sm:text-[120px] md:text-[240px] font-black" style={{ color: 'rgba(0, 0, 0, 0.2)' }}>
                {Array(10).fill('SteadiGrip: Affordable AI Parkinson\'s Rehab').join(' • ')}
              </span>
            </div>
          </div>
          {/* Bottom row — scrolls right (reverse) */}
          <div className="h-16 sm:h-28 md:h-40 overflow-hidden relative flex items-center">
            <div className="absolute whitespace-nowrap animate-ticker-reverse flex items-center h-full">
              <span className="inline-block px-8 sm:px-14 md:px-20 text-5xl sm:text-[120px] md:text-[240px] font-black" style={{ color: 'rgba(0, 0, 0, 0.2)' }}>
                {Array(10).fill('SteadiGrip: Affordable AI Parkinson\'s Rehab').join(' • ')}
              </span>
            </div>
          </div>
        </div>

      <main className="flex-1 flex flex-col">
        {/* Greeting */}
        <div className="max-w-3xl mx-auto w-full px-6 pt-10 mb-6">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-2">
            {getGreeting()}{hasProfile && profile?.name ? `, ${profile.name}` : ''} 👋
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400 text-xl">
            {hasProfile ? 'Welcome back to SteadiGrip!' : 'Welcome to SteadiGrip!'}
          </p>
        </div>

        <div className="max-w-3xl mx-auto w-full px-6 pb-10">

        {hasProfile ? (
          <>
            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatCard
                label="Total Sessions"
                value={stats.total.toString()}
                icon={<Calendar size={16} />}
              />
              <StatCard
                label="Avg MDS-UPDRS"
                value={stats.avgScore > 0 ? stats.avgScore.toString() : '—'}
                icon={<Activity size={16} />}
              />
              <StatCard
                label="Trend"
                value={
                  stats.trend === 'improving' ? 'Improving' :
                  stats.trend === 'declining' ? 'Worsening' : 'Stable'
                }
                icon={
                  stats.trend === 'improving' ? <TrendingDown size={16} className="text-green-500" /> :
                  stats.trend === 'declining' ? <TrendingUp size={16} className="text-red-500" /> :
                  <Activity size={16} className="text-gray-400" />
                }
                valueColor={
                  stats.trend === 'improving' ? 'text-green-600 dark:text-green-400' :
                  stats.trend === 'declining' ? 'text-red-600 dark:text-red-400' :
                  'text-gray-600 dark:text-gray-400'
                }
              />
            </div>

            {/* Main action cards */}
            <div className="space-y-4">
              <DashCard
                icon="📋"
                title="Profile"
                description="View your personal info and analysis history."
                cta="View Profile"
                href="/profile"
                accentClass="from-blue-500 to-blue-600"
              />
              <DashCard
                icon="🔬"
                title="Record"
                description="Capture motion, sensor and voice data."
                cta="Start Collection"
                href="/record"
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

            {/* Recent activity */}
            {recentSessions.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Recent Sessions</h2>
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-2xl divide-y divide-gray-100 dark:divide-neutral-800">
                  {recentSessions.map((session) => (
                    <div key={session.id} className="px-5 py-3 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          Analysis #{session.id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {formatRelativeTime(session.timestamp)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">
                          MDS-UPDRS: {session.score}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Level {session.level}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="relative mb-40">
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
      </main>
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

function StatCard({
  label,
  value,
  icon,
  valueColor = 'text-gray-900 dark:text-white',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-xs mb-1.5">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-xl font-bold ${valueColor}`}>{value}</div>
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
      className="group flex items-center gap-4 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-2xl p-5 hover:shadow-lg transition-shadow"
    >
      {/* Emoji left */}
      <div className="text-5xl flex-shrink-0">{icon}</div>
      
      {/* Text right */}
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        {extra && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{extra}</p>
        )}
        <span className={`inline-block mt-2 text-sm font-medium bg-gradient-to-r ${accentClass} bg-clip-text text-transparent group-hover:underline`}>
          {cta} →
        </span>
      </div>
    </Link>
  );
}
