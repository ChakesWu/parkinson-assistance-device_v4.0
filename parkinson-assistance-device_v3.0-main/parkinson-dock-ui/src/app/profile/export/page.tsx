'use client';

/**
 * /records/export — clinician-friendly export page.
 *
 * Lets the user pick a date range (preset or custom), toggle de-identification,
 * preview a normalised ClinicalReport in the browser, and download a styled
 * PDF or sectioned CSV.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Stethoscope,
  FileText,
  FileSpreadsheet,
  ShieldCheck,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import AppTopBar from '@/components/ui/AppTopBar';
import {
  buildClinicalReport,
  rangeForPreset,
  ymdLocal,
  type ClinicalReport,
} from '@/services/clinicalReportService';
import {
  downloadDoctorPdf,
  downloadDoctorCsv,
} from '@/services/clinicalExporters';

type Preset = '7d' | '30d' | '90d' | 'all' | 'custom';

const PRESET_OPTIONS: Array<{ id: Preset; label: string }> = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'all', label: 'All records' },
  { id: 'custom', label: 'Custom range' },
];

export default function DoctorExportPage() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [customStart, setCustomStart] = useState<string>(() => ymdLocal(new Date(Date.now() - 30 * 86400000)));
  const [customEnd, setCustomEnd] = useState<string>(() => ymdLocal(new Date()));
  const [deidentify, setDeidentify] = useState(false);
  const [report, setReport] = useState<ClinicalReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // refresh trigger

  const customInvalid = useMemo(() => {
    if (preset !== 'custom') return false;
    if (!customStart || !customEnd) return true;
    return new Date(customStart).getTime() > new Date(customEnd).getTime();
  }, [preset, customStart, customEnd]);

  // Build the report whenever inputs change.
  useEffect(() => {
    if (customInvalid) {
      setReport(null);
      setError('Custom range: start date must be on or before end date.');
      return;
    }
    setError(null);
    try {
      let start: Date;
      let end: Date;
      if (preset === 'custom') {
        start = new Date(customStart + 'T00:00:00');
        end = new Date(customEnd + 'T23:59:59');
      } else {
        const r = rangeForPreset(preset);
        start = r.start;
        end = r.end;
      }
      setReport(buildClinicalReport({ start, end, deidentify }));
    } catch (e) {
      setError((e as Error).message);
      setReport(null);
    }
  }, [preset, customStart, customEnd, deidentify, customInvalid, tick]);

  const isEmpty = !!report && report.analysisRows.length === 0 && report.rehabRows.length === 0;
  const canDownload = !!report && !isEmpty && !customInvalid;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar showBack />
      <main className="flex-1 container mx-auto py-10 px-4 max-w-6xl w-full">
        {/* Heading */}
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">
            <Stethoscope size={22} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
              Export for Doctor
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Generate a clinician-friendly summary of your analysis records and rehab activity.
            </p>
          </div>
        </div>

        {/* Controls */}
        <section className="mt-6 bg-white dark:bg-neutral-800 rounded-2xl shadow-sm border border-gray-100 dark:border-neutral-700 p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Calendar size={14} /> Date range
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPreset(opt.id)}
                className={[
                  'px-3 py-1.5 rounded-full text-sm border transition-colors',
                  preset === opt.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-neutral-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-600',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
              <label className="text-sm">
                <span className="block text-gray-500 dark:text-gray-400 mb-1">Start</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700"
                />
              </label>
              <label className="text-sm">
                <span className="block text-gray-500 dark:text-gray-400 mb-1">End</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700"
                />
              </label>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 select-none">
              <input
                type="checkbox"
                checked={deidentify}
                onChange={(e) => setDeidentify(e.target.checked)}
                className="rounded border-gray-300"
              />
              <ShieldCheck size={14} className="text-emerald-600" />
              De-identify (use initials only)
            </label>
            <button
              type="button"
              onClick={() => setTick((t) => t + 1)}
              className="text-sm text-blue-600 dark:text-blue-300 hover:underline"
            >
              Refresh from latest data
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!canDownload}
              onClick={() => report && downloadDoctorPdf(report)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:dark:bg-neutral-600 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
            >
              <FileText size={16} />
              Download PDF
            </button>
            <button
              type="button"
              disabled={!canDownload}
              onClick={() => report && downloadDoctorCsv(report)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:dark:bg-neutral-600 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
            >
              <FileSpreadsheet size={16} />
              Download CSV
            </button>
          </div>
        </section>

        {/* Preview */}
        <section className="mt-6">
          {report ? (
            <ReportPreview report={report} isEmpty={isEmpty} />
          ) : (
            <div className="bg-white dark:bg-neutral-800 border border-gray-100 dark:border-neutral-700 rounded-2xl p-8 text-center text-gray-500 dark:text-gray-400">
              {customInvalid ? 'Adjust the custom range to preview.' : 'Loading…'}
            </div>
          )}
        </section>

        <p className="mt-6 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          {report?.disclaimer}
        </p>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview pane
// ---------------------------------------------------------------------------

function ReportPreview({ report, isEmpty }: { report: ClinicalReport; isEmpty: boolean }) {
  const { patient, range, summary, mdsUpdrs, rehabSummary, analysisRows, rehabRows, topRecommendations } = report;
  return (
    <div className="bg-white dark:bg-neutral-800 border border-gray-100 dark:border-neutral-700 rounded-2xl shadow-sm overflow-hidden">
      {/* Banner */}
      <div className="bg-blue-600 text-white px-5 py-3 flex items-center justify-between">
        <span className="font-semibold">SteadiGrip — Clinical Report (Preview)</span>
        <span className="text-xs opacity-90">{formatLocal(report.generatedAt)}</span>
      </div>

      <div className="p-5 grid gap-5">
        {/* Patient header */}
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-gray-500 dark:text-gray-400">Patient</div>
            <div className="font-medium text-gray-900 dark:text-white">
              {patient.deidentified
                ? `Initials: ${patient.initials ?? '—'} (de-identified)`
                : (patient.name ?? '—')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {[
                patient.age ? `Age ${patient.age}` : null,
                patient.sex ? `Sex ${patient.sex}` : null,
                patient.race ? `Background ${patient.race}` : null,
              ].filter(Boolean).join('   ·   ') || '—'}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-gray-500 dark:text-gray-400">Range</div>
            <div className="font-medium text-gray-900 dark:text-white">{range.label}</div>
          </div>
        </div>

        {isEmpty && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-lg p-3 text-sm flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>No analysis records or rehab sessions in this range. Try a wider range.</span>
          </div>
        )}

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Analyses" value={summary.analysisCount} />
          <Kpi label="Mean Parkinson lvl" value={summary.meanParkinsonLevel ?? '—'} />
          <Kpi label="Mean confidence" value={summary.meanConfidence == null ? '—' : `${summary.meanConfidence}%`} />
          <Kpi label="Severity trend" value={capitalize(summary.trend)} valueColor={trendColor(summary.trend)} />
          <Kpi label="Mean tremor" value={summary.meanTremorHz == null ? '—' : `${summary.meanTremorHz} Hz`} />
          <Kpi label="Mean EMG RMS" value={summary.meanEmgRms ?? '—'} />
          <Kpi label="Mean grasp quality" value={summary.meanGraspQuality == null ? '—' : `${summary.meanGraspQuality}%`} />
          <Kpi label="Mean rec. resistance" value={summary.meanRecommendedResistance == null ? '—' : `${summary.meanRecommendedResistance}°`} />
        </div>

        {/* MDS-UPDRS */}
        <div className="rounded-xl border border-gray-100 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900/40 p-4">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Estimated MDS-UPDRS Part III</div>
          {mdsUpdrs.latest == null ? (
            <div className="text-sm text-gray-500 mt-1">No analyses in range.</div>
          ) : (
            <div className="mt-2 flex items-end gap-3 flex-wrap">
              <div className={`text-3xl font-bold ${mdsBandClass(mdsUpdrs.band)}`}>
                {mdsUpdrs.latest}
                <span className="text-base font-medium text-gray-400 ml-1">/ 108</span>
              </div>
              <div className={`text-sm font-medium ${mdsBandClass(mdsUpdrs.band)}`}>
                {mdsUpdrs.band ?? '—'}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Mean {mdsUpdrs.mean ?? '—'} · Min {mdsUpdrs.min ?? '—'} · Max {mdsUpdrs.max ?? '—'}
                {mdsUpdrs.trend && (
                  <> · Trend <span className={trendColor(mdsUpdrs.trend)}>{capitalize(mdsUpdrs.trend)}</span></>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Rehab adherence */}
        <div className="rounded-xl border border-gray-100 dark:border-neutral-700 p-4">
          <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Rehab Adherence</div>
          <div className="text-sm text-gray-700 dark:text-gray-200">
            {rehabSummary.sessionCount} session{rehabSummary.sessionCount === 1 ? '' : 's'}
            {' · '}{rehabSummary.totalReps} reps
            {' · '}{formatDuration(rehabSummary.totalDurationSec)}
            {rehabSummary.meanAccuracy != null && <> · {rehabSummary.meanAccuracy}% mean accuracy</>}
            {' · '}Streak {rehabSummary.currentStreakDays}d (best {rehabSummary.longestStreakDays}d)
          </div>
        </div>

        {/* Recommendations */}
        {topRecommendations.length > 0 && (
          <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-900/10 p-4">
            <div className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">Recent recommendations</div>
            <ul className="list-disc pl-5 text-sm text-blue-900 dark:text-blue-100 space-y-1">
              {topRecommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Tables (preview shows first 5 rows each) */}
        {analysisRows.length > 0 && (
          <PreviewTable
            title={`Analysis Records (${analysisRows.length})`}
            head={['Date', 'Lvl', 'MDS-III', 'Tremor', 'EMG', 'Grasp', 'Conf%', 'Rec. R', 'Source']}
            rows={analysisRows.slice(0, 5).map((r) => [
              formatLocal(r.timestamp),
              `${r.parkinsonLevel} (${r.parkinsonDescription})`,
              r.mdsUpdrsEst ?? '—',
              r.tremorHz == null ? '—' : `${r.tremorHz.toFixed(2)} Hz`,
              r.emgRms == null ? '—' : r.emgRms.toFixed(2),
              r.graspQuality == null ? '—' : `${r.graspQuality.toFixed(1)}%`,
              `${r.confidence}`,
              `${r.recommendedResistance}°`,
              sourceLabel(r.source),
            ])}
            truncated={analysisRows.length > 5}
          />
        )}

        {rehabRows.length > 0 && (
          <PreviewTable
            title={`Rehab Sessions (${rehabRows.length})`}
            head={['Date', 'Game', 'Finger', 'Reps', 'Duration', 'Accuracy', 'Best streak']}
            rows={rehabRows.slice(0, 5).map((r) => [
              formatLocal(r.timestamp),
              r.gameType,
              r.fingerMode,
              `${r.reps}`,
              formatDuration(r.durationSec),
              `${r.accuracy}%`,
              `${r.bestStreak}`,
            ])}
            truncated={rehabRows.length > 5}
          />
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-900/30">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${valueColor ?? 'text-gray-900 dark:text-white'}`}>{value}</div>
    </div>
  );
}

function PreviewTable({ title, head, rows, truncated }: { title: string; head: string[]; rows: (string | number)[][]; truncated: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-neutral-700 overflow-hidden">
      <div className="px-4 py-2 text-sm font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-neutral-900/40 border-b border-gray-100 dark:border-neutral-700">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-blue-600 text-white">
            <tr>{head.map((h) => <th key={h} className="text-left px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className={ri % 2 === 1 ? 'bg-gray-50 dark:bg-neutral-900/30' : ''}>
                {r.map((c, ci) => (
                  <td key={ci} className="px-3 py-2 text-gray-700 dark:text-gray-200 whitespace-nowrap">{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-neutral-700">
          Preview shows first 5 rows. Full table is included in the PDF / CSV.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (UI-only)
// ---------------------------------------------------------------------------

function formatLocal(iso: string): string {
  try {
    const d = new Date(iso);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${ymd} ${hm}`;
  } catch {
    return iso;
  }
}

function formatDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return '0s';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function mdsBandClass(band: string | null): string {
  switch (band) {
    case 'Minimal': return 'text-emerald-600 dark:text-emerald-400';
    case 'Mild': return 'text-yellow-600 dark:text-yellow-400';
    case 'Moderate': return 'text-orange-600 dark:text-orange-400';
    case 'Severe': return 'text-red-600 dark:text-red-400';
    default: return 'text-gray-700 dark:text-gray-200';
  }
}

function trendColor(trend: string | null): string {
  switch (trend) {
    case 'improving': return 'text-emerald-600 dark:text-emerald-400';
    case 'declining': return 'text-red-600 dark:text-red-400';
    case 'stable': return 'text-gray-600 dark:text-gray-300';
    default: return 'text-gray-700 dark:text-gray-200';
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'arduino': return 'Device';
    case 'web-analysis': return 'Web';
    case 'manual': return 'Manual';
    default: return source;
  }
}
