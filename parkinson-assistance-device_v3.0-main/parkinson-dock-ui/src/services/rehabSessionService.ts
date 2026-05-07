/**
 * Rehab Session storage service.
 *
 * Persists each completed rehabilitation mini-game session so that the
 * engagement layer (streaks, points, achievements, garden growth) has
 * a durable source of truth instead of in-memory React state.
 *
 * Pure localStorage. Fully offline. No PII beyond what already lives
 * in the user profile.
 */

export type GameType = 'sine-wave' | 'tea-pour' | 'fish-catch';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type FingerMode = 'average' | 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

export interface RehabSession {
  id: string;
  timestamp: string;          // ISO
  gameType: GameType;
  difficulty: Difficulty;
  fingerMode: FingerMode;
  durationMs: number;
  reps: number;
  score: number;              // raw in-game score (game-specific scale)
  accuracy: number;            // 0-100
  bestStreak: number;          // best in-session hit streak (sine-wave) / consecutive successes
  pointsEarned: number;        // canonical reward points awarded for this session
  // Optional extras a future game can add without breaking older readers.
  extra?: Record<string, number | string | boolean>;
}

export interface RehabStats {
  totalSessions: number;
  totalReps: number;
  totalDurationMs: number;
  averageAccuracy: number;
  byGameType: Record<GameType, number>;
  byFinger: Record<FingerMode, number>; // session counts
  firstSessionAt: string | null;
  lastSessionAt: string | null;
}

const STORAGE_KEY = 'steadigrip_rehab_sessions';
const MAX_SESSIONS = 5000;

type Listener = (s: RehabSession) => void;

class RehabSessionService {
  private listeners: Listener[] = [];

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(session: RehabSession): void {
    for (const l of this.listeners) {
      try { l(session); } catch { /* swallow per-listener errors */ }
    }
  }

  saveSession(session: Omit<RehabSession, 'id' | 'timestamp'>): RehabSession {
    const newSession: RehabSession = {
      ...session,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    };
    const all = this.getAllSessions();
    all.unshift(newSession);
    if (all.length > MAX_SESSIONS) all.splice(MAX_SESSIONS);
    this.saveToStorage(all);
    this.notify(newSession);
    return newSession;
  }

  getAllSessions(): RehabSession[] {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as RehabSession[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('rehabSessionService: read failed', e);
      return [];
    }
  }

  getRecent(count = 10): RehabSession[] {
    return this.getAllSessions().slice(0, count);
  }

  getSessionsInRange(startDate: Date, endDate: Date): RehabSession[] {
    return this.getAllSessions().filter(s => {
      const t = new Date(s.timestamp).getTime();
      return t >= startDate.getTime() && t <= endDate.getTime();
    });
  }

  /**
   * Sessions for a given local-date YYYY-MM-DD string.
   */
  getSessionsForDay(yyyymmdd: string): RehabSession[] {
    return this.getAllSessions().filter(s => toLocalYMD(s.timestamp) === yyyymmdd);
  }

  /**
   * Distinct local-day strings (YYYY-MM-DD) on which at least one session was completed.
   */
  getActiveDays(): Set<string> {
    return new Set(this.getAllSessions().map(s => toLocalYMD(s.timestamp)));
  }

  getStats(): RehabStats {
    const all = this.getAllSessions();
    const empty: RehabStats = {
      totalSessions: 0,
      totalReps: 0,
      totalDurationMs: 0,
      averageAccuracy: 0,
      byGameType: { 'sine-wave': 0, 'tea-pour': 0, 'fish-catch': 0 },
      byFinger: { average: 0, thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
      firstSessionAt: null,
      lastSessionAt: null,
    };
    if (all.length === 0) return empty;

    const stats = empty;
    stats.totalSessions = all.length;
    let accSum = 0;
    for (const s of all) {
      stats.totalReps += s.reps;
      stats.totalDurationMs += s.durationMs;
      accSum += s.accuracy;
      stats.byGameType[s.gameType] = (stats.byGameType[s.gameType] ?? 0) + 1;
      stats.byFinger[s.fingerMode] = (stats.byFinger[s.fingerMode] ?? 0) + 1;
    }
    stats.averageAccuracy = Math.round(accSum / all.length);
    // sessions stored newest-first
    stats.firstSessionAt = all[all.length - 1].timestamp;
    stats.lastSessionAt = all[0].timestamp;
    return stats;
  }

  clearAll(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
  }

  private generateId(): string {
    return `rs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private saveToStorage(sessions: RehabSession[]): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      }
    } catch (e) {
      console.error('rehabSessionService: write failed', e);
    }
  }
}

/** Convert an ISO timestamp to local YYYY-MM-DD. */
export function toLocalYMD(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const rehabSessionService = new RehabSessionService();
