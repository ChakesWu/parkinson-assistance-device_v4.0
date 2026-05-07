/**
 * Daily Quests service.
 *
 * Generates a deterministic, stable-per-day set of three quests for the
 * patient and tracks their completion. Determinism is critical: a patient
 * who reloads the app at noon should see the same three quests they saw
 * at breakfast.
 *
 * Phase 1: generic templates only.
 * Phase 2: AI-analysis-driven quest mixed in (see upgradeQuestGenerator).
 */

import { rehabSessionService, type FingerMode, type GameType, type RehabSession, toLocalYMD } from './rehabSessionService';
import { analysisRecordService } from './analysisRecordService';

export type QuestKind =
  | 'reps'                  // do N reps in a session
  | 'duration'              // session length >= N minutes
  | 'difficulty'            // play difficulty X
  | 'finger'                // use finger mode X for at least one session
  | 'gameVariety'           // play game type X
  | 'accuracy'              // achieve accuracy >= N%
  | 'sessions';             // complete N sessions today

export type QuestSource = 'generic' | 'clinical';

export interface QuestDefinition {
  id: string;                 // unique within a day, e.g. "2026-05-07-reps-30"
  date: string;               // YYYY-MM-DD
  kind: QuestKind;
  title: string;              // short display
  description: string;        // helper text
  target: number;             // numeric target (reps, minutes, sessions, accuracy %, etc.)
  pointsReward: number;       // bonus points on completion
  source: QuestSource;
  requirement?: {
    fingerMode?: FingerMode;
    gameType?: GameType;
    difficulty?: 'easy' | 'medium' | 'hard';
  };
}

export interface QuestProgress {
  questId: string;
  current: number;            // current value vs `target`
  completed: boolean;
  completedAt: string | null; // ISO
  rewardClaimed: boolean;
}

export interface DailyQuestSnapshot {
  date: string;               // YYYY-MM-DD
  quests: QuestDefinition[];
  progress: Record<string, QuestProgress>;
  allCompleted: boolean;
}

// ---------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------

const STORAGE_KEY = 'steadigrip_daily_quests';

interface StoredState {
  // Map of date YYYY-MM-DD -> snapshot. Old days are pruned to last 14.
  snapshots: Record<string, DailyQuestSnapshot>;
}

class DailyQuestsService {
  private read(): StoredState {
    if (typeof window === 'undefined' || !window.localStorage) return { snapshots: {} };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { snapshots: {} };
      const parsed = JSON.parse(raw) as StoredState;
      if (!parsed || typeof parsed !== 'object' || !parsed.snapshots) return { snapshots: {} };
      return parsed;
    } catch {
      return { snapshots: {} };
    }
  }

  private write(s: StoredState): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      }
    } catch (e) {
      console.error('dailyQuestsService: write failed', e);
    }
  }

  /**
   * Get today's snapshot, generating it if necessary.
   * Optionally re-evaluate progress vs stored sessions.
   */
  getToday(opts?: { recompute?: boolean }): DailyQuestSnapshot {
    const today = toLocalYMD(new Date());
    const state = this.read();
    let snapshot = state.snapshots[today];
    if (!snapshot) {
      snapshot = this.generateSnapshotForDay(today);
      state.snapshots[today] = snapshot;
      pruneOldSnapshots(state);
      this.write(state);
    }
    if (opts?.recompute) {
      const recomputed = this.recomputeProgress(snapshot);
      if (recomputed !== snapshot) {
        state.snapshots[today] = recomputed;
        this.write(state);
        snapshot = recomputed;
      }
    }
    return snapshot;
  }

  /**
   * Apply a freshly-saved session against today's quests, marking any
   * newly-completed quests and returning the list of completions for UI.
   */
  applySession(session: RehabSession): { newlyCompleted: QuestDefinition[]; bonusPoints: number } {
    const today = toLocalYMD(new Date());
    const state = this.read();
    const snapshot = state.snapshots[today] ?? this.generateSnapshotForDay(today);

    const sessionsToday = rehabSessionService.getSessionsForDay(today);

    const newlyCompleted: QuestDefinition[] = [];
    let bonusPoints = 0;
    for (const q of snapshot.quests) {
      const prog = snapshot.progress[q.id];
      if (prog.completed) continue;
      const newCurrent = computeQuestProgress(q, sessionsToday);
      const completed = newCurrent >= q.target;
      snapshot.progress[q.id] = {
        ...prog,
        current: newCurrent,
        completed,
        completedAt: completed && !prog.completed ? new Date().toISOString() : prog.completedAt,
      };
      if (completed && !prog.completed) {
        newlyCompleted.push(q);
        bonusPoints += q.pointsReward;
      }
    }
    snapshot.allCompleted = snapshot.quests.every(q => snapshot.progress[q.id].completed);
    state.snapshots[today] = snapshot;
    this.write(state);
    return { newlyCompleted, bonusPoints };
  }

  markRewardClaimed(questId: string): void {
    const today = toLocalYMD(new Date());
    const state = this.read();
    const snapshot = state.snapshots[today];
    if (!snapshot) return;
    const prog = snapshot.progress[questId];
    if (!prog) return;
    snapshot.progress[questId] = { ...prog, rewardClaimed: true };
    state.snapshots[today] = snapshot;
    this.write(state);
  }

  resetAll(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
  }

  // ------------------------------------------------------------------
  // Generation
  // ------------------------------------------------------------------

  private generateSnapshotForDay(date: string): DailyQuestSnapshot {
    const seed = hashSeed(date);
    const rng = mulberry32(seed);

    // Three quest slots: easy, medium, clinical (clinical falls back to generic in P1).
    const easy = pickEasyQuest(date, rng);
    const medium = pickMediumQuest(date, rng);
    const clinical = pickClinicalQuest(date, rng);

    const quests = [easy, medium, clinical];
    const progress: Record<string, QuestProgress> = {};
    for (const q of quests) {
      progress[q.id] = {
        questId: q.id,
        current: 0,
        completed: false,
        completedAt: null,
        rewardClaimed: false,
      };
    }
    // Recompute against any sessions already done today (e.g. user did rehab before quests existed).
    const snap: DailyQuestSnapshot = { date, quests, progress, allCompleted: false };
    return this.recomputeProgress(snap);
  }

  private recomputeProgress(snapshot: DailyQuestSnapshot): DailyQuestSnapshot {
    const sessionsToday = rehabSessionService.getSessionsForDay(snapshot.date);
    let changed = false;
    const next: DailyQuestSnapshot = {
      ...snapshot,
      progress: { ...snapshot.progress },
    };
    for (const q of snapshot.quests) {
      const prog = snapshot.progress[q.id];
      const current = computeQuestProgress(q, sessionsToday);
      const completed = current >= q.target;
      if (current !== prog.current || completed !== prog.completed) {
        next.progress[q.id] = {
          ...prog,
          current,
          completed,
          completedAt: completed && !prog.completed ? new Date().toISOString() : prog.completedAt,
        };
        changed = true;
      }
    }
    next.allCompleted = next.quests.every(q => next.progress[q.id].completed);
    return changed ? next : snapshot;
  }
}

// ---------------------------------------------------------------------
// Quest progress evaluator
// ---------------------------------------------------------------------

function computeQuestProgress(q: QuestDefinition, sessionsToday: RehabSession[]): number {
  switch (q.kind) {
    case 'reps': {
      // Total reps today; respect game/finger filter if present.
      let reps = 0;
      for (const s of sessionsToday) {
        if (q.requirement?.fingerMode && s.fingerMode !== q.requirement.fingerMode) continue;
        if (q.requirement?.gameType && s.gameType !== q.requirement.gameType) continue;
        reps += s.reps;
      }
      return reps;
    }
    case 'duration': {
      // Best single-session duration in minutes (rounded down).
      const best = sessionsToday.reduce((m, s) => Math.max(m, s.durationMs), 0);
      return Math.floor(best / 60000);
    }
    case 'difficulty': {
      // 1 if any session today matches difficulty.
      const ok = sessionsToday.some(s => s.difficulty === q.requirement?.difficulty);
      return ok ? 1 : 0;
    }
    case 'finger': {
      // 1 if any session today used the finger mode.
      const ok = sessionsToday.some(s => s.fingerMode === q.requirement?.fingerMode);
      return ok ? 1 : 0;
    }
    case 'gameVariety': {
      const ok = sessionsToday.some(s => s.gameType === q.requirement?.gameType);
      return ok ? 1 : 0;
    }
    case 'accuracy': {
      // Best accuracy this session.
      const best = sessionsToday.reduce((m, s) => Math.max(m, s.accuracy), 0);
      return best;
    }
    case 'sessions': {
      return sessionsToday.length;
    }
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------
// Quest pickers (deterministic per-date)
// ---------------------------------------------------------------------

function pickEasyQuest(date: string, rng: () => number): QuestDefinition {
  const variants: QuestDefinition[] = [
    {
      id: `${date}-easy-sessions-1`,
      date,
      kind: 'sessions',
      title: 'Show up today',
      description: 'Complete 1 rehab session of any kind.',
      target: 1,
      pointsReward: 30,
      source: 'generic',
    },
    {
      id: `${date}-easy-duration-2`,
      date,
      kind: 'duration',
      title: 'Two minutes of practice',
      description: 'Stay in any session for at least 2 minutes.',
      target: 2,
      pointsReward: 30,
      source: 'generic',
    },
    {
      id: `${date}-easy-reps-15`,
      date,
      kind: 'reps',
      title: 'Fifteen good reps',
      description: 'Complete 15 reps across today\'s sessions.',
      target: 15,
      pointsReward: 30,
      source: 'generic',
    },
  ];
  return variants[Math.floor(rng() * variants.length)];
}

function pickMediumQuest(date: string, rng: () => number): QuestDefinition {
  const variants: QuestDefinition[] = [
    {
      id: `${date}-med-reps-30`,
      date,
      kind: 'reps',
      title: 'Thirty reps total',
      description: 'Complete 30 reps across today\'s sessions.',
      target: 30,
      pointsReward: 60,
      source: 'generic',
    },
    {
      id: `${date}-med-duration-5`,
      date,
      kind: 'duration',
      title: 'Five-minute session',
      description: 'Stay in a single session for at least 5 minutes.',
      target: 5,
      pointsReward: 60,
      source: 'generic',
    },
    {
      id: `${date}-med-accuracy-70`,
      date,
      kind: 'accuracy',
      title: 'Steady tracking',
      description: 'Reach 70% accuracy in any session today.',
      target: 70,
      pointsReward: 60,
      source: 'generic',
    },
  ];
  return variants[Math.floor(rng() * variants.length)];
}

function pickClinicalQuest(date: string, rng: () => number): QuestDefinition {
  // Phase 2: read the latest AI analysis records and target whatever the
  // model flagged as the patient's weak point. Falls back to a generic
  // finger quest when no analysis data is available.
  const aiHint = inferAiHint();
  if (aiHint) return aiHint;

  const fingers: FingerMode[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  const finger = fingers[Math.floor(rng() * fingers.length)];
  const titleByFinger: Record<FingerMode, string> = {
    thumb: 'Thumb focus',
    index: 'Index finger focus',
    middle: 'Middle finger focus',
    ring: 'Ring finger focus',
    pinky: 'Pinky focus',
    average: 'Whole-hand focus',
  };
  return {
    id: `${date}-clinical-finger-${finger}`,
    date,
    kind: 'finger',
    title: titleByFinger[finger],
    description: `Run a session with the ${finger} finger mode.`,
    target: 1,
    pointsReward: 80,
    source: 'clinical',
    requirement: { fingerMode: finger },
  };

  function inferAiHint(): QuestDefinition | null {
    try {
      const recent = analysisRecordService.getRecentRecords(5);
      if (!recent.length) return null;
      const latest = recent[0];
      const details = latest?.analysisDetails;
      if (!details) return null;

      // Tremor flagged → quest targeting steady-hand accuracy.
      if (typeof details.tremorFrequency === 'number' && details.tremorFrequency >= 4) {
        return {
          id: `${date}-clinical-tremor-steady`,
          date,
          kind: 'accuracy',
          title: 'Steady hand focus',
          description: 'Your last analysis showed tremor activity. Aim for 65%+ accuracy in any session today.',
          target: 65,
          pointsReward: 90,
          source: 'clinical',
        };
      }

      // Low grasp quality → quest targeting reps with average grip.
      if (typeof details.graspQuality === 'number' && details.graspQuality < 60) {
        return {
          id: `${date}-clinical-grasp-reps`,
          date,
          kind: 'reps',
          title: 'Strengthen your grip',
          description: 'Your last analysis flagged grip quality. Hit 25 reps today.',
          target: 25,
          pointsReward: 90,
          source: 'clinical',
        };
      }

      // Finger summary mentions a specific finger → target it.
      const fingerHint = inferFingerFromSummary(details.fingerSummary);
      if (fingerHint) {
        return {
          id: `${date}-clinical-finger-${fingerHint}`,
          date,
          kind: 'finger',
          title: `Focus on your ${fingerHint}`,
          description: `Your last analysis noted the ${fingerHint}. Run a session with the ${fingerHint} mode today.`,
          target: 1,
          pointsReward: 90,
          source: 'clinical',
          requirement: { fingerMode: fingerHint },
        };
      }
    } catch {
      // Swallow — fallback to generic quest.
    }
    return null;
  }
}

function inferFingerFromSummary(summary: string | undefined): FingerMode | null {
  if (!summary) return null;
  const s = summary.toLowerCase();
  const order: FingerMode[] = ['thumb', 'pinky', 'ring', 'middle', 'index'];
  for (const f of order) if (s.includes(f)) return f;
  return null;
}

// ---------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------

function pruneOldSnapshots(state: StoredState): void {
  const today = toLocalYMD(new Date());
  const keep = 14;
  const dates = Object.keys(state.snapshots).sort();
  if (dates.length <= keep) return;
  const cutoff = dates[dates.length - keep];
  for (const d of dates) {
    if (d < cutoff && d !== today) delete state.snapshots[d];
  }
}

function hashSeed(s: string): number {
  // Simple FNV-1a-ish for deterministic per-date seed.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const dailyQuestsService = new DailyQuestsService();
