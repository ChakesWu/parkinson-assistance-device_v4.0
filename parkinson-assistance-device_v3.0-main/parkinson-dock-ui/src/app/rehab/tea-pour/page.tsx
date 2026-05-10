'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CheckCircle2, Pause, Play, RotateCcw } from 'lucide-react';
import AppTopBar from '@/components/ui/AppTopBar';
import { useGlobalConnection } from '@/hooks/useGlobalConnection';
import { type SensorData } from '@/utils/bluetoothManager';
import { useSessionFinish } from '@/hooks/useSessionFinish';
import SessionCompleteModal from '@/components/rewards/SessionCompleteModal';
import type { Difficulty, FingerMode } from '@/services/rehabSessionService';

/**
 * Tea Pour — sustained controlled flexion.
 *
 * The patient bends their fingers to a target level and holds it steady
 * to fill the cup without spilling. Holding inside the tolerance band
 * raises the cup level; drifting outside lowers it (gently — never
 * back to zero, anti-frustration). When the cup reaches full, it counts
 * as 1 completed pour (rep) and a fresh target is chosen.
 */

type Phase = 'idle' | 'pouring' | 'spilling' | 'complete';

const FINGER_MODES: Array<{ value: FingerMode; label: string }> = [
  { value: 'average', label: 'Average Grip' },
  { value: 'thumb', label: 'Thumb' },
  { value: 'index', label: 'Index' },
  { value: 'middle', label: 'Middle' },
  { value: 'ring', label: 'Ring' },
  { value: 'pinky', label: 'Pinky' },
];

const DIFFICULTY: Record<Difficulty, { label: string; tolerance: number; fillPerSec: number; spillPerSec: number; targetMin: number; targetMax: number }> = {
  easy:   { label: 'Easy',   tolerance: 18, fillPerSec: 35, spillPerSec: 10, targetMin: 30, targetMax: 70 },
  medium: { label: 'Medium', tolerance: 13, fillPerSec: 30, spillPerSec: 14, targetMin: 25, targetMax: 80 },
  hard:   { label: 'Hard',   tolerance: 9,  fillPerSec: 25, spillPerSec: 18, targetMin: 20, targetMax: 85 },
};

export default function TeaPourPage() {
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [fingerMode, setFingerMode] = useState<FingerMode>('average');
  const [demoMode, setDemoMode] = useState(true);
  const [demoPhase, setDemoPhase] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [target, setTarget] = useState(50);
  const [cupLevel, setCupLevel] = useState(0);   // 0..100 fill
  const [reps, setReps] = useState(0);
  const [score, setScore] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [holdStreakSec, setHoldStreakSec] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [hits, setHits] = useState(0);
  const [samples, setSamples] = useState(0);

  const lastTickRef = useRef<number | null>(null);
  const inBandRef = useRef(false);

  const { isConnected, deviceName, connectionType, connectBluetooth, connectSerial, sendCommand, isConnecting, error } = useGlobalConnection({
    onDataReceived: (data) => {
      setSensorData(data);
      setDemoMode(false);
    },
  });
  const { summary, open, finish, close, reset: resetSummary } = useSessionFinish();

  const settings = DIFFICULTY[difficulty];

  const liveBend = useMemo(() => {
    if (!sensorData?.fingers?.length) return 0;
    const fingers = sensorData.fingers.map(v => Math.max(0, Math.min(1023, v)));
    const indexByMode: Partial<Record<FingerMode, number>> = { thumb: 0, index: 1, middle: 2, ring: 3, pinky: 4 };
    if (fingerMode === 'average') {
      return Math.round((fingers.reduce((a, b) => a + b, 0) / fingers.length / 1023) * 100);
    }
    const idx = indexByMode[fingerMode] ?? 0;
    return Math.round(((fingers[idx] ?? 0) / 1023) * 100);
  }, [fingerMode, sensorData]);

  // Demo bend slowly oscillates around 50 so the demo looks like a steady hand.
  const demoBend = Math.round(50 + Math.sin(demoPhase * 0.6) * 25);
  const bend = demoMode ? Math.max(0, Math.min(100, demoBend)) : liveBend;

  const inBand = Math.abs(bend - target) <= settings.tolerance;
  const accuracy = samples === 0 ? 0 : Math.round((hits / samples) * 100);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  useEffect(() => { inBandRef.current = inBand; }, [inBand]);

  // Animation / fill loop
  useEffect(() => {
    if (!isPlaying) {
      lastTickRef.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (lastTickRef.current === null) lastTickRef.current = now;
      const dt = (now - lastTickRef.current) / 1000; // seconds
      lastTickRef.current = now;

      setElapsedMs((v) => v + dt * 1000);
      setSamples((v) => v + 1);
      setDemoPhase((v) => v + dt);

      if (inBandRef.current) {
        setHits((v) => v + 1);
        setHoldStreakSec((v) => {
          const next = v + dt;
          setBestStreak((b) => Math.max(b, Math.floor(next * 10)));
          return next;
        });
        setCupLevel((lvl) => {
          const newLvl = Math.min(100, lvl + settings.fillPerSec * dt);
          if (newLvl >= 100 && lvl < 100) {
            // Pour complete — count rep, give points, reset cup, choose new target.
            setReps((r) => r + 1);
            setScore((s) => s + 100 + Math.floor(holdStreakSec * 5));
            setPhase('complete');
            setTimeout(() => {
              setCupLevel(0);
              setPhase('pouring');
              setTarget(Math.floor(settings.targetMin + Math.random() * (settings.targetMax - settings.targetMin)));
              setHoldStreakSec(0);
            }, 600);
          }
          return newLvl;
        });
        if (phase !== 'complete') setPhase('pouring');
      } else {
        setHoldStreakSec(0);
        setCupLevel((lvl) => Math.max(0, lvl - settings.spillPerSec * dt));
        if (phase !== 'complete') setPhase('spilling');
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, settings.fillPerSec, settings.spillPerSec, settings.targetMin, settings.targetMax, holdStreakSec, phase]);

  const reset = () => {
    setIsPlaying(false);
    setCupLevel(0);
    setReps(0);
    setScore(0);
    setBestStreak(0);
    setHoldStreakSec(0);
    setHits(0);
    setSamples(0);
    setElapsedMs(0);
    setPhase('idle');
    setTarget(50);
    lastTickRef.current = null;
  };

  const start = async () => {
    setIsPlaying(true);
    if (phase === 'idle') setPhase('pouring');
    if (isConnected) try { await sendCommand('START'); } catch {}
  };

  const pause = async () => {
    setIsPlaying(false);
    if (isConnected) try { await sendCommand('STOP'); } catch {}
  };

  const finishSession = async () => {
    setIsPlaying(false);
    if (isConnected) try { await sendCommand('STOP'); } catch {}
    finish({
      gameType: 'tea-pour',
      difficulty,
      fingerMode,
      durationMs: elapsedMs,
      reps,
      score,
      accuracy,
      bestStreak,
    });
  };

  const handleClose = () => { close(); reset(); resetSummary(); };
  const handleAgain = () => { close(); reset(); resetSummary(); setTimeout(() => { void start(); }, 50); };

  // Visual: cup is centered. Tea fills cup. Bend gauge shows current bend with target band.
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white antialiased flex flex-col">
      <AppTopBar showBack />
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300 dark:border-emerald-700/40 bg-white/70 dark:bg-emerald-900/20 px-4 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            🍵 Tea Pour
          </div>
          <h1 className="mt-3 text-4xl font-bold">Pour the perfect cup</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Hold your bend exactly at the target. Stay too low and the tea won't pour; bend too far and it spills.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_240px]">
          {/* Game canvas */}
          <section className="rounded-3xl border border-emerald-200 dark:border-emerald-700/30 bg-white/80 dark:bg-emerald-900/20 p-6 shadow-md">
            <div className="flex items-end justify-center gap-8">
              {/* Cup */}
              <div className="relative">
                <div className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cup</div>
                <div className="relative h-56 w-44 rounded-b-[3rem] rounded-t-md border-4 border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 overflow-hidden">
                  <div
                    className="absolute bottom-0 left-0 right-0 transition-all duration-200 ease-linear bg-gradient-to-t from-amber-700 via-amber-500 to-amber-300"
                    style={{ height: `${cupLevel}%` }}
                  />
                  <div className="absolute inset-x-0 top-2 text-center text-2xl">🫖</div>
                  <div className="absolute inset-x-0 bottom-2 text-center text-xl font-bold text-amber-900 dark:text-amber-100 drop-shadow">
                    {Math.round(cupLevel)}%
                  </div>
                </div>
                <div className={`mt-2 text-center text-sm font-semibold ${
                  phase === 'complete' ? 'text-amber-600' :
                  phase === 'spilling' ? 'text-rose-500' :
                  phase === 'pouring' ? 'text-emerald-600' : 'text-gray-400'
                }`}>
                  {phase === 'complete' ? 'Perfect pour!' : phase === 'spilling' ? 'Adjust your grip' : phase === 'pouring' ? 'Pouring…' : 'Press Start'}
                </div>
              </div>

              {/* Bend gauge with target band */}
              <div className="relative h-56 w-16">
                <div className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bend</div>
                <div className="relative h-full w-full rounded-full border-2 border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
                  {/* Target band */}
                  <div
                    className="absolute left-0 right-0 bg-emerald-300/40 dark:bg-emerald-500/30 border-y-2 border-emerald-500"
                    style={{
                      bottom: `${Math.max(0, target - settings.tolerance)}%`,
                      height: `${Math.min(100, settings.tolerance * 2)}%`,
                    }}
                  />
                  {/* Player marker */}
                  <div
                    className={`absolute left-0 right-0 h-2 transition-all duration-100 ${inBand ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    style={{ bottom: `calc(${bend}% - 4px)` }}
                  />
                </div>
                <div className="mt-2 text-center text-xs font-semibold">
                  <div className="text-gray-600 dark:text-gray-300">{bend}%</div>
                  <div className="text-emerald-600 dark:text-emerald-400">target {target}%</div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-4 gap-3 text-center">
              <Stat label="Reps" value={reps.toString()} />
              <Stat label="Accuracy" value={`${accuracy}%`} />
              <Stat label="Hold" value={`${holdStreakSec.toFixed(1)}s`} />
              <Stat label="Time" value={`${elapsedSeconds}s`} />
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 shadow-sm">
              <h3 className="mb-3 font-semibold">Session</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={isPlaying ? pause : start} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 font-semibold text-white hover:bg-emerald-400 transition">
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                  {isPlaying ? 'Pause' : 'Start'}
                </button>
                <button onClick={reset} className="flex items-center justify-center gap-2 rounded-xl bg-gray-200 dark:bg-neutral-700 px-3 py-2.5 font-semibold hover:bg-gray-300 dark:hover:bg-neutral-600 transition">
                  <RotateCcw size={16} /> Reset
                </button>
              </div>
              <button
                onClick={finishSession}
                disabled={elapsedMs < 5000 || reps < 1}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 py-2.5 font-semibold text-amber-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-gray-200 dark:disabled:bg-neutral-800 disabled:text-gray-400 transition"
              >
                <CheckCircle2 size={16} /> Finish &amp; Save
              </button>
              <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
                {elapsedMs < 5000 || reps < 1 ? 'Pour at least one cup to save.' : 'Saves your reps, points and quest progress.'}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 shadow-sm">
              <h3 className="mb-3 font-semibold">Settings</h3>
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-3">
                Difficulty
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2">
                  {Object.entries(DIFFICULTY).map(([v, d]) => (
                    <option key={v} value={v}>{d.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-3">
                Finger
                <select value={fingerMode} onChange={(e) => setFingerMode(e.target.value as FingerMode)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2">
                  {FINGER_MODES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300 rounded-xl bg-gray-100 dark:bg-neutral-800 px-3 py-2">
                Demo mode
                <input type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
              </label>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 shadow-sm text-sm text-gray-600 dark:text-gray-300">
              <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">Connection</h3>
              <div>{isConnected ? `Connected${deviceName ? `: ${deviceName}` : ''}` : 'Demo mode available'}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Activity size={12} /> {connectionType ?? (demoMode ? 'simulated' : 'awaiting data')}
              </div>
              <div className="mt-3 grid gap-1.5">
                <button disabled={isConnecting || isConnected} onClick={connectBluetooth} className="rounded-xl bg-blue-500 px-3 py-1.5 text-white text-sm hover:bg-blue-400 disabled:opacity-50">Connect Bluetooth</button>
                <button disabled={isConnecting || isConnected} onClick={connectSerial} className="rounded-xl bg-purple-500 px-3 py-1.5 text-white text-sm hover:bg-purple-400 disabled:opacity-50">Connect Serial</button>
              </div>
              {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
            </div>
          </aside>
        </div>

        <SessionCompleteModal open={open} summary={summary} onClose={handleClose} onPlayAgain={handleAgain} />
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 p-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
