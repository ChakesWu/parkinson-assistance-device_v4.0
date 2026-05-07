/**
 * Data export / backup service.
 *
 * - JSON full-backup of all SteadiGrip localStorage state, restorable.
 * - Lightweight aggregate reads used by the Progress Report Card UI.
 *
 * No cloud, no servers — strictly file-system backups.
 */

import { rehabSessionService, type RehabSession } from './rehabSessionService';
import { rewardsService } from './rewardsService';
import { dailyQuestsService } from './dailyQuestsService';
import { achievementsService } from './achievementsService';
import { medalsService } from './medalsService';
import { cardService } from './cardService';
import { gardenService } from './gardenService';

const BACKUP_VERSION = 1;

const STORAGE_KEYS = [
  'steadigrip_user_profile',
  'steadigrip_rehab_sessions',
  'steadigrip_rewards_state',
  'steadigrip_daily_quests',
  'steadigrip_achievements',
  'steadigrip_medals',
  'steadigrip_cards',
  'steadigrip_garden',
  'parkinson_analysis_records',
];

export interface BackupBundle {
  version: number;
  exportedAt: string;
  app: 'SteadiGrip';
  data: Record<string, unknown>;
}

class DataExportService {
  exportAll(): BackupBundle {
    const data: Record<string, unknown> = {};
    if (typeof window !== 'undefined' && window.localStorage) {
      for (const key of STORAGE_KEYS) {
        const raw = localStorage.getItem(key);
        if (raw === null) continue;
        try { data[key] = JSON.parse(raw); }
        catch { data[key] = raw; }
      }
    }
    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'SteadiGrip',
      data,
    };
  }

  /** Trigger a download of the full backup as a JSON file. */
  downloadBackup(filename = 'steadigrip-backup.json'): void {
    if (typeof window === 'undefined') return;
    const bundle = this.exportAll();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 200);
  }

  /** Restore from a JSON backup. Returns the keys imported. */
  importBackup(bundle: BackupBundle): { imported: string[]; skipped: string[]; errors: string[] } {
    const imported: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];
    if (!bundle || bundle.app !== 'SteadiGrip') {
      errors.push('Not a SteadiGrip backup file');
      return { imported, skipped, errors };
    }
    if (typeof window === 'undefined' || !window.localStorage) {
      errors.push('localStorage unavailable');
      return { imported, skipped, errors };
    }
    for (const [key, value] of Object.entries(bundle.data ?? {})) {
      if (!STORAGE_KEYS.includes(key)) {
        skipped.push(key);
        continue;
      }
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        imported.push(key);
      } catch (e) {
        errors.push(`${key}: ${(e as Error).message}`);
      }
    }
    return { imported, skipped, errors };
  }

  /** Aggregate snapshot used by the Progress Report Card. */
  buildReportSnapshot(rangeDays: number = 7): ReportSnapshot {
    const now = new Date();
    const start = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const sessions = rehabSessionService.getSessionsInRange(start, now);
    const rewards = rewardsService.getState();
    const allSessions = rehabSessionService.getAllSessions();
    const lastTwoWeeks = rehabSessionService.getSessionsInRange(
      new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      now,
    );

    // Per-finger breakdown.
    const byFinger: Record<string, number> = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0, average: 0 };
    for (const s of sessions) byFinger[s.fingerMode] = (byFinger[s.fingerMode] ?? 0) + s.reps;

    // Daily reps trend over the period.
    const dailyReps: { date: string; reps: number }[] = [];
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const ymd = ymdLocal(d);
      const reps = sessions
        .filter(s => ymdLocal(new Date(s.timestamp)) === ymd)
        .reduce((sum, s) => sum + s.reps, 0);
      dailyReps.push({ date: ymd, reps });
    }

    // Achievements unlocked in window.
    const achProg = achievementsService.peekProgress();
    const recentlyUnlocked = achProg
      .filter(p => p.unlocked && p.unlockedAt && new Date(p.unlockedAt).getTime() >= start.getTime())
      .map(p => p.id);

    // Medals in current week + month.
    const medalState = medalsService.getCurrent();

    // Garden + cards.
    const gardenSummary = gardenService.getSummary();
    const cardSummary = cardService.getOwnedSummary();

    // Tremor trend (rough): last week MDS-UPDRS-ish severity vs prior week.
    const recentSev = recentSeverity(lastTwoWeeks);

    return {
      rangeDays,
      startISO: start.toISOString(),
      endISO: now.toISOString(),
      profileName: readProfileName(),
      totals: {
        sessions: sessions.length,
        reps: sessions.reduce((a, b) => a + b.reps, 0),
        durationMs: sessions.reduce((a, b) => a + b.durationMs, 0),
        averageAccuracy: sessions.length === 0 ? 0 : Math.round(sessions.reduce((a, b) => a + b.accuracy, 0) / sessions.length),
      },
      lifetime: {
        totalSessions: allSessions.length,
        totalReps: allSessions.reduce((a, b) => a + b.reps, 0),
        currentStreak: rewards.currentStreak,
        longestStreak: rewards.longestStreak,
        totalPoints: rewards.totalPoints,
      },
      byFinger,
      dailyReps,
      recentlyUnlockedAchievementIds: recentlyUnlocked,
      medalsThisWeek: medalState.week.length,
      medalsThisMonth: medalState.month.length,
      garden: gardenSummary,
      cards: cardSummary,
      severityTrend: recentSev,
    };
  }
}

function readProfileName(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('steadigrip_user_profile');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null;
  } catch { return null; }
}

function recentSeverity(_sessions: RehabSession[]): { thisWeek: number | null; lastWeek: number | null; trend: 'improving' | 'stable' | 'declining' } {
  // We don't reliably have MDS-UPDRS in rehab session data, so this just exposes
  // a placeholder structure for the report card. The card UI will fall back
  // gracefully when values are null.
  return { thisWeek: null, lastWeek: null, trend: 'stable' };
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface ReportSnapshot {
  rangeDays: number;
  startISO: string;
  endISO: string;
  profileName: string | null;
  totals: {
    sessions: number;
    reps: number;
    durationMs: number;
    averageAccuracy: number;
  };
  lifetime: {
    totalSessions: number;
    totalReps: number;
    currentStreak: number;
    longestStreak: number;
    totalPoints: number;
  };
  byFinger: Record<string, number>;
  dailyReps: { date: string; reps: number }[];
  recentlyUnlockedAchievementIds: string[];
  medalsThisWeek: number;
  medalsThisMonth: number;
  garden: { activeCount: number; bloomedCount: number; discoveredCount: number; emptySlots: number };
  cards: { total: number; unique: number; byRarity: Record<'common' | 'uncommon' | 'rare' | 'legendary', number> };
  severityTrend: { thisWeek: number | null; lastWeek: number | null; trend: 'improving' | 'stable' | 'declining' };
}

// Reference to silence unused-import warnings; these services are imported
// for potential future direct use within reports.
void dailyQuestsService;

export const dataExportService = new DataExportService();
