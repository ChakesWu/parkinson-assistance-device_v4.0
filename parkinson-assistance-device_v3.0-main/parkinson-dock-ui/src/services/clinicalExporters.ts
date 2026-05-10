/**
 * Clinical export renderers.
 *
 * Two outputs from a single `ClinicalReport`:
 *   - downloadDoctorPdf(): PDF via jsPDF + jspdf-autotable.
 *   - downloadDoctorCsv(): sectioned CSV friendly to Excel / EHR import.
 *
 * Both are browser-only (use Blob + anchor click).
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  ClinicalReport,
  AnalysisRow,
  RehabRow,
} from './clinicalReportService';
import { ymdLocal } from './clinicalReportService';

// ---------------------------------------------------------------------------
// Filename helper
// ---------------------------------------------------------------------------

export function buildExportFilename(
  report: ClinicalReport,
  ext: 'pdf' | 'csv',
): string {
  const stamp = ymdLocal(new Date(report.generatedAt));
  const tag = report.patient.deidentified
    ? report.patient.initials || 'patient'
    : (report.patient.name || report.patient.initials || 'patient');
  const safe = tag
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'patient';
  return `steadigrip-doctor-report-${safe}-${stamp}.${ext}`;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(values: unknown[]): string {
  return values.map(csvEscape).join(',') + '\n';
}

export function reportToCsv(report: ClinicalReport): string {
  const lines: string[] = [];

  // Header / metadata
  lines.push('# SteadiGrip Doctor Report\n');
  lines.push(csvRow(['# App', report.app, 'Version', report.version]));
  lines.push(csvRow(['# Generated', report.generatedAt]));
  lines.push(csvRow(['# Range', report.range.startISO, report.range.endISO, `${report.range.days} days`]));
  lines.push(csvRow([
    '# Patient',
    report.patient.deidentified ? (report.patient.initials ?? '') : (report.patient.name ?? ''),
    report.patient.age ?? '',
    report.patient.sex ?? '',
    report.patient.race ?? '',
    report.patient.deidentified ? 'de-identified' : 'identified',
  ]));
  lines.push('\n');

  // Summary
  lines.push('# Summary\n');
  lines.push(csvRow(['Metric', 'Value']));
  lines.push(csvRow(['Analyses', report.summary.analysisCount]));
  lines.push(csvRow(['Mean Parkinson Level (0-5)', report.summary.meanParkinsonLevel ?? '']));
  lines.push(csvRow(['Mean Confidence (%)', report.summary.meanConfidence ?? '']));
  lines.push(csvRow(['Mean Tremor Frequency (Hz)', report.summary.meanTremorHz ?? '']));
  lines.push(csvRow(['Mean EMG RMS', report.summary.meanEmgRms ?? '']));
  lines.push(csvRow(['Mean Grasp Quality (%)', report.summary.meanGraspQuality ?? '']));
  lines.push(csvRow(['Mean Recommended Resistance', report.summary.meanRecommendedResistance ?? '']));
  lines.push(csvRow(['Severity Trend', report.summary.trend]));
  lines.push('\n');

  // MDS-UPDRS
  lines.push('# Estimated MDS-UPDRS Part III (0-108)\n');
  lines.push(csvRow(['Metric', 'Value']));
  lines.push(csvRow(['Latest', report.mdsUpdrs.latest ?? '']));
  lines.push(csvRow(['Mean', report.mdsUpdrs.mean ?? '']));
  lines.push(csvRow(['Min', report.mdsUpdrs.min ?? '']));
  lines.push(csvRow(['Max', report.mdsUpdrs.max ?? '']));
  lines.push(csvRow(['Band', report.mdsUpdrs.band ?? '']));
  lines.push(csvRow(['Trend', report.mdsUpdrs.trend ?? '']));
  lines.push('\n');

  // Analysis records
  lines.push('# Analysis Records\n');
  lines.push(csvRow([
    'timestamp',
    'parkinsonLevel',
    'parkinsonDescription',
    'mdsUpdrsEst',
    'tremorHz',
    'emgRms',
    'graspQuality',
    'confidence',
    'recommendedResistance',
    'recommendation',
    'source',
    'durationSec',
  ]));
  for (const r of report.analysisRows) {
    lines.push(csvRow([
      r.timestamp,
      r.parkinsonLevel,
      r.parkinsonDescription,
      r.mdsUpdrsEst ?? '',
      fmtNum(r.tremorHz, 2),
      fmtNum(r.emgRms, 2),
      fmtNum(r.graspQuality, 1),
      r.confidence,
      r.recommendedResistance,
      r.recommendation,
      r.source,
      r.durationSec ?? '',
    ]));
  }
  lines.push('\n');

  // Rehab summary
  lines.push('# Rehab Adherence Summary\n');
  lines.push(csvRow(['Metric', 'Value']));
  lines.push(csvRow(['Sessions', report.rehabSummary.sessionCount]));
  lines.push(csvRow(['Total Reps', report.rehabSummary.totalReps]));
  lines.push(csvRow(['Total Duration (s)', report.rehabSummary.totalDurationSec]));
  lines.push(csvRow(['Mean Accuracy (%)', report.rehabSummary.meanAccuracy ?? '']));
  lines.push(csvRow(['Current Streak (days)', report.rehabSummary.currentStreakDays]));
  lines.push(csvRow(['Longest Streak (days)', report.rehabSummary.longestStreakDays]));
  lines.push(csvRow(['Total Points', report.rehabSummary.totalPoints]));
  lines.push(csvRow(['Engagement Level', report.rehabSummary.level]));
  for (const [k, v] of Object.entries(report.rehabSummary.byGameType)) {
    lines.push(csvRow([`Sessions: ${k}`, v]));
  }
  for (const [k, v] of Object.entries(report.rehabSummary.byFinger)) {
    lines.push(csvRow([`Sessions: finger=${k}`, v]));
  }
  lines.push('\n');

  // Rehab rows
  lines.push('# Rehab Sessions\n');
  lines.push(csvRow([
    'timestamp',
    'gameType',
    'fingerMode',
    'reps',
    'durationSec',
    'accuracy',
    'bestStreak',
  ]));
  for (const s of report.rehabRows) {
    lines.push(csvRow([
      s.timestamp,
      s.gameType,
      s.fingerMode,
      s.reps,
      s.durationSec,
      s.accuracy,
      s.bestStreak,
    ]));
  }
  lines.push('\n');

  // Recommendations + disclaimer
  lines.push('# Top Recommendations\n');
  for (const r of report.topRecommendations) {
    lines.push(csvRow([r]));
  }
  lines.push('\n');
  lines.push(csvRow(['# Disclaimer', report.disclaimer]));

  return lines.join('');
}

export function downloadDoctorCsv(report: ClinicalReport): void {
  if (typeof window === 'undefined') return;
  const csv = reportToCsv(report);
  // BOM so Excel detects UTF-8 correctly.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, buildExportFilename(report, 'csv'));
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

const COLORS = {
  ink: [33, 37, 41] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  brand: [37, 99, 235] as [number, number, number],   // blue-600
  band: [243, 244, 246] as [number, number, number],  // gray-100
  bandText: [55, 65, 81] as [number, number, number], // gray-700
  good: [22, 163, 74] as [number, number, number],
  warn: [217, 119, 6] as [number, number, number],
  bad: [220, 38, 38] as [number, number, number],
};

const PAGE_MARGIN = 14; // mm

export function downloadDoctorPdf(report: ClinicalReport): void {
  if (typeof window === 'undefined') return;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const usableWidth = pageWidth - PAGE_MARGIN * 2;

  // ----- Title bar
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, pageWidth, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('SteadiGrip — Clinical Report', PAGE_MARGIN, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Generated ${formatDateTimeLocal(report.generatedAt)}`,
    pageWidth - PAGE_MARGIN,
    11,
    { align: 'right' },
  );

  let y = 26;

  // ----- Patient header
  doc.setTextColor(...COLORS.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Patient', PAGE_MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  y += 5;
  const nameDisplay = report.patient.deidentified
    ? `Initials: ${report.patient.initials ?? '—'} (de-identified)`
    : `Name: ${report.patient.name ?? '—'}`;
  doc.text(nameDisplay, PAGE_MARGIN, y);
  const meta = [
    report.patient.age ? `Age ${report.patient.age}` : null,
    report.patient.sex ? `Sex ${report.patient.sex}` : null,
    report.patient.race ? `Background ${report.patient.race}` : null,
  ].filter(Boolean).join('   ');
  if (meta) {
    doc.text(meta, pageWidth - PAGE_MARGIN, y, { align: 'right' });
  }
  y += 5;
  doc.setTextColor(...COLORS.muted);
  doc.text(`Range: ${report.range.label}`, PAGE_MARGIN, y);
  doc.setTextColor(...COLORS.ink);
  y += 6;

  // ----- Summary box
  doc.setFillColor(...COLORS.band);
  doc.roundedRect(PAGE_MARGIN, y, usableWidth, 34, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.bandText);
  doc.text('Summary', PAGE_MARGIN + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.ink);

  const s = report.summary;
  const summaryLeft: Array<[string, string]> = [
    ['Analyses', String(s.analysisCount)],
    ['Mean Parkinson level', fmtOrDash(s.meanParkinsonLevel)],
    ['Mean confidence', s.meanConfidence == null ? '—' : `${s.meanConfidence}%`],
    ['Severity trend', capitalize(s.trend)],
  ];
  const summaryRight: Array<[string, string]> = [
    ['Mean tremor', s.meanTremorHz == null ? '—' : `${s.meanTremorHz} Hz`],
    ['Mean EMG RMS', fmtOrDash(s.meanEmgRms)],
    ['Mean grasp quality', s.meanGraspQuality == null ? '—' : `${s.meanGraspQuality}%`],
    ['Mean rec. resistance', s.meanRecommendedResistance == null ? '—' : `${s.meanRecommendedResistance}°`],
  ];

  drawKeyValueColumn(doc, summaryLeft, PAGE_MARGIN + 4, y + 12, usableWidth / 2 - 6);
  drawKeyValueColumn(doc, summaryRight, PAGE_MARGIN + usableWidth / 2 + 2, y + 12, usableWidth / 2 - 6);
  y += 38;

  // ----- MDS-UPDRS box
  doc.setFillColor(...COLORS.band);
  doc.roundedRect(PAGE_MARGIN, y, usableWidth, 26, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.bandText);
  doc.text('Estimated MDS-UPDRS Part III', PAGE_MARGIN + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.ink);

  const m = report.mdsUpdrs;
  const mdsLine = m.latest == null
    ? 'No analyses in range.'
    : `Latest: ${m.latest} / 108  (${m.band ?? '—'})`;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...mdsBandColor(m.band));
  doc.text(mdsLine, PAGE_MARGIN + 4, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.ink);
  const detail = m.latest == null
    ? ''
    : `Mean ${m.mean ?? '—'}  ·  Min ${m.min ?? '—'}  ·  Max ${m.max ?? '—'}  ·  Trend ${trendArrow(m.trend)} ${m.trend ?? '—'}`;
  if (detail) doc.text(detail, PAGE_MARGIN + 4, y + 21);
  y += 30;

  // ----- Top recommendations
  if (report.topRecommendations.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Recent recommendations', PAGE_MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const rec of report.topRecommendations) {
      const wrapped = doc.splitTextToSize(`• ${rec}`, usableWidth);
      doc.text(wrapped, PAGE_MARGIN, y);
      y += wrapped.length * 4.2;
    }
    y += 2;
  }

  // ----- Analysis records table
  if (report.analysisRows.length > 0) {
    if (y > 230) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.ink);
    doc.text('Analysis Records', PAGE_MARGIN, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      head: [[
        'Date', 'Lvl', 'MDS-III', 'Tremor', 'EMG', 'Grasp', 'Conf%', 'Rec. R', 'Source',
      ]],
      body: report.analysisRows.map((r: AnalysisRow) => [
        formatDateTimeLocal(r.timestamp),
        `${r.parkinsonLevel} (${r.parkinsonDescription})`,
        r.mdsUpdrsEst ?? '—',
        r.tremorHz == null ? '—' : `${r.tremorHz.toFixed(2)} Hz`,
        r.emgRms == null ? '—' : r.emgRms.toFixed(2),
        r.graspQuality == null ? '—' : `${r.graspQuality.toFixed(1)}%`,
        r.confidence,
        `${r.recommendedResistance}°`,
        sourceLabel(r.source),
      ]),
      styles: { fontSize: 8, cellPadding: 1.6, textColor: COLORS.ink },
      headStyles: { fillColor: COLORS.brand, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      didDrawPage: () => drawFooter(doc, report),
    });
    // @ts-expect-error: autotable mutates lastAutoTable on doc
    y = (doc.lastAutoTable?.finalY ?? y) + 6;
  }

  // ----- Rehab adherence summary + table
  if (y > 240) {
    doc.addPage();
    y = PAGE_MARGIN;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Rehab Adherence', PAGE_MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const rs = report.rehabSummary;
  const adherenceLine =
    `${rs.sessionCount} session${rs.sessionCount === 1 ? '' : 's'}` +
    `   ·   ${rs.totalReps} reps` +
    `   ·   ${formatDuration(rs.totalDurationSec)}` +
    (rs.meanAccuracy != null ? `   ·   ${rs.meanAccuracy}% mean accuracy` : '') +
    `   ·   Streak ${rs.currentStreakDays}d (best ${rs.longestStreakDays}d)`;
  const wrapped = doc.splitTextToSize(adherenceLine, usableWidth);
  doc.text(wrapped, PAGE_MARGIN, y);
  y += wrapped.length * 4.5 + 1;

  if (report.rehabRows.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      head: [['Date', 'Game', 'Finger', 'Reps', 'Duration', 'Accuracy', 'Best streak']],
      body: report.rehabRows.map((r: RehabRow) => [
        formatDateTimeLocal(r.timestamp),
        r.gameType,
        r.fingerMode,
        r.reps,
        formatDuration(r.durationSec),
        `${r.accuracy}%`,
        r.bestStreak,
      ]),
      styles: { fontSize: 8, cellPadding: 1.6, textColor: COLORS.ink },
      headStyles: { fillColor: COLORS.brand, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      didDrawPage: () => drawFooter(doc, report),
    });
  } else {
    doc.setTextColor(...COLORS.muted);
    doc.text('No rehab sessions recorded in this range.', PAGE_MARGIN, y);
    doc.setTextColor(...COLORS.ink);
  }

  // Footer on the first/last page (cover empty-table cases too)
  drawFooter(doc, report);

  doc.save(buildExportFilename(report, 'pdf'));
}

// ---------------------------------------------------------------------------
// PDF helpers
// ---------------------------------------------------------------------------

function drawKeyValueColumn(
  doc: jsPDF,
  pairs: Array<[string, string]>,
  x: number,
  y: number,
  width: number,
): void {
  let cy = y;
  for (const [k, v] of pairs) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.muted);
    doc.text(k, x, cy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.ink);
    doc.text(v, x + width, cy, { align: 'right' });
    cy += 5;
  }
}

function drawFooter(doc: jsPDF, report: ClinicalReport): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  const pageNo = (doc as unknown as { internal: { getCurrentPageInfo: () => { pageNumber: number } } })
    .internal.getCurrentPageInfo().pageNumber;
  doc.setDrawColor(229, 231, 235);
  doc.line(PAGE_MARGIN, pageHeight - 10, pageWidth - PAGE_MARGIN, pageHeight - 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(report.disclaimer, PAGE_MARGIN, pageHeight - 6, { maxWidth: pageWidth - PAGE_MARGIN * 2 - 25 });
  doc.text(`Page ${pageNo} / ${totalPages}`, pageWidth - PAGE_MARGIN, pageHeight - 6, { align: 'right' });
  doc.setTextColor(...COLORS.ink);
}

function mdsBandColor(band: string | null): [number, number, number] {
  switch (band) {
    case 'Minimal': return COLORS.good;
    case 'Mild': return [202, 138, 4];
    case 'Moderate': return COLORS.warn;
    case 'Severe': return COLORS.bad;
    default: return COLORS.ink;
  }
}

function trendArrow(trend: string | null): string {
  switch (trend) {
    case 'improving': return '↓';
    case 'declining': return '↑';
    case 'stable': return '→';
    default: return '';
  }
}

function sourceLabel(source: AnalysisRow['source']): string {
  switch (source) {
    case 'arduino': return 'Device';
    case 'web-analysis': return 'Web';
    case 'manual': return 'Manual';
    default: return String(source);
  }
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

function fmtNum(n: number | null | undefined, digits: number): string {
  if (n == null || !Number.isFinite(n)) return '';
  return n.toFixed(digits);
}

function fmtOrDash(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return String(n);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function formatDateTimeLocal(iso: string): string {
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
