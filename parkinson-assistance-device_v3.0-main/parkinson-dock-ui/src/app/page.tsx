'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Calendar, CheckCircle2, Flame, Star, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import AppTopBar from '@/components/ui/AppTopBar';
import { analysisRecordService } from '@/services/analysisRecordService';
import { rehabSessionService, toLocalYMD } from '@/services/rehabSessionService';
import { rewardsService, type LevelInfo, type RewardsState } from '@/services/rewardsService';
import { dailyQuestsService, type DailyQuestSnapshot, type QuestDefinition, type QuestProgress } from '@/services/dailyQuestsService';

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

function getLastRehabSession(): string | null {
  const recent = rehabSessionService.getRecent(1);
  return recent[0]?.timestamp ?? null;
}

function trainedToday(): boolean {
  const today = toLocalYMD(new Date());
  return rehabSessionService.getSessionsForDay(today).length > 0;
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
  const [rewards, setRewards] = useState<RewardsState | null>(null);
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const [questSnapshot, setQuestSnapshot] = useState<DailyQuestSnapshot | null>(null);
  const [didTrainToday, setDidTrainToday] = useState(false);
  const [lastRehabAt, setLastRehabAt] = useState<string | null>(null);
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
    setRewards(rewardsService.getState());
    setLevelInfo(rewardsService.getLevelInfo());
    setQuestSnapshot(dailyQuestsService.getToday({ recompute: true }));
    setDidTrainToday(trainedToday());
    setLastRehabAt(getLastRehabSession());

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

            {/* Streak + points + level */}
            {rewards && levelInfo && (
              <RewardsSummary
                rewards={rewards}
                levelInfo={levelInfo}
                didTrainToday={didTrainToday}
              />
            )}

            {/* Comeback banner: streak reset after a break */}
            {rewards && rewards.lastActiveDay !== null && rewards.currentStreak === 0 && (
              <ComebackBanner />
            )}

            {/* Foot-in-the-door — always-visible 30-second commit */}
            {!didTrainToday && (
              <Link
                href="/rehab"
                className="mb-6 block w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 p-4 text-center text-white shadow-md hover:shadow-lg active:scale-[0.99] transition"
              >
                <div className="text-xs uppercase tracking-wider opacity-90">Just feel like 30 seconds?</div>
                <div className="mt-0.5 text-lg font-bold">Tap here to start a quick session →</div>
              </Link>
            )}

            {/* Today's quests */}
            {questSnapshot && (
              <DailyQuestsCard snapshot={questSnapshot} didTrainToday={didTrainToday} />
            )}

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
                description={
                  rewards && rewards.currentStreak > 0
                    ? `🔥 ${rewards.currentStreak}-day streak — ${didTrainToday ? 'great job today!' : 'don\u2019t break it!'}`
                    : 'Start your rehab journey.'
                }
                cta={didTrainToday ? 'Train again' : 'Start Session'}
                href="/rehab"
                accentClass="from-purple-500 to-purple-600"
                extra={lastRehabAt ? `Last: ${formatRelativeTime(lastRehabAt)}` : undefined}
              />
              <DashCard
                icon="🌱"
                title="Garden"
                description="Grow plants with every session you complete."
                cta="Tend Garden"
                href="/garden"
                accentClass="from-emerald-500 to-green-600"
              />
              <DashCard
                icon="🏆"
                title="Rewards"
                description="Achievements, medals and your card album."
                cta="View Rewards"
                href="/rewards"
                accentClass="from-amber-500 to-orange-600"
              />
              <DashCard
                icon="📄"
                title="Progress Card & Data Manage"
                description="Share your progress with family or your doctor."
                cta="View Report"
                href="/summary-card"
                accentClass="from-rose-500 to-pink-600"
              />
            </div>

            
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

function RewardsSummary({
  rewards,
  levelInfo,
  didTrainToday,
}: {
  rewards: RewardsState;
  levelInfo: LevelInfo;
  didTrainToday: boolean;
}) {
  const flameTone = rewards.currentStreak > 0
    ? 'from-orange-400 to-red-500'
    : 'from-gray-300 to-gray-400 dark:from-neutral-700 dark:to-neutral-600';
  return (
    <div className="mb-6 grid grid-cols-3 gap-3">
      {/* Streak */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-2xl p-3 flex flex-col items-center justify-center text-center">
        <div className={`mb-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${flameTone} text-white`}>
          <Flame size={18} />
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
          {rewards.currentStreak}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
          {rewards.currentStreak === 1 ? 'day streak' : 'day streak'}
        </div>
        {!didTrainToday && rewards.currentStreak > 0 && (
          <div className="mt-1 text-[10px] font-semibold text-orange-500">Don't break it!</div>
        )}
      </div>

      {/* Points */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-2xl p-3 flex flex-col items-center justify-center text-center">
        <div className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-white">
          <Star size={18} />
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
          {rewards.totalPoints.toLocaleString()}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">total points</div>
      </div>

      {/* Level */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-2xl p-3 flex flex-col items-center justify-center text-center">
        <div className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
          <Trophy size={18} />
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
          Lv {levelInfo.level}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{levelInfo.tier}</div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500"
            style={{ width: `${Math.round(levelInfo.progress01 * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function DailyQuestsCard({ snapshot, didTrainToday }: { snapshot: DailyQuestSnapshot; didTrainToday: boolean }) {
  const completedCount = snapshot.quests.filter(q => snapshot.progress[q.id]?.completed).length;
  const total = snapshot.quests.length;
  return (
    <div className="mb-6 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Today's Quests</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">{completedCount}/{total} done</span>
      </div>
      <ul className="space-y-2">
        {snapshot.quests.map((q) => {
          const prog = snapshot.progress[q.id] as QuestProgress;
          return <QuestRow key={q.id} quest={q} progress={prog} />;
        })}
      </ul>
      {!didTrainToday && (
        <Link
          href="/rehab"
          className="mt-4 block w-full rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90 active:scale-95 transition"
        >
          Start training to make progress →
        </Link>
      )}
    </div>
  );
}

function ComebackBanner() {
  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/30 dark:to-blue-900/30 border border-cyan-200 dark:border-cyan-700/40 p-4 flex items-center gap-3">
      <div className="text-3xl">🌱</div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-cyan-800 dark:text-cyan-100">
          Welcome back!
        </div>
        <div className="text-xs text-cyan-700/90 dark:text-cyan-200/90">
          Your last streak is on pause — finish any session today to start a new one. No penalties, just keep going.
        </div>
      </div>
    </div>
  );
}

function QuestRow({ quest, progress }: { quest: QuestDefinition; progress: QuestProgress }) {
  const target = Math.max(1, quest.target);
  const current = Math.min(target, progress?.current ?? 0);
  const ratio = current / target;
  const completed = progress?.completed === true;
  return (
    <li className={`rounded-xl border p-3 ${completed ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700/40' : 'bg-gray-50 border-gray-200 dark:bg-neutral-800 dark:border-neutral-700'}`}>
      <div className="flex items-center gap-2">
        <div className={`flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0 ${completed ? 'bg-emerald-500 text-white' : 'bg-gray-200 dark:bg-neutral-700 text-gray-500'}`}>
          {completed ? <CheckCircle2 size={14} /> : <span className="text-[10px] font-bold">{Math.round(ratio * 100)}%</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-white">{quest.title}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{quest.description}</div>
        </div>
        <div className="text-xs font-semibold text-amber-500 flex-shrink-0">+{quest.pointsReward}</div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-700">
        <div
          className={`h-full ${completed ? 'bg-emerald-500' : 'bg-gradient-to-r from-purple-500 to-indigo-500'}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </li>
  );
}
