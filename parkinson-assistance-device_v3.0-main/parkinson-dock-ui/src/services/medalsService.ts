/**
 * Medals service — recurring weekly + monthly prestige awards.
 *
 * Unlike achievements (lifetime, one-shot), medals reset on every
 * period rollover so the patient can re-earn them. Each period evaluates
 * each medal independently against thresholds (this is a single-user
 * system; "best" means hitting a bar, not beating someone else).
 *
 * Periods:
 *   - Week: ISO-week-ish, Monday 00:00 -> Sunday 23:59 local time.
 *   - Month: calendar month, local time.
 */

import { rehabSessionService, type RehabSession, toLocalYMD } from './rehabSessionService';
import { dailyQuestsService } from './dailyQuestsService';

export type MedalPeriod = 'week' | 'month';
export type MedalTier = 'bronze' | 'silver' | 'gold';

export interface MedalDefinition {
  id: string;
  period: MedalPeriod;
  title: string;
  description: string;
  icon: string;
  tier: MedalTier;
  pointsReward: number;
  evaluate: (sessions: RehabSession[], periodInfo: PeriodInfo) => boolean;
}

export interface PeriodInfo {
  period: MedalPeriod;
  key: string;             // 'YYYY-Www' or 'YYYY-MM'
  startMs: number;
  endMs: number;
  dayCount: number;        // total days in this period
  activeDays: number;      // days the patient trained
  questPerfectDays: number; // days where all quests completed (best-effort from quest history)
}

export interface MedalAward {
  id: string;
  periodKey: string;
  period: MedalPeriod;
  awardedAt: string;       // ISO
  pointsReward: number;
}

const STORAGE_KEY = 'steadigrip_medals';

interface StoredState {
  awards: MedalAward[];                      // history
  periodSeen: Record<string, true>;          // periodKey markers (to avoid double-award per period)
}

class MedalsService {
  private read(): StoredState {
    if (typeof window === 'undefined' || !window.localStorage) return { awards: [], periodSeen: {} };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { awards: [], periodSeen: {} };
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object'
        ? { awards: Array.isArray(parsed.awards) ? parsed.awards : [], periodSeen: parsed.periodSeen ?? {} }
        : { awards: [], periodSeen: {} };
    } catch {
      return { awards: [], periodSeen: {} };
    }
  }

  private write(state: StoredState): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      console.error('medalsService: write failed', e);
    }
  }

  /**
   * Evaluate eligibility for the CURRENT week and CURRENT month, awarding
   * any newly qualifying medals. Returns the new awards for UI toasts.
   */
  evaluateCurrent(): MedalAward[] {
    const stored = this.read();
    const newly: MedalAward[] = [];
    for (const period of ['week', 'month'] as const) {
      const info = currentPeriodInfo(period);
      const sessions = rehabSessionService.getSessionsInRange(new Date(info.startMs), new Date(info.endMs));
      for (const def of MEDAL_DEFS.filter(d => d.period === period)) {
        const awardKey = `${info.key}::${def.id}`;
        if (stored.periodSeen[awardKey]) continue;
        if (def.evaluate(sessions, info)) {
          const award: MedalAward = {
            id: def.id,
            periodKey: info.key,
            period,
            awardedAt: new Date().toISOString(),
            pointsReward: def.pointsReward,
          };
          stored.awards.unshift(award);
          stored.periodSeen[awardKey] = true;
          newly.push(award);
        }
      }
    }
    if (newly.length > 0) {
      this.write(stored);
      const bonus = newly.reduce((s, a) => s + a.pointsReward, 0);
      addBonusPoints(bonus);
    }
    return newly;
  }

  /** All historical awards, newest-first. */
  getAllAwards(): MedalAward[] {
    return [...this.read().awards].sort((a, b) => b.awardedAt.localeCompare(a.awardedAt));
  }

  /** Awards for the current week + month. */
  getCurrent(): { week: MedalAward[]; month: MedalAward[]; weekKey: string; monthKey: string } {
    const week = currentPeriodInfo('week');
    const month = currentPeriodInfo('month');
    const all = this.read().awards;
    return {
      weekKey: week.key,
      monthKey: month.key,
      week: all.filter(a => a.periodKey === week.key && a.period === 'week'),
      month: all.filter(a => a.periodKey === month.key && a.period === 'month'),
    };
  }

  /** Live evaluation of every medal definition (without awarding) — for the "available this period" UI. */
  getAvailability(): {
    week: { def: MedalDefinition; earned: boolean; meetsCriteria: boolean }[];
    month: { def: MedalDefinition; earned: boolean; meetsCriteria: boolean }[];
    weekInfo: PeriodInfo;
    monthInfo: PeriodInfo;
  } {
    const weekInfo = currentPeriodInfo('week');
    const monthInfo = currentPeriodInfo('month');
    const stored = this.read();
    const weekSessions = rehabSessionService.getSessionsInRange(new Date(weekInfo.startMs), new Date(weekInfo.endMs));
    const monthSessions = rehabSessionService.getSessionsInRange(new Date(monthInfo.startMs), new Date(monthInfo.endMs));
    const map = (info: PeriodInfo, sessions: RehabSession[]) =>
      MEDAL_DEFS
        .filter(d => d.period === info.period)
        .map(def => ({
          def,
          earned: !!stored.periodSeen[`${info.key}::${def.id}`],
          meetsCriteria: def.evaluate(sessions, info),
        }));
    return {
      week: map(weekInfo, weekSessions),
      month: map(monthInfo, monthSessions),
      weekInfo,
      monthInfo,
    };
  }

  getDefinitions(): MedalDefinition[] {
    return MEDAL_DEFS;
  }

  resetAll(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
  }
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
    console.error('medalsService: bonus apply failed', e);
  }
}

// ---------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------

function currentPeriodInfo(period: MedalPeriod): PeriodInfo {
  const now = new Date();
  if (period === 'week') {
    return weekInfoFor(now);
  }
  return monthInfoFor(now);
}

function weekInfoFor(d: Date): PeriodInfo {
  // Monday-anchored ISO-ish week.
  const day = d.getDay(); // 0 Sun..6 Sat
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon, 0, 0, 0, 0);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);
  const key = `${monday.getFullYear()}-W${pad2(getISOWeekNumber(monday))}`;
  const sessions = rehabSessionService.getSessionsInRange(monday, sunday);
  const activeDays = new Set(sessions.map(s => toLocalYMD(s.timestamp))).size;
  const questPerfectDays = countQuestPerfectDays(monday, sunday);
  return {
    period: 'week',
    key,
    startMs: monday.getTime(),
    endMs: sunday.getTime(),
    dayCount: 7,
    activeDays,
    questPerfectDays,
  };
}

function monthInfoFor(d: Date): PeriodInfo {
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  const key = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}`;
  const sessions = rehabSessionService.getSessionsInRange(start, end);
  const activeDays = new Set(sessions.map(s => toLocalYMD(s.timestamp))).size;
  const dayCount = end.getDate();
  const questPerfectDays = countQuestPerfectDays(start, end);
  return {
    period: 'month',
    key,
    startMs: start.getTime(),
    endMs: end.getTime(),
    dayCount,
    activeDays,
    questPerfectDays,
  };
}

function getISOWeekNumber(date: Date): number {
  // Standard ISO week algorithm.
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function countQuestPerfectDays(start: Date, end: Date): number {
  // Inspect daily quest snapshots within range, counting days where every quest was completed.
  let count = 0;
  const cursor = new Date(start);
  const today = new Date();
  while (cursor.getTime() <= end.getTime() && cursor.getTime() <= today.getTime()) {
    const ymd = toLocalYMD(cursor);
    try {
      // The dailyQuestsService doesn't expose past snapshots directly, but we can read storage.
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem('steadigrip_daily_quests');
        if (raw) {
          const parsed = JSON.parse(raw);
          const snap = parsed?.snapshots?.[ymd];
          if (snap?.allCompleted) count++;
        }
      }
    } catch { /* ignore */ }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// Reference to silence unused-import warnings; dailyQuestsService is imported
// for future direct use, keeping the helper above storage-only for now.
void dailyQuestsService;

// ---------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------

function totalReps(sessions: RehabSession[]): number {
  return sessions.reduce((s, x) => s + x.reps, 0);
}
function distinctActiveDays(sessions: RehabSession[]): number {
  return new Set(sessions.map(s => toLocalYMD(s.timestamp))).size;
}
function distinctGameTypes(sessions: RehabSession[]): number {
  return new Set(sessions.map(s => s.gameType)).size;
}
function avgAccuracy(sessions: RehabSession[]): number {
  if (sessions.length === 0) return 0;
  return sessions.reduce((s, x) => s + x.accuracy, 0) / sessions.length;
}

export const MEDAL_DEFS: MedalDefinition[] = [
  // Weekly
  {
    id: 'week-bronze',
    period: 'week',
    title: 'Bronze Week',
    description: 'Train at least 3 days this week.',
    icon: '🥉',
    tier: 'bronze',
    pointsReward: 100,
    evaluate: (s) => distinctActiveDays(s) >= 3,
  },
  {
    id: 'week-silver',
    period: 'week',
    title: 'Silver Week',
    description: 'Train at least 5 days this week.',
    icon: '🥈',
    tier: 'silver',
    pointsReward: 200,
    evaluate: (s) => distinctActiveDays(s) >= 5,
  },
  {
    id: 'week-gold',
    period: 'week',
    title: 'Perfect Week',
    description: 'Train all 7 days of the week.',
    icon: '🥇',
    tier: 'gold',
    pointsReward: 400,
    evaluate: (s) => distinctActiveDays(s) >= 7,
  },
  {
    id: 'week-power',
    period: 'week',
    title: 'Power Week',
    description: 'Complete 200+ reps this week.',
    icon: '💪',
    tier: 'silver',
    pointsReward: 200,
    evaluate: (s) => totalReps(s) >= 200,
  },
  {
    id: 'week-variety',
    period: 'week',
    title: 'Variety Week',
    description: 'Play 3 different mini-games this week.',
    icon: '🎲',
    tier: 'silver',
    pointsReward: 200,
    evaluate: (s) => distinctGameTypes(s) >= 3,
  },
  {
    id: 'week-steady',
    period: 'week',
    title: 'Steady Week',
    description: 'Average 70%+ accuracy this week (3+ sessions).',
    icon: '🎯',
    tier: 'silver',
    pointsReward: 200,
    evaluate: (s) => s.length >= 3 && avgAccuracy(s) >= 70,
  },
  {
    id: 'week-quest-champ',
    period: 'week',
    title: 'Quest Champion',
    description: 'Complete all daily quests on 3+ days this week.',
    icon: '🏅',
    tier: 'gold',
    pointsReward: 300,
    evaluate: (_, info) => info.questPerfectDays >= 3,
  },

  // Monthly
  {
    id: 'month-bronze',
    period: 'month',
    title: 'Bronze Month',
    description: 'Train at least 8 days this month.',
    icon: '🥉',
    tier: 'bronze',
    pointsReward: 250,
    evaluate: (s) => distinctActiveDays(s) >= 8,
  },
  {
    id: 'month-silver',
    period: 'month',
    title: 'Strong Month',
    description: 'Train at least 15 days this month.',
    icon: '🥈',
    tier: 'silver',
    pointsReward: 500,
    evaluate: (s) => distinctActiveDays(s) >= 15,
  },
  {
    id: 'month-gold',
    period: 'month',
    title: 'Perfect Month',
    description: 'Train at least 25 days this month.',
    icon: '🥇',
    tier: 'gold',
    pointsReward: 1000,
    evaluate: (s) => distinctActiveDays(s) >= 25,
  },
  {
    id: 'month-iron',
    period: 'month',
    title: 'Iron Month',
    description: 'Complete 1000+ reps this month.',
    icon: '🛡️',
    tier: 'silver',
    pointsReward: 500,
    evaluate: (s) => totalReps(s) >= 1000,
  },
  {
    id: 'month-rising',
    period: 'month',
    title: 'Rising Star',
    description: 'Beat your previous month\'s rep count.',
    icon: '🌟',
    tier: 'gold',
    pointsReward: 600,
    evaluate: (s, info) => {
      const prev = previousMonthInfo(info);
      const prevReps = totalReps(rehabSessionService.getSessionsInRange(new Date(prev.startMs), new Date(prev.endMs)));
      return prevReps > 0 && totalReps(s) > prevReps;
    },
  },
];

function previousMonthInfo(info: PeriodInfo): { startMs: number; endMs: number } {
  const start = new Date(info.startMs);
  const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1, 0, 0, 0, 0);
  const prevEnd = new Date(start.getFullYear(), start.getMonth(), 0, 23, 59, 59, 999);
  return { startMs: prevStart.getTime(), endMs: prevEnd.getTime() };
}

export const medalsService = new MedalsService();
