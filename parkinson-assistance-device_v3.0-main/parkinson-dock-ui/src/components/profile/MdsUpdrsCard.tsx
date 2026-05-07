'use client';

import React, { useEffect, useState } from 'react';
import { analysisRecordService } from '@/services/analysisRecordService';

type Band = {
  label: string;
  color: string;
  bg: string;
  range: string;
};

const BANDS: Band[] = [
  { label: 'Minimal',  color: 'text-green-700 dark:text-green-400',  bg: 'bg-green-100 dark:bg-green-900/30',  range: '0–12'  },
  { label: 'Mild',     color: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', range: '13–32' },
  { label: 'Moderate', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', range: '33–58' },
  { label: 'Severe',   color: 'text-red-700 dark:text-red-400',       bg: 'bg-red-100 dark:bg-red-900/30',       range: '59+'   },
];

function getBand(score: number): Band {
  if (score <= 12) return BANDS[0];
  if (score <= 32) return BANDS[1];
  if (score <= 58) return BANDS[2];
  return BANDS[3];
}

function severityToMdsUpdrs(overallSeverity: number): number {
  return Math.round((overallSeverity / 100) * 108);
}

export default function MdsUpdrsCard() {
  const [latestScore, setLatestScore] = useState<number | null>(null);
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [trend, setTrend] = useState<'improving' | 'declining' | 'stable' | null>(null);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    const records = analysisRecordService.getAllRecords();
    if (records.length === 0) return;

    setSessionCount(records.length);

    const scores = records
      .filter((r) => r.analysisDetails?.overallSeverity != null)
      .map((r) => severityToMdsUpdrs(r.analysisDetails!.overallSeverity as number));

    if (scores.length === 0) {
      const fallback = records.map((r) => Math.round((r.parkinsonLevel / 5) * 108));
      const avg = Math.round(fallback.reduce((a, b) => a + b, 0) / fallback.length);
      setLatestScore(fallback.at(-1) ?? null);
      setAvgScore(avg);
      return;
    }

    const latest = scores.at(-1)!;
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    setLatestScore(latest);
    setAvgScore(avg);

    if (scores.length >= 2) {
      const prev = scores.slice(-5, -1);
      const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
      const diff = latest - prevAvg;
      if (diff <= -3) setTrend('improving');
      else if (diff >= 3) setTrend('declining');
      else setTrend('stable');
    }
  }, []);

  if (latestScore === null) {
    return (
      <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-gray-100 dark:border-neutral-700 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
          Estimated MDS-UPDRS Part III
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No analysis data yet. Complete a recording session to see your estimated motor score.
        </p>
      </div>
    );
  }

  const band = getBand(latestScore);
  const pct = Math.min(100, (latestScore / 108) * 100);

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-gray-100 dark:border-neutral-700 p-5 shadow-sm">
      {/* Title row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Estimated MDS-UPDRS Part III
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Motor score derived from {sessionCount} recording session{sessionCount !== 1 ? 's' : ''}
          </p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${band.bg} ${band.color}`}>
          {band.label}
        </span>
      </div>

      {/* Score display */}
      <div className="flex items-end gap-4 mb-4">
        <div>
          <span className={`text-4xl font-bold ${band.color}`}>{latestScore}</span>
          <span className="text-sm text-gray-400 dark:text-gray-500 ml-1">/ 108</span>
        </div>
        {avgScore !== null && (
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Avg: <span className="font-medium text-gray-700 dark:text-gray-200">{avgScore}</span>
          </div>
        )}
        {trend && (
          <div className="mb-1 text-sm font-medium">
            {trend === 'improving' && <span className="text-green-600 dark:text-green-400">↓ Improving</span>}
            {trend === 'declining' && <span className="text-red-600 dark:text-red-400">↑ Worsening</span>}
            {trend === 'stable'    && <span className="text-gray-500 dark:text-gray-400">→ Stable</span>}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden mb-3">
        <div
          className="h-2 rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: latestScore <= 12
              ? '#22c55e'
              : latestScore <= 32
              ? '#eab308'
              : latestScore <= 58
              ? '#f97316'
              : '#ef4444',
          }}
        />
      </div>

      {/* Scale legend */}
      <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
        {BANDS.map((b) => (
          <span key={b.label}>{b.label} ({b.range})</span>
        ))}
      </div>
    </div>
  );
}
