'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileJson, Upload } from 'lucide-react';
import AppTopBar from '@/components/ui/AppTopBar';
import { dataExportService, type ReportSnapshot } from '@/services/dataExportService';
import { achievementsService } from '@/services/achievementsService';

export default function SummaryCardPage() {
  const [range, setRange] = useState<7 | 30>(7);
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSnapshot(dataExportService.buildReportSnapshot(range));
  }, [range]);

  const downloadPng = async () => {
    if (!snapshot) return;
    const blob = await renderReportToPng(snapshot);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `steadigrip-progress-${snapshot.endISO.slice(0, 10)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 200);
  };

  const downloadJson = () => {
    dataExportService.downloadBackup(`steadigrip-backup-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleImportClick = () => fileRef.current?.click();
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(text => {
      try {
        const bundle = JSON.parse(text);
        const result = dataExportService.importBackup(bundle);
        const msg = result.errors.length > 0
          ? `Import had errors: ${result.errors.join(', ')}`
          : `Imported ${result.imported.length} keys. Reload to apply.`;
        setImportMessage(msg);
      } catch {
        setImportMessage('Could not parse the file as JSON.');
      }
    });
  };

  if (!snapshot) {
    return <div className="min-h-screen bg-gray-50 dark:bg-neutral-950" />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar showBack />
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Progress Report Card</h1>
            <p className="mt-1 text-gray-600 dark:text-gray-300">
              Share with family or your doctor. Save as a PNG image or back up everything as JSON.
            </p>
          </div>
          <div className="flex gap-2">
            <RangeBtn active={range === 7} onClick={() => setRange(7)} label="Last 7 days" />
            <RangeBtn active={range === 30} onClick={() => setRange(30)} label="Last 30 days" />
          </div>
        </div>

        <ReportCard snapshot={snapshot} />

        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={downloadPng} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 px-4 py-2.5 font-semibold text-white hover:opacity-90 transition">
            <Download size={16} /> Download as PNG
          </button>
          <button onClick={downloadJson} className="inline-flex items-center gap-2 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 px-4 py-2.5 font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-neutral-800 transition">
            <FileJson size={16} /> Backup all data (JSON)
          </button>
          <button onClick={handleImportClick} className="inline-flex items-center gap-2 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 px-4 py-2.5 font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-neutral-800 transition">
            <Upload size={16} /> Restore from JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
        </div>
        {importMessage && (
          <p className="mt-3 text-sm text-blue-600 dark:text-blue-300">{importMessage}</p>
        )}
      </main>
    </div>
  );
}

function RangeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-sm font-medium border transition ${
        active
          ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white border-transparent'
          : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-800'
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------
// Report card visual (also re-rendered to canvas for PNG export)
// ---------------------------------------------------------------------

function ReportCard({ snapshot }: { snapshot: ReportSnapshot }) {
  const startStr = new Date(snapshot.startISO).toLocaleDateString();
  const endStr = new Date(snapshot.endISO).toLocaleDateString();
  const totalMins = Math.round(snapshot.totals.durationMs / 60000);
  const fingerEntries = ['thumb', 'index', 'middle', 'ring', 'pinky'].map((f) => ({
    finger: f,
    reps: snapshot.byFinger[f] ?? 0,
  }));
  const maxFingerReps = Math.max(1, ...fingerEntries.map((e) => e.reps));
  const maxDayReps = Math.max(1, ...snapshot.dailyReps.map((d) => d.reps));

  const recentlyUnlocked = snapshot.recentlyUnlockedAchievementIds
    .map((id) => achievementsService.getDefinitions().find((d) => d.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <div id="report-card" className="rounded-3xl bg-gradient-to-br from-white to-purple-50 dark:from-neutral-900 dark:to-purple-900/20 border border-gray-200 dark:border-neutral-700 shadow-md p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-purple-600 dark:text-purple-300">SteadiGrip · Progress Report</div>
          <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{snapshot.profileName ?? 'Patient'}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{startStr} – {endStr}</p>
        </div>
        <div className="text-right text-xs text-gray-500 dark:text-gray-400">
          <div>Streak: <span className="font-bold text-orange-500">{snapshot.lifetime.currentStreak}d</span></div>
          <div>Best: {snapshot.lifetime.longestStreak}d</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        <Stat label="Sessions" value={snapshot.totals.sessions.toString()} />
        <Stat label="Reps" value={snapshot.totals.reps.toString()} />
        <Stat label="Minutes" value={totalMins.toString()} />
        <Stat label="Avg accuracy" value={`${snapshot.totals.averageAccuracy}%`} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Per-finger breakdown */}
        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-4">
          <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Per-finger reps</div>
          <div className="space-y-1.5">
            {fingerEntries.map(({ finger, reps }) => (
              <div key={finger} className="flex items-center gap-2 text-xs">
                <span className="w-14 capitalize text-gray-700 dark:text-gray-200">{finger}</span>
                <div className="flex-1 h-3 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500" style={{ width: `${(reps / maxFingerReps) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-gray-700 dark:text-gray-200">{reps}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Daily reps trend */}
        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-4">
          <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Daily reps</div>
          <div className="flex items-end gap-1 h-24">
            {snapshot.dailyReps.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end" title={`${d.date}: ${d.reps}`}>
                <div
                  className="w-full rounded-t bg-gradient-to-t from-emerald-500 to-cyan-400"
                  style={{ height: `${(d.reps / maxDayReps) * 100}%`, minHeight: d.reps > 0 ? '4px' : '0px' }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-gray-400">
            <span>{snapshot.dailyReps[0]?.date.slice(5) ?? ''}</span>
            <span>{snapshot.dailyReps[snapshot.dailyReps.length - 1]?.date.slice(5) ?? ''}</span>
          </div>
        </div>
      </div>

      {/* Achievements + medals + garden */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-3 text-center">
          <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">New achievements</div>
          <div className="mt-1 text-2xl font-bold text-amber-500">{recentlyUnlocked.length}</div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-3 text-center">
          <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Medals (week + month)</div>
          <div className="mt-1 text-2xl font-bold text-rose-500">{snapshot.medalsThisWeek + snapshot.medalsThisMonth}</div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-3 text-center">
          <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Plants in bloom</div>
          <div className="mt-1 text-2xl font-bold text-pink-500">{snapshot.garden.bloomedCount}</div>
        </div>
      </div>

      {recentlyUnlocked.length > 0 && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 p-4">
          <div className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">Recently unlocked</div>
          <div className="flex flex-wrap gap-2">
            {recentlyUnlocked.slice(0, 8).map(a => (
              <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700/40 px-2.5 py-1 text-xs text-amber-800 dark:text-amber-100">
                <span>{a.icon}</span>{a.title}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 text-[10px] text-center text-gray-400 dark:text-gray-500">
        Generated {new Date(snapshot.endISO).toLocaleString()} · SteadiGrip · Affordable AI Parkinson's Rehab
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-lg font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// PNG export (no extra deps — pure canvas rendering)
// ---------------------------------------------------------------------

async function renderReportToPng(snapshot: ReportSnapshot): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const W = 800;
  const H = 1100;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(1, '#ede9fe');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = '#7e22ce';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText('STEADIGRIP · PROGRESS REPORT', 40, 50);

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.fillText(snapshot.profileName ?? 'Patient', 40, 90);

  ctx.fillStyle = '#6b7280';
  ctx.font = '16px system-ui, sans-serif';
  const startStr = new Date(snapshot.startISO).toLocaleDateString();
  const endStr = new Date(snapshot.endISO).toLocaleDateString();
  ctx.fillText(`${startStr} – ${endStr}`, 40, 115);

  // Streak badge top-right
  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`🔥 ${snapshot.lifetime.currentStreak}-day streak`, W - 40, 90);
  ctx.fillStyle = '#6b7280';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(`Personal best: ${snapshot.lifetime.longestStreak} days`, W - 40, 112);
  ctx.textAlign = 'left';

  // Stat row
  const statY = 160;
  drawStatBox(ctx, 40, statY, 170, 90, 'SESSIONS', String(snapshot.totals.sessions));
  drawStatBox(ctx, 220, statY, 170, 90, 'REPS', String(snapshot.totals.reps));
  drawStatBox(ctx, 400, statY, 170, 90, 'MINUTES', String(Math.round(snapshot.totals.durationMs / 60000)));
  drawStatBox(ctx, 580, statY, 180, 90, 'AVG ACCURACY', `${snapshot.totals.averageAccuracy}%`);

  // Per-finger
  drawSectionTitle(ctx, 'Per-finger reps', 40, 295);
  const fingerEntries = ['thumb', 'index', 'middle', 'ring', 'pinky'].map((f) => ({
    finger: f,
    reps: snapshot.byFinger[f] ?? 0,
  }));
  const maxFR = Math.max(1, ...fingerEntries.map((e) => e.reps));
  let fy = 320;
  for (const { finger, reps } of fingerEntries) {
    ctx.fillStyle = '#374151';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(finger, 40, fy + 14);
    // bar
    const barX = 130, barY = fy + 4, barW = 320, barH = 14;
    ctx.fillStyle = '#e5e7eb';
    roundRect(ctx, barX, barY, barW, barH, 7); ctx.fill();
    const w = (reps / maxFR) * barW;
    const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    grad.addColorStop(0, '#a855f7');
    grad.addColorStop(1, '#6366f1');
    ctx.fillStyle = grad;
    if (w > 0) { roundRect(ctx, barX, barY, Math.max(8, w), barH, 7); ctx.fill(); }
    ctx.fillStyle = '#374151';
    ctx.fillText(String(reps), barX + barW + 14, fy + 14);
    fy += 28;
  }

  // Daily reps chart
  drawSectionTitle(ctx, 'Daily reps', 480, 295);
  const chartX = 480, chartY = 320, chartW = 280, chartH = 110;
  ctx.fillStyle = '#f3f4f6';
  roundRect(ctx, chartX, chartY, chartW, chartH, 12); ctx.fill();
  const days = snapshot.dailyReps;
  const maxDR = Math.max(1, ...days.map((d) => d.reps));
  const slot = chartW / Math.max(1, days.length);
  for (let i = 0; i < days.length; i++) {
    const r = days[i].reps;
    const h = (r / maxDR) * (chartH - 16);
    const x = chartX + i * slot + 4;
    const y = chartY + chartH - h - 8;
    ctx.fillStyle = '#10b981';
    ctx.fillRect(x, y, slot - 8, h);
  }

  // Achievements / medals / plants tiles
  const tileY = 480;
  drawTile(ctx, 40, tileY, 230, 100, '#fef3c7', '#92400e', 'NEW ACHIEVEMENTS', String(snapshot.recentlyUnlockedAchievementIds.length));
  drawTile(ctx, 285, tileY, 230, 100, '#ffe4e6', '#9f1239', 'MEDALS (W + M)', String(snapshot.medalsThisWeek + snapshot.medalsThisMonth));
  drawTile(ctx, 530, tileY, 230, 100, '#fce7f3', '#9d174d', 'PLANTS IN BLOOM', String(snapshot.garden.bloomedCount));

  // Lifetime totals
  drawSectionTitle(ctx, 'Lifetime', 40, 615);
  ctx.fillStyle = '#374151';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText(`Total sessions: ${snapshot.lifetime.totalSessions}`, 40, 645);
  ctx.fillText(`Total reps: ${snapshot.lifetime.totalReps}`, 40, 668);
  ctx.fillText(`Total points: ${snapshot.lifetime.totalPoints.toLocaleString()}`, 40, 691);
  ctx.fillText(`Plants discovered: ${snapshot.garden.discoveredCount}`, 40, 714);
  ctx.fillText(`Cards collected: ${snapshot.cards.unique}`, 40, 737);

  // Recently unlocked listing
  const recent = snapshot.recentlyUnlockedAchievementIds
    .map((id) => achievementsService.getDefinitions().find((d) => d.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 6);
  if (recent.length > 0) {
    drawSectionTitle(ctx, 'Recently unlocked', 40, 800);
    ctx.fillStyle = '#92400e';
    ctx.font = '15px system-ui, sans-serif';
    let ry = 825;
    for (const a of recent) {
      ctx.fillText(`${a.icon}  ${a.title} — ${a.description}`, 40, ry);
      ry += 22;
    }
  }

  // Footer
  ctx.fillStyle = '#9ca3af';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `Generated ${new Date(snapshot.endISO).toLocaleString()} · SteadiGrip · Affordable AI Parkinson's Rehab`,
    W / 2,
    H - 30
  );
  ctx.textAlign = 'left';

  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function drawStatBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, value: string): void {
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 12); ctx.stroke();
  ctx.fillStyle = '#9ca3af';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText(label, x + 14, y + 24);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText(value, x + 14, y + 60);
}

function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: string, fg: string, label: string, value: string): void {
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, 12); ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText(label, x + 14, y + 24);
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.fillText(value, x + 14, y + 70);
}

function drawSectionTitle(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = '#374151';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(text, x, y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
