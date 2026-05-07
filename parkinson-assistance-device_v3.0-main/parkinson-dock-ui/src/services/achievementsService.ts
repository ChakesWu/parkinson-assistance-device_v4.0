/**
 * Achievements service.
 *
 * Lifetime, one-time unlocks with always-visible progress bars
 * (deliberately NO hidden achievements — visibility drives motivation
 * for elderly rehab patients).
 *
 * Definitions are static. Progress is recomputed on demand from session
 * history + rewards state, then cached in localStorage. Unlock events
 * are recorded with timestamps so the UI can celebrate "newly unlocked".
 */

import { rehabSessionService, type FingerMode, type GameType, type RehabSession } from './rehabSessionService';
import { rewardsService } from './rewardsService';

export type AchievementCategory =
  | 'onboarding'
  | 'volume'
  | 'consistency'
  | 'range'
  | 'quality'
  | 'variety'
  | 'comeback';

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  icon: string;          // emoji for low-asset display
  target: number;        // numeric threshold
  pointsReward: number;
  /** Pure function: derive current progress (0..target+) from app state. */
  evaluate: (ctx: AchievementContext) => number;
}

export interface AchievementContext {
  sessions: RehabSession[];           // newest-first
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
}

export interface AchievementProgress {
  id: string;
  current: number;
  target: number;
  unlocked: boolean;
  unlockedAt: string | null;   // ISO
}

const STORAGE_KEY = 'steadigrip_achievements';

interface StoredState {
  unlockedAt: Record<string, string>; // id -> ISO timestamp
}

class AchievementsService {
  private read(): StoredState {
    if (typeof window === 'undefined' || !window.localStorage) return { unlockedAt: {} };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { unlockedAt: {} };
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && parsed.unlockedAt ? parsed : { unlockedAt: {} };
    } catch {
      return { unlockedAt: {} };
    }
  }

  private write(state: StoredState): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      console.error('achievementsService: write failed', e);
    }
  }

  /**
   * Build the live progress list for every achievement, recording
   * any newly-unlocked ones into storage and returning them so the UI
   * can show toasts.
   */
  evaluateAll(): { progress: AchievementProgress[]; newlyUnlocked: AchievementDefinition[] } {
    const ctx = buildContext();
    const stored = this.read();
    const newlyUnlocked: AchievementDefinition[] = [];
    const progress: AchievementProgress[] = ACHIEVEMENT_DEFS.map(def => {
      const current = Math.max(0, def.evaluate(ctx));
      const wasUnlocked = !!stored.unlockedAt[def.id];
      const unlocked = wasUnlocked || current >= def.target;
      if (!wasUnlocked && unlocked) {
        stored.unlockedAt[def.id] = new Date().toISOString();
        newlyUnlocked.push(def);
      }
      return {
        id: def.id,
        current: Math.min(current, def.target),
        target: def.target,
        unlocked,
        unlockedAt: stored.unlockedAt[def.id] ?? null,
      };
    });
    if (newlyUnlocked.length > 0) {
      this.write(stored);
      // Award bonus points for each newly unlocked achievement.
      const bonus = newlyUnlocked.reduce((sum, a) => sum + a.pointsReward, 0);
      addBonusPoints(bonus);
    }
    return { progress, newlyUnlocked };
  }

  /** Read-only query without persisting unlock changes. */
  peekProgress(): AchievementProgress[] {
    const ctx = buildContext();
    const stored = this.read();
    return ACHIEVEMENT_DEFS.map(def => {
      const current = Math.max(0, def.evaluate(ctx));
      const wasUnlocked = !!stored.unlockedAt[def.id];
      const unlocked = wasUnlocked || current >= def.target;
      return {
        id: def.id,
        current: Math.min(current, def.target),
        target: def.target,
        unlocked,
        unlockedAt: stored.unlockedAt[def.id] ?? null,
      };
    });
  }

  getDefinitions(): AchievementDefinition[] {
    return ACHIEVEMENT_DEFS;
  }

  resetAll(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
  }
}

function buildContext(): AchievementContext {
  const sessions = rehabSessionService.getAllSessions();
  const rewards = rewardsService.getState();
  return {
    sessions,
    totalPoints: rewards.totalPoints,
    currentStreak: rewards.currentStreak,
    longestStreak: rewards.longestStreak,
  };
}

function addBonusPoints(bonus: number): void {
  if (typeof window === 'undefined' || bonus <= 0) return;
  try {
    const KEY = 'steadigrip_rewards_state';
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    state.totalPoints = (state.totalPoints || 0) + bonus;
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('achievementsService: bonus apply failed', e);
  }
}

// ---------------------------------------------------------------------
// Helpers used by evaluators
// ---------------------------------------------------------------------

function totalReps(sessions: RehabSession[]): number {
  return sessions.reduce((s, x) => s + x.reps, 0);
}
function totalDurationMs(sessions: RehabSession[]): number {
  return sessions.reduce((s, x) => s + x.durationMs, 0);
}
function distinctActiveDays(sessions: RehabSession[]): number {
  return new Set(sessions.map(s => s.timestamp.slice(0, 10))).size;
}
function distinctFingers(sessions: RehabSession[]): number {
  const set = new Set<FingerMode>();
  for (const s of sessions) if (s.fingerMode !== 'average') set.add(s.fingerMode);
  return set.size;
}
function distinctGameTypes(sessions: RehabSession[]): number {
  return new Set(sessions.map(s => s.gameType)).size;
}
function difficultiesCleared(sessions: RehabSession[]): number {
  // "Cleared" = at least one session at that difficulty with reps >= 10.
  const set = new Set<string>();
  for (const s of sessions) if (s.reps >= 10) set.add(s.difficulty);
  return set.size;
}

// ---------------------------------------------------------------------
// Definitions — ~30 achievements, always visible.
// ---------------------------------------------------------------------

export const ACHIEVEMENT_DEFS: AchievementDefinition[] = [
  // Onboarding
  {
    id: 'first-session',
    category: 'onboarding',
    title: 'First Steps',
    description: 'Complete your first rehab session.',
    icon: '👣',
    target: 1,
    pointsReward: 50,
    evaluate: (c) => c.sessions.length,
  },
  {
    id: 'first-week',
    category: 'onboarding',
    title: 'First Week',
    description: 'Train on 3 different days.',
    icon: '📅',
    target: 3,
    pointsReward: 75,
    evaluate: (c) => distinctActiveDays(c.sessions),
  },
  {
    id: 'set-difficulty',
    category: 'onboarding',
    title: 'Finding Your Pace',
    description: 'Complete sessions on 2 different difficulties.',
    icon: '🎚️',
    target: 2,
    pointsReward: 60,
    evaluate: (c) => {
      const set = new Set<string>();
      for (const s of c.sessions) set.add(s.difficulty);
      return set.size;
    },
  },

  // Volume
  {
    id: 'reps-100',
    category: 'volume',
    title: '100 Reps',
    description: 'Complete 100 lifetime reps.',
    icon: '💯',
    target: 100,
    pointsReward: 100,
    evaluate: (c) => totalReps(c.sessions),
  },
  {
    id: 'reps-500',
    category: 'volume',
    title: '500 Reps',
    description: 'Complete 500 lifetime reps.',
    icon: '🏋️',
    target: 500,
    pointsReward: 200,
    evaluate: (c) => totalReps(c.sessions),
  },
  {
    id: 'reps-1000',
    category: 'volume',
    title: '1000 Reps',
    description: 'Complete 1000 lifetime reps.',
    icon: '💪',
    target: 1000,
    pointsReward: 400,
    evaluate: (c) => totalReps(c.sessions),
  },
  {
    id: 'reps-5000',
    category: 'volume',
    title: '5000 Reps',
    description: 'Complete 5000 lifetime reps.',
    icon: '🦾',
    target: 5000,
    pointsReward: 800,
    evaluate: (c) => totalReps(c.sessions),
  },
  {
    id: 'time-1h',
    category: 'volume',
    title: 'One Hour',
    description: 'Train for 1 cumulative hour.',
    icon: '⏱️',
    target: 60 * 60 * 1000,
    pointsReward: 100,
    evaluate: (c) => totalDurationMs(c.sessions),
  },
  {
    id: 'time-5h',
    category: 'volume',
    title: 'Five Hours',
    description: 'Train for 5 cumulative hours.',
    icon: '🕓',
    target: 5 * 60 * 60 * 1000,
    pointsReward: 300,
    evaluate: (c) => totalDurationMs(c.sessions),
  },
  {
    id: 'time-25h',
    category: 'volume',
    title: 'Twenty-Five Hours',
    description: 'Train for 25 cumulative hours.',
    icon: '⌛',
    target: 25 * 60 * 60 * 1000,
    pointsReward: 800,
    evaluate: (c) => totalDurationMs(c.sessions),
  },
  {
    id: 'sessions-25',
    category: 'volume',
    title: '25 Sessions',
    description: 'Complete 25 lifetime sessions.',
    icon: '🎯',
    target: 25,
    pointsReward: 150,
    evaluate: (c) => c.sessions.length,
  },
  {
    id: 'sessions-100',
    category: 'volume',
    title: '100 Sessions',
    description: 'Complete 100 lifetime sessions.',
    icon: '🥇',
    target: 100,
    pointsReward: 500,
    evaluate: (c) => c.sessions.length,
  },

  // Consistency
  {
    id: 'streak-3',
    category: 'consistency',
    title: '3-Day Streak',
    description: 'Train 3 days in a row.',
    icon: '🔥',
    target: 3,
    pointsReward: 75,
    evaluate: (c) => c.longestStreak,
  },
  {
    id: 'streak-7',
    category: 'consistency',
    title: '7-Day Streak',
    description: 'Train 7 days in a row.',
    icon: '🌟',
    target: 7,
    pointsReward: 200,
    evaluate: (c) => c.longestStreak,
  },
  {
    id: 'streak-14',
    category: 'consistency',
    title: '14-Day Streak',
    description: 'Train 14 days in a row.',
    icon: '⚡',
    target: 14,
    pointsReward: 400,
    evaluate: (c) => c.longestStreak,
  },
  {
    id: 'streak-30',
    category: 'consistency',
    title: '30-Day Streak',
    description: 'Train 30 days in a row.',
    icon: '🏆',
    target: 30,
    pointsReward: 800,
    evaluate: (c) => c.longestStreak,
  },
  {
    id: 'streak-100',
    category: 'consistency',
    title: '100-Day Streak',
    description: 'Train 100 days in a row.',
    icon: '👑',
    target: 100,
    pointsReward: 2500,
    evaluate: (c) => c.longestStreak,
  },
  {
    id: 'active-days-30',
    category: 'consistency',
    title: 'Thirty Active Days',
    description: 'Train on 30 different days (not necessarily in a row).',
    icon: '📆',
    target: 30,
    pointsReward: 500,
    evaluate: (c) => distinctActiveDays(c.sessions),
  },

  // Range
  {
    id: 'all-fingers',
    category: 'range',
    title: 'Five-Finger Master',
    description: 'Use every finger mode at least once.',
    icon: '✋',
    target: 5,
    pointsReward: 200,
    evaluate: (c) => distinctFingers(c.sessions),
  },
  {
    id: 'difficulty-climber',
    category: 'range',
    title: 'Difficulty Climber',
    description: 'Clear all 3 difficulties (10+ reps each).',
    icon: '⛰️',
    target: 3,
    pointsReward: 250,
    evaluate: (c) => difficultiesCleared(c.sessions),
  },
  {
    id: 'long-session-10',
    category: 'range',
    title: 'Stamina',
    description: 'Complete a session of at least 10 minutes.',
    icon: '🏃',
    target: 10 * 60 * 1000,
    pointsReward: 200,
    evaluate: (c) => c.sessions.reduce((m, s) => Math.max(m, s.durationMs), 0),
  },

  // Quality
  {
    id: 'accuracy-80',
    category: 'quality',
    title: 'Steady Hand',
    description: 'Hit 80% accuracy in a single session.',
    icon: '🎯',
    target: 80,
    pointsReward: 200,
    evaluate: (c) => c.sessions.reduce((m, s) => Math.max(m, s.accuracy), 0),
  },
  {
    id: 'accuracy-90',
    category: 'quality',
    title: 'Surgeon',
    description: 'Hit 90% accuracy in a single session.',
    icon: '🥇',
    target: 90,
    pointsReward: 400,
    evaluate: (c) => c.sessions.reduce((m, s) => Math.max(m, s.accuracy), 0),
  },
  {
    id: 'best-streak-50',
    category: 'quality',
    title: 'In The Zone',
    description: 'Reach an in-session streak of 50.',
    icon: '🌊',
    target: 50,
    pointsReward: 200,
    evaluate: (c) => c.sessions.reduce((m, s) => Math.max(m, s.bestStreak), 0),
  },
  {
    id: 'best-streak-150',
    category: 'quality',
    title: 'Flow State',
    description: 'Reach an in-session streak of 150.',
    icon: '✨',
    target: 150,
    pointsReward: 500,
    evaluate: (c) => c.sessions.reduce((m, s) => Math.max(m, s.bestStreak), 0),
  },

  // Variety
  {
    id: 'two-games',
    category: 'variety',
    title: 'Mix It Up',
    description: 'Play 2 different mini-games.',
    icon: '🎲',
    target: 2,
    pointsReward: 150,
    evaluate: (c) => distinctGameTypes(c.sessions),
  },
  {
    id: 'three-games',
    category: 'variety',
    title: 'Triple Threat',
    description: 'Play all 3 mini-games.',
    icon: '🎮',
    target: 3,
    pointsReward: 300,
    evaluate: (c) => distinctGameTypes(c.sessions),
  },
  {
    id: 'tea-pour-debut',
    category: 'variety',
    title: 'Pour Master',
    description: 'Complete your first Tea Pour session.',
    icon: '🍵',
    target: 1,
    pointsReward: 100,
    evaluate: (c) => c.sessions.filter(s => s.gameType === 'tea-pour').length,
  },
  {
    id: 'fish-catch-debut',
    category: 'variety',
    title: 'Quick Hands',
    description: 'Complete your first Fish Catch session.',
    icon: '🐟',
    target: 1,
    pointsReward: 100,
    evaluate: (c) => c.sessions.filter(s => s.gameType === 'fish-catch').length,
  },

  // Comeback
  {
    id: 'welcome-back',
    category: 'comeback',
    title: 'Welcome Back',
    description: 'Return after a 3+ day break and complete a session.',
    icon: '🌱',
    target: 1,
    pointsReward: 150,
    evaluate: (c) => detectComebackSessions(c.sessions),
  },
];

function detectComebackSessions(sessions: RehabSession[]): number {
  // sessions newest-first
  let count = 0;
  for (let i = 0; i < sessions.length - 1; i++) {
    const newer = new Date(sessions[i].timestamp).getTime();
    const older = new Date(sessions[i + 1].timestamp).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    if (newer - older >= 3 * dayMs) count++;
  }
  return count;
}

export const achievementsService = new AchievementsService();
