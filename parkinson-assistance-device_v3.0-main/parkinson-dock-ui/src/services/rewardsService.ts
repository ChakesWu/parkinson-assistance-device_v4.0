/**
 * Rewards service — points, streak, level, freeze tokens.
 *
 * The single source of truth for all "how engaged is the patient lately"
 * data. Reads sessions from rehabSessionService to derive streak, but
 * caches the cheap derived state in localStorage so the home page can
 * paint instantly.
 *
 * Design goals:
 *   - Effort-based scoring: showing up matters more than precision
 *     (tremor patients always feel rewarded).
 *   - Daily point cap to discourage overexertion.
 *   - Forgiving streak logic with "freeze tokens" so a missed day doesn't
 *     destroy momentum.
 */

import { rehabSessionService, type RehabSession, toLocalYMD } from './rehabSessionService';

export interface RewardsState {
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDay: string | null;     // YYYY-MM-DD
  freezeTokens: number;             // up to MAX_FREEZE_TOKENS
  freezeTokensUsed: number;
  // Per-day points cache for the daily cap: { 'YYYY-MM-DD': pointsEarnedToday }
  dailyPoints: Record<string, number>;
  // Lifetime totals — denormalised for the rewards/profile UI
  lifetimeReps: number;
  lifetimeSessions: number;
  lifetimeDurationMs: number;
}

export interface SessionRewardResult {
  pointsEarned: number;
  pointsCappedAt: number | null;     // if positive, daily cap was hit
  newStreak: number;
  streakIncreased: boolean;
  newLongestStreak: boolean;
  freezeTokensSpent: number;
  freezeTokensEarned: number;
  newLevel: number;
  leveledUp: boolean;
}

export interface LevelInfo {
  level: number;            // 1, 2, 3, ...
  tier: 'Sprout' | 'Sapling' | 'Bloom' | 'Bough' | 'Grove';
  pointsIntoLevel: number;
  pointsForNext: number;
  progress01: number;       // 0..1
}

const STORAGE_KEY = 'steadigrip_rewards_state';
const DAILY_POINT_CAP = 500;
const MAX_FREEZE_TOKENS = 3;
const FREEZE_AWARD_EVERY_PERFECT_WEEK = 1;
// Tier thresholds — cumulative lifetime points (gentle, not grindy).
const LEVEL_STEPS = [
  0, 200, 600, 1200, 2000, 3000, 4500, 6500, 9000, 12000,
  15500, 19500, 24000, 29000, 34500, 40500, 47000, 54000, 61500, 70000,
];

class RewardsService {
  // ------------------------------------------------------------------
  // Persistence helpers
  // ------------------------------------------------------------------

  private read(): RewardsState {
    if (typeof window === 'undefined' || !window.localStorage) return defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw) as Partial<RewardsState>;
      return { ...defaultState(), ...parsed };
    } catch {
      return defaultState();
    }
  }

  private write(state: RewardsState): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      console.error('rewardsService: write failed', e);
    }
  }

  // ------------------------------------------------------------------
  // Public reads
  // ------------------------------------------------------------------

  getState(): RewardsState {
    // Reconcile streak from session data each read so we always show truth.
    const stored = this.read();
    const reconciled = reconcileStreak(stored);
    if (
      reconciled.currentStreak !== stored.currentStreak ||
      reconciled.lastActiveDay !== stored.lastActiveDay ||
      reconciled.freezeTokensUsed !== stored.freezeTokensUsed ||
      reconciled.freezeTokens !== stored.freezeTokens ||
      reconciled.longestStreak !== stored.longestStreak
    ) {
      this.write(reconciled);
    }
    return reconciled;
  }

  getLevelInfo(): LevelInfo {
    const total = this.getState().totalPoints;
    let level = 1;
    for (let i = 0; i < LEVEL_STEPS.length - 1; i++) {
      if (total >= LEVEL_STEPS[i] && total < LEVEL_STEPS[i + 1]) {
        level = i + 1;
        break;
      }
      if (i === LEVEL_STEPS.length - 2 && total >= LEVEL_STEPS[i + 1]) {
        level = LEVEL_STEPS.length;
      }
    }
    const start = LEVEL_STEPS[level - 1] ?? 0;
    const end = LEVEL_STEPS[level] ?? start + 10000;
    const into = total - start;
    const span = Math.max(1, end - start);
    return {
      level,
      tier: tierForLevel(level),
      pointsIntoLevel: into,
      pointsForNext: span,
      progress01: Math.max(0, Math.min(1, into / span)),
    };
  }

  /** Points earned today after the daily cap. */
  pointsToday(): number {
    const state = this.getState();
    return state.dailyPoints[toLocalYMD(new Date())] ?? 0;
  }

  // ------------------------------------------------------------------
  // Session ingestion — the single mutation entry point.
  // ------------------------------------------------------------------

  /**
   * Compute reward points for a not-yet-saved session, and apply them
   * to rewards state. Returns the awarded points and streak deltas so
   * the calling game can show toast / fire confetti.
   */
  ingestSession(session: Omit<RehabSession, 'id' | 'timestamp' | 'pointsEarned'>): SessionRewardResult {
    const baseEarned = computePointsForSession(session);
    let state = this.getState();
    const today = toLocalYMD(new Date());
    const earnedToday = state.dailyPoints[today] ?? 0;
    const remainingCap = Math.max(0, DAILY_POINT_CAP - earnedToday);
    const pointsEarned = Math.min(baseEarned, remainingCap);
    const pointsCappedAt = baseEarned > pointsEarned ? DAILY_POINT_CAP : null;

    // Streak update
    const before = state.currentStreak;
    const beforeLongest = state.longestStreak;
    let streakIncreased = false;
    let newLongestStreak = false;
    if (state.lastActiveDay === today) {
      // already counted today; streak unchanged
    } else {
      const yesterday = shiftYMD(today, -1);
      if (state.lastActiveDay === yesterday) {
        state.currentStreak += 1;
        streakIncreased = true;
      } else if (state.lastActiveDay === null) {
        state.currentStreak = 1;
        streakIncreased = true;
      } else {
        // Gap > 1: try to consume freeze tokens to bridge missed days.
        const missed = daysBetween(state.lastActiveDay, today) - 1;
        if (missed > 0 && state.freezeTokens >= missed) {
          state.freezeTokens -= missed;
          state.freezeTokensUsed += missed;
          state.currentStreak += 1;
          streakIncreased = true;
        } else {
          state.currentStreak = 1;
          streakIncreased = true;
        }
      }
      state.lastActiveDay = today;
      if (state.currentStreak > state.longestStreak) {
        state.longestStreak = state.currentStreak;
        newLongestStreak = state.longestStreak > beforeLongest;
      }
    }

    // Award a freeze token at every 7-day streak boundary, capped.
    let freezeEarned = 0;
    if (streakIncreased && state.currentStreak > 0 && state.currentStreak % 7 === 0 && state.freezeTokens < MAX_FREEZE_TOKENS) {
      const beforeTokens = state.freezeTokens;
      state.freezeTokens = Math.min(MAX_FREEZE_TOKENS, state.freezeTokens + FREEZE_AWARD_EVERY_PERFECT_WEEK);
      freezeEarned = state.freezeTokens - beforeTokens;
    }

    // Points + lifetime totals
    state.totalPoints += pointsEarned;
    state.dailyPoints[today] = (state.dailyPoints[today] ?? 0) + pointsEarned;
    state.lifetimeReps += session.reps;
    state.lifetimeSessions += 1;
    state.lifetimeDurationMs += session.durationMs;

    // Garbage-collect old daily-points entries (keep last 60 days).
    pruneDailyPoints(state);

    // Level computation (post-write so the snapshot is fresh)
    const beforeLevel = this.snapshotLevel(this.read().totalPoints);
    this.write(state);
    const afterLevel = this.getLevelInfo().level;
    const leveledUp = afterLevel > beforeLevel;

    return {
      pointsEarned,
      pointsCappedAt,
      newStreak: state.currentStreak,
      streakIncreased: streakIncreased && state.currentStreak !== before,
      newLongestStreak,
      freezeTokensSpent: 0, // streak-bridging is internal
      freezeTokensEarned: freezeEarned,
      newLevel: afterLevel,
      leveledUp,
    };
  }

  resetAll(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private snapshotLevel(totalPoints: number): number {
    let level = 1;
    for (let i = 0; i < LEVEL_STEPS.length - 1; i++) {
      if (totalPoints >= LEVEL_STEPS[i] && totalPoints < LEVEL_STEPS[i + 1]) {
        level = i + 1;
        break;
      }
      if (i === LEVEL_STEPS.length - 2 && totalPoints >= LEVEL_STEPS[i + 1]) {
        level = LEVEL_STEPS.length;
      }
    }
    return level;
  }
}

// ---------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------

function defaultState(): RewardsState {
  return {
    totalPoints: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDay: null,
    freezeTokens: 0,
    freezeTokensUsed: 0,
    dailyPoints: {},
    lifetimeReps: 0,
    lifetimeSessions: 0,
    lifetimeDurationMs: 0,
  };
}

function tierForLevel(level: number): LevelInfo['tier'] {
  if (level <= 3) return 'Sprout';
  if (level <= 7) return 'Sapling';
  if (level <= 12) return 'Bloom';
  if (level <= 17) return 'Bough';
  return 'Grove';
}

/**
 * Compute reward points using effort-weighted formula.
 * Showing up + completing reps is weighted higher than hitting precise targets.
 */
export function computePointsForSession(
  session: Omit<RehabSession, 'id' | 'timestamp' | 'pointsEarned'>
): number {
  const minutes = session.durationMs / 60000;
  // Base "thank you for showing up" — 50 pts per session start (rounded down to 0 if essentially nothing).
  const showUp = minutes < 0.5 ? Math.round(minutes * 100) : 50;
  // Time component — 10 pts per minute up to 15 minutes (= 150 max).
  const timePoints = Math.round(Math.min(15, minutes) * 10);
  // Reps component — 2 pts per rep, capped at 100 reps (= 200 max).
  const repPoints = Math.min(200, session.reps * 2);
  // Accuracy bonus — small bonus for >=70% accuracy. Never penalise low accuracy.
  const accBonus = session.accuracy >= 70 ? Math.round((session.accuracy - 70) * 1.5) : 0;
  // Difficulty multiplier — gentle.
  const diffMult =
    session.difficulty === 'hard' ? 1.2 :
    session.difficulty === 'medium' ? 1.1 : 1.0;
  return Math.max(0, Math.round((showUp + timePoints + repPoints + accBonus) * diffMult));
}

/**
 * Recompute streak from session history. Used on read to handle the
 * "device closed for days" case correctly without requiring the app
 * to be open at midnight.
 */
function reconcileStreak(state: RewardsState): RewardsState {
  const today = toLocalYMD(new Date());
  if (!state.lastActiveDay) return state;
  const lastDate = state.lastActiveDay;

  if (lastDate === today) return state;

  const gap = daysBetween(lastDate, today);
  if (gap <= 1) return state; // no missed days yet (yesterday) or today already counted

  // Patient missed (gap - 1) full days. Try to bridge with freeze tokens.
  const missedDays = gap - 1;
  if (state.freezeTokens >= missedDays) {
    return {
      ...state,
      freezeTokens: state.freezeTokens - missedDays,
      freezeTokensUsed: state.freezeTokensUsed + missedDays,
      // Streak preserved — last active day intentionally NOT advanced; only a real session updates it.
    };
  }
  // Otherwise streak resets at the next session (we mark current as 0 so UI can prompt comeback).
  return {
    ...state,
    currentStreak: 0,
  };
}

function pruneDailyPoints(state: RewardsState): void {
  const today = new Date();
  const cutoff = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
  const cutoffYMD = toLocalYMD(cutoff);
  for (const k of Object.keys(state.dailyPoints)) {
    if (k < cutoffYMD) delete state.dailyPoints[k];
  }
}

function shiftYMD(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toLocalYMD(dt);
}

function daysBetween(aYMD: string, bYMD: string): number {
  const [ay, am, ad] = aYMD.split('-').map(Number);
  const [by, bm, bd] = bYMD.split('-').map(Number);
  const a = new Date(ay, am - 1, ad).getTime();
  const b = new Date(by, bm - 1, bd).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export const rewardsService = new RewardsService();
