/**
 * Clinical report aggregator.
 *
 * Pure data layer — pulls from analysisRecordService, rehabSessionService,
 * rewardsService, and the user-profile localStorage key, then produces a
 * single normalised ClinicalReport object that downstream renderers
 * (PDF + CSV) can format without re-touching the underlying stores.
 *
 * No DOM. No browser-only deps beyond localStorage (which is guarded).
 */

import { analysisRecordService, type AnalysisRecord } from './analysisRecordService';
import { rehabSessionService, type RehabSession, type FingerMode, type GameType } from './rehabSessionService';
import { rewardsService } from './rewardsService';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SeverityTrend = 'improving' | 'stable' | 'declining';

export interface PatientHeader {
  name: string | null;
  initials: string | null;
  age: string | null;
  sex: string | null;
  race: string | null;
  deidentified: boolean;
}

export interface ReportRange {
  startISO: string;
  endISO: string;
  days: number;
  label: string; // human-readable, e.g. "Last 30 days" or "2026-04-08 → 2026-05-08"
}

export interface ReportSummary {
  analysisCount: number;
  meanParkinsonLevel: number | null;     // 0..5
  meanConfidence: number | null;         // 0..100
  meanTremorHz: number | null;
  meanEmgRms: number | null;
  meanGraspQuality: number | null;       // 0..100
  meanRecommendedResistance: number | null; // 0..100 (degrees in this app)
  trend: SeverityTrend;
}

export interface MdsUpdrsBlock {
  latest: number | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  band: 'Minimal' | 'Mild' | 'Moderate' | 'Severe' | null;
  trend: SeverityTrend | null;
}

export interface AnalysisRow {
  id: string;
  timestamp: string;
  parkinsonLevel: number;
  parkinsonDescription: string;
  mdsUpdrsEst: number | null;
  tremorHz: number | null;
  emgRms: number | null;
  graspQuality: number | null;
  confidence: number;
  recommendedResistance: number;
  recommendation: string;
  source: AnalysisRecord['source'];
  durationSec: number | null;
}

export interface RehabRow {
  id: string;
  timestamp: string;
  gameType: GameType;
  fingerMode: FingerMode;
  reps: number;
  durationSec: number;
  accuracy: number;
  bestStreak: number;
}

export interface RehabSummary {
  sessionCount: number;
  totalReps: number;
  totalDurationSec: number;
  meanAccuracy: number | null;
  byGameType: Record<GameType, number>;
  byFinger: Record<FingerMode, number>;
  currentStreakDays: number;
  longestStreakDays: number;
  totalPoints: number;
  level: number;
}

export interface ClinicalReport {
  app: 'SteadiGrip';
  version: 1;
  generatedAt: string;
  patient: PatientHeader;
  range: ReportRange;
  summary: ReportSummary;
  mdsUpdrs: MdsUpdrsBlock;
  analysisRows: AnalysisRow[];
  rehabSummary: RehabSummary;
  rehabRows: RehabRow[];
  topRecommendations: string[];
  disclaimer: string;
}

export interface BuildReportOptions {
  start?: Date;
  end?: Date;
  /** When true, replace patient name with initials in the report. */
  deidentify?: boolean;
}

// ---------------------------------------------------------------------------
// MDS-UPDRS Part III estimation — mirror of MdsUpdrsCard.severityToMdsUpdrs.
// ---------------------------------------------------------------------------

const MDS_UPDRS_MAX = 108;

/** Map an `analysisDetails.overallSeverity` (0..100) to an estimated motor score. */
function severityToMdsUpdrs(overallSeverity: number): number {
  return Math.round((overallSeverity / 100) * MDS_UPDRS_MAX);
}

/** Fallback when overallSeverity is missing: use parkinsonLevel (0..5). */
function levelToMdsUpdrs(parkinsonLevel: number): number {
  return Math.round((parkinsonLevel / 5) * MDS_UPDRS_MAX);
}

function mdsUpdrsForRecord(r: AnalysisRecord): number {
  const sev = r.analysisDetails?.overallSeverity;
  if (typeof sev === 'number' && Number.isFinite(sev)) {
    return severityToMdsUpdrs(sev);
  }
  return levelToMdsUpdrs(r.parkinsonLevel);
}

function bandFor(score: number | null): MdsUpdrsBlock['band'] {
  if (score == null) return null;
  if (score <= 12) return 'Minimal';
  if (score <= 32) return 'Mild';
  if (score <= 58) return 'Moderate';
  return 'Severe';
}

// ---------------------------------------------------------------------------
// Profile + utils
// ---------------------------------------------------------------------------

interface RawProfile {
  name?: string;
  age?: string;
  sex?: string;
  race?: string;
}

function readProfile(): RawProfile | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem('steadigrip_user_profile');
    if (!raw) return null;
    return JSON.parse(raw) as RawProfile;
  } catch {
    return null;
  }
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function buildPatient(deidentify: boolean): PatientHeader {
  const p = readProfile();
  const name = p?.name?.trim() || null;
  const initials = name ? initialsOf(name) : null;
  return {
    name: deidentify ? null : name,
    initials,
    age: p?.age?.trim() || null,
    sex: p?.sex?.trim() || null,
    race: p?.race?.trim() || null,
    deidentified: deidentify,
  };
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return s / nums.length;
}

function round1(x: number | null): number | null {
  return x == null ? null : Math.round(x * 10) / 10;
}

function round0(x: number | null): number | null {
  return x == null ? null : Math.round(x);
}

function deriveTrend(records: AnalysisRecord[]): SeverityTrend {
  // records are stored newest-first in analysisRecordService.
  if (records.length < 4) return 'stable';
  const half = Math.floor(records.length / 2);
  const recent = records.slice(0, half);
  const earlier = records.slice(half);
  const recentAvg = recent.reduce((a, r) => a + r.parkinsonLevel, 0) / recent.length;
  const earlierAvg = earlier.reduce((a, r) => a + r.parkinsonLevel, 0) / earlier.length;
  const diff = recentAvg - earlierAvg;
  if (diff <= -0.2) return 'improving';
  if (diff >= 0.2) return 'declining';
  return 'stable';
}

function deriveMdsTrend(scores: number[]): SeverityTrend | null {
  // scores are in *chronological* order (oldest → newest) for trend logic.
  if (scores.length < 2) return null;
  const latest = scores[scores.length - 1];
  const prev = scores.slice(Math.max(0, scores.length - 5), scores.length - 1);
  if (prev.length === 0) return null;
  const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
  const diff = latest - prevAvg;
  if (diff <= -3) return 'improving';
  if (diff >= 3) return 'declining';
  return 'stable';
}

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const DEFAULT_DAYS = 30;

export function buildClinicalReport(opts: BuildReportOptions = {}): ClinicalReport {
  const now = new Date();
  const end = opts.end ?? now;
  const start =
    opts.start ?? new Date(end.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);

  const days = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
  );

  const allAnalysis = analysisRecordService.getAllRecords(); // newest-first
  const analysisInRange = allAnalysis.filter((r) => inRange(r.timestamp, start, end));

  const allSessions = rehabSessionService.getAllSessions();   // newest-first
  const rehabInRange = allSessions.filter((s) => inRange(s.timestamp, start, end));

  // Summary
  const tremorVals = analysisInRange
    .map((r) => r.analysisDetails?.tremorFrequency)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const emgVals = analysisInRange
    .map((r) => r.analysisDetails?.emgRms)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const graspVals = analysisInRange
    .map((r) => r.analysisDetails?.graspQuality)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  const summary: ReportSummary = {
    analysisCount: analysisInRange.length,
    meanParkinsonLevel: round1(mean(analysisInRange.map((r) => r.parkinsonLevel))),
    meanConfidence: round1(mean(analysisInRange.map((r) => r.confidence))),
    meanTremorHz: round1(mean(tremorVals)),
    meanEmgRms: round1(mean(emgVals)),
    meanGraspQuality: round1(mean(graspVals)),
    meanRecommendedResistance: round0(
      mean(analysisInRange.map((r) => r.recommendedResistance)),
    ),
    trend: deriveTrend(analysisInRange),
  };

  // MDS-UPDRS block — derived from in-range analyses
  const mdsScores = analysisInRange.map(mdsUpdrsForRecord);
  // Chronological for trend (oldest → newest)
  const mdsScoresChrono = [...mdsScores].reverse();
  const mdsLatest = mdsScores.length > 0 ? mdsScores[0] : null; // newest-first
  const mdsMean = round0(mean(mdsScores));
  const mdsMin = mdsScores.length > 0 ? Math.min(...mdsScores) : null;
  const mdsMax = mdsScores.length > 0 ? Math.max(...mdsScores) : null;

  const mdsUpdrs: MdsUpdrsBlock = {
    latest: mdsLatest,
    mean: mdsMean,
    min: mdsMin,
    max: mdsMax,
    band: bandFor(mdsLatest),
    trend: deriveMdsTrend(mdsScoresChrono),
  };

  // Per-record rows (chronological, oldest → newest reads better in a clinical chart)
  const analysisRows: AnalysisRow[] = [...analysisInRange]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      parkinsonLevel: r.parkinsonLevel,
      parkinsonDescription: r.parkinsonDescription,
      mdsUpdrsEst: mdsUpdrsForRecord(r),
      tremorHz: r.analysisDetails?.tremorFrequency ?? null,
      emgRms: r.analysisDetails?.emgRms ?? null,
      graspQuality: r.analysisDetails?.graspQuality ?? null,
      confidence: r.confidence,
      recommendedResistance: r.recommendedResistance,
      recommendation: r.recommendation,
      source: r.source,
      durationSec: r.duration ?? null,
    }));

  // Rehab adherence
  const byGameType: Record<GameType, number> = {
    'sine-wave': 0, 'tea-pour': 0, 'fish-catch': 0,
  };
  const byFinger: Record<FingerMode, number> = {
    average: 0, thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0,
  };
  let totalReps = 0;
  let totalDurationMs = 0;
  let accSum = 0;
  for (const s of rehabInRange) {
    byGameType[s.gameType] = (byGameType[s.gameType] ?? 0) + 1;
    byFinger[s.fingerMode] = (byFinger[s.fingerMode] ?? 0) + 1;
    totalReps += s.reps;
    totalDurationMs += s.durationMs;
    accSum += s.accuracy;
  }

  const rewards = rewardsService.getState();
  const level = rewardsService.getLevelInfo().level;

  const rehabSummary: RehabSummary = {
    sessionCount: rehabInRange.length,
    totalReps,
    totalDurationSec: Math.round(totalDurationMs / 1000),
    meanAccuracy: rehabInRange.length === 0 ? null : Math.round(accSum / rehabInRange.length),
    byGameType,
    byFinger,
    currentStreakDays: rewards.currentStreak,
    longestStreakDays: rewards.longestStreak,
    totalPoints: rewards.totalPoints,
    level,
  };

  const rehabRows: RehabRow[] = [...rehabInRange]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((s: RehabSession) => ({
      id: s.id,
      timestamp: s.timestamp,
      gameType: s.gameType,
      fingerMode: s.fingerMode,
      reps: s.reps,
      durationSec: Math.round(s.durationMs / 1000),
      accuracy: s.accuracy,
      bestStreak: s.bestStreak,
    }));

  // Top recommendations: take the 3 most recent unique recommendations.
  const seen = new Set<string>();
  const topRecommendations: string[] = [];
  for (const r of analysisInRange) {
    const txt = (r.recommendation ?? '').trim();
    if (!txt || seen.has(txt)) continue;
    seen.add(txt);
    topRecommendations.push(txt);
    if (topRecommendations.length >= 3) break;
  }

  return {
    app: 'SteadiGrip',
    version: 1,
    generatedAt: now.toISOString(),
    patient: buildPatient(opts.deidentify === true),
    range: {
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      days,
      label: rangeLabel(start, end, days),
    },
    summary,
    mdsUpdrs,
    analysisRows,
    rehabSummary,
    rehabRows,
    topRecommendations,
    disclaimer:
      'Generated by SteadiGrip for clinician review. This report is not a medical diagnosis and is intended to support, not replace, professional judgement.',
  };
}

function rangeLabel(start: Date, end: Date, days: number): string {
  return `${ymdLocal(start)} → ${ymdLocal(end)} (${days} day${days === 1 ? '' : 's'})`;
}

export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Convenience preset → date range. */
export function rangeForPreset(
  preset: '7d' | '30d' | '90d' | 'all',
): { start: Date; end: Date } {
  const end = new Date();
  if (preset === 'all') {
    return { start: new Date(0), end };
  }
  const dayMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
  const days = dayMap[preset];
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}
