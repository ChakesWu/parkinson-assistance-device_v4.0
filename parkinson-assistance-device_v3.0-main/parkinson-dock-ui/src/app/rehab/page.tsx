'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Fish, Gamepad2, Lock, LockOpen, Sprout } from 'lucide-react';
import AppTopBar from '@/components/ui/AppTopBar';
import { rehabSessionService } from '@/services/rehabSessionService';
import { rewardsService, type RewardsState } from '@/services/rewardsService';
import { dailyQuestsService, type DailyQuestSnapshot } from '@/services/dailyQuestsService';

interface MiniGameDef {
  id: string;
  href: string;
  title: string;
  description: string;
  motorAxis: string;
  icon: React.ReactNode;
  accent: string;
  unlock: { type: 'streak' | 'sessions'; value: number; orStreak?: number; orSessions?: number };
}

const GAMES: MiniGameDef[] = [
  {
    id: 'sine-wave',
    href: '/rehab-game',
    title: 'Sine Wave Follower',
    description: 'Move your fingers in a smooth rhythm to trace the path inside the glowing band.',
    motorAxis: 'Rhythm + range of motion',
    icon: <Gamepad2 size={24} />,
    accent: 'from-cyan-500 to-blue-600',
    unlock: { type: 'sessions', value: 0 },
  },
  {
    id: 'tea-pour',
    href: '/rehab/tea-pour',
    title: 'Tea Pour',
    description: 'Hold your bend exactly at the target so the cup fills smoothly. No spills allowed.',
    motorAxis: 'Sustained controlled flexion',
    icon: <span className="text-2xl">🍵</span>,
    accent: 'from-emerald-500 to-teal-600',
    unlock: { type: 'streak', value: 3, orSessions: 5 },
  },
  {
    id: 'fish-catch',
    href: '/rehab/fish-catch',
    title: 'Fish Catch',
    description: 'When the fish appears, snap your grip closed quickly to catch it.',
    motorAxis: 'Reaction time + grip strength',
    icon: <Fish size={24} />,
    accent: 'from-purple-500 to-pink-600',
    unlock: { type: 'streak', value: 7, orSessions: 15 },
  },
];

const DEMO_UNLOCK_KEY = 'steadigrip_demo_unlock_all';

export default function RehabHubPage() {
  const [rewards, setRewards] = useState<RewardsState | null>(null);
  const [totalSessions, setTotalSessions] = useState(0);
  const [questSnapshot, setQuestSnapshot] = useState<DailyQuestSnapshot | null>(null);
  const [demoUnlock, setDemoUnlock] = useState(false);

  useEffect(() => {
    setRewards(rewardsService.getState());
    setTotalSessions(rehabSessionService.getAllSessions().length);
    setQuestSnapshot(dailyQuestsService.getToday({ recompute: true }));
    try {
      setDemoUnlock(localStorage.getItem(DEMO_UNLOCK_KEY) === '1');
    } catch { /* ignore */ }
  }, []);

  const toggleDemoUnlock = () => {
    setDemoUnlock((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(DEMO_UNLOCK_KEY, '1');
        else localStorage.removeItem(DEMO_UNLOCK_KEY);
      } catch { /* ignore */ }
      return next;
    });
  };

  if (!rewards) {
    return <div className="min-h-screen bg-gray-50 dark:bg-neutral-950" />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar showBack />
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-200 dark:border-purple-700/40 bg-purple-50 dark:bg-purple-900/20 px-4 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-300">
            <Sprout size={14} /> Rehabilitation
          </div>
          <h1 className="mt-3 text-4xl font-bold text-gray-900 dark:text-white">Choose your training</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Each mini-game targets a different motor skill. New games unlock as you build a streak.
          </p>
        </div>

        {/* Demo unlock toggle — bypasses streak/session gating for demos & judging. */}
        <div className={`mb-6 flex items-center justify-between gap-3 rounded-2xl border p-3 ${
          demoUnlock
            ? 'border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20'
            : 'border-dashed border-gray-300 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/60'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
              demoUnlock ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400'
            }`}>
              {demoUnlock ? <LockOpen size={16} /> : <Lock size={16} />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">Demo mode</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {demoUnlock
                  ? 'All mini-games unlocked for showcase. Progress gating bypassed.'
                  : 'Unlock every mini-game without needing a streak (for demos).'}
              </div>
            </div>
          </div>
          <button
            onClick={toggleDemoUnlock}
            className={`flex-shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              demoUnlock
                ? 'bg-amber-500 text-white hover:bg-amber-400'
                : 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:opacity-90'
            }`}
          >
            {demoUnlock ? 'Lock again' : 'Unlock all'}
          </button>
        </div>

        {/* Today's quests preview */}
        {questSnapshot && (
          <div className="mb-6 rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Today's Quests</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {questSnapshot.quests.filter(q => questSnapshot.progress[q.id]?.completed).length}/{questSnapshot.quests.length} done
              </span>
            </div>
            <ul className="space-y-1.5">
              {questSnapshot.quests.map(q => {
                const prog = questSnapshot.progress[q.id];
                const completed = prog?.completed === true;
                return (
                  <li key={q.id} className={`flex items-center gap-2 text-sm ${completed ? 'text-emerald-600 dark:text-emerald-300 line-through' : 'text-gray-700 dark:text-gray-200'}`}>
                    <span className={`h-2 w-2 rounded-full ${completed ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-neutral-600'}`} />
                    <span className="flex-1">{q.title}</span>
                    <span className="text-xs text-amber-500 font-semibold">+{q.pointsReward}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Game cards */}
        <div className="space-y-4">
          {GAMES.map((g) => (
            <GameCard
              key={g.id}
              def={g}
              unlocked={demoUnlock || isUnlocked(g, rewards, totalSessions)}
              progressLabel={demoUnlock ? null : progressLabel(g, rewards, totalSessions)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function isUnlocked(g: MiniGameDef, rewards: RewardsState, totalSessions: number): boolean {
  const u = g.unlock;
  if (u.type === 'sessions' && totalSessions >= u.value) return true;
  if (u.type === 'streak' && rewards.longestStreak >= u.value) return true;
  if (u.orSessions !== undefined && totalSessions >= u.orSessions) return true;
  if (u.orStreak !== undefined && rewards.longestStreak >= u.orStreak) return true;
  return false;
}

function progressLabel(g: MiniGameDef, rewards: RewardsState, totalSessions: number): string | null {
  if (isUnlocked(g, rewards, totalSessions)) return null;
  const u = g.unlock;
  const parts: string[] = [];
  if (u.type === 'streak') parts.push(`${u.value}-day streak (${rewards.longestStreak}/${u.value})`);
  if (u.type === 'sessions') parts.push(`${u.value} sessions (${totalSessions}/${u.value})`);
  if (u.orStreak !== undefined && u.type !== 'streak') parts.push(`${u.orStreak}-day streak`);
  if (u.orSessions !== undefined && u.type !== 'sessions') parts.push(`${u.orSessions} sessions (${totalSessions}/${u.orSessions})`);
  return parts.join(' or ');
}

function GameCard({ def, unlocked, progressLabel }: { def: MiniGameDef; unlocked: boolean; progressLabel: string | null }) {
  const inner = (
    <div className={`group flex items-center gap-4 rounded-2xl border p-5 transition-shadow ${
      unlocked
        ? 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700 hover:shadow-lg'
        : 'bg-gray-50 dark:bg-neutral-900/60 border-dashed border-gray-300 dark:border-neutral-700 opacity-70'
    }`}>
      <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-white bg-gradient-to-br ${def.accent}`}>
        {unlocked ? def.icon : <Lock size={20} />}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{def.title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{def.description}</p>
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 text-gray-400 dark:text-gray-500">
            <Activity size={12} /> {def.motorAxis}
          </span>
        </div>
        {!unlocked && progressLabel && (
          <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
            Unlocks at {progressLabel}
          </p>
        )}
      </div>
      {unlocked && (
        <span className={`text-sm font-medium bg-gradient-to-r ${def.accent} bg-clip-text text-transparent group-hover:underline`}>
          Play →
        </span>
      )}
    </div>
  );

  if (unlocked) {
    return <Link href={def.href} className="block">{inner}</Link>;
  }
  return <div>{inner}</div>;
}
