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
 * Fish Catch — reaction time + max grip strength.
 *
 * A fish appears at random intervals. While the fish is on screen the
 * patient must close their grip past the catchThreshold within the
 * response window. Successful catches reward higher score the faster
 * + harder the grip. Misses are silent (anti-frustration: never red).
 *
 * Reps = successful catches.
 */

type Phase = 'idle' | 'waiting' | 'fish' | 'caught' | 'gone';

const FINGER_MODES: Array<{ value: FingerMode; label: string }> = [
  { value: 'average', label: 'Average Grip' },
  { value: 'thumb', label: 'Thumb' },
  { value: 'index', label: 'Index' },
  { value: 'middle', label: 'Middle' },
  { value: 'ring', label: 'Ring' },
  { value: 'pinky', label: 'Pinky' },
];

const DIFFICULTY: Record<Difficulty, {
  label: string;
  catchThreshold: number;
  responseWindowMs: number;
  minWaitMs: number;
  maxWaitMs: number;
  releaseThreshold: number;
}> = {
  easy:   { label: 'Easy',   catchThreshold: 60, responseWindowMs: 2200, minWaitMs: 1500, maxWaitMs: 3500, releaseThreshold: 30 },
  medium: { label: 'Medium', catchThreshold: 70, responseWindowMs: 1800, minWaitMs: 1200, maxWaitMs: 2800, releaseThreshold: 35 },
  hard:   { label: 'Hard',   catchThreshold: 80, responseWindowMs: 1400, minWaitMs: 800,  maxWaitMs: 2200, releaseThreshold: 40 },
};

const FISH_EMOJIS = ['🐟', '🐠', '🐡', '🦐', '🦞'];

export default function FishCatchPage() {
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [fingerMode, setFingerMode] = useState<FingerMode>('average');
  const [demoMode, setDemoMode] = useState(true);
  const demoTickRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fishKind, setFishKind] = useState(0);
  const [reps, setReps] = useState(0);          // successful catches
  const [misses, setMisses] = useState(0);
  const [score, setScore] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [streak, setStreak] = useState(0);      // consecutive catches
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  const [bestReactionMs, setBestReactionMs] = useState<number | null>(null);

  const fishAppearedAtRef = useRef<number | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const grippedRef = useRef(false);
  const playingRef = useRef(false);

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

  const bend = demoMode ? demoBendForPhase(phase, demoTickRef.current) : liveBend;
  const accuracy = (reps + misses) === 0 ? 0 : Math.round((reps / (reps + misses)) * 100);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  useEffect(() => { playingRef.current = isPlaying; }, [isPlaying]);

  // Track grip state edges (rising past threshold = catch attempt)
  useEffect(() => {
    const wasGripped = grippedRef.current;
    const isGripped = bend >= settings.catchThreshold;
    grippedRef.current = isGripped;
    if (!isPlaying) return;
    if (!wasGripped && isGripped && phase === 'fish' && fishAppearedAtRef.current !== null) {
      // Successful catch
      const reaction = Date.now() - fishAppearedAtRef.current;
      setLastReactionMs(reaction);
      setBestReactionMs((b) => (b === null ? reaction : Math.min(b, reaction)));
      setReps((r) => r + 1);
      setStreak((s) => {
        const next = s + 1;
        setBestStreak((b) => Math.max(b, next));
        return next;
      });
      // Score: base 50 + speed bonus (faster = more, capped at +100) + streak bonus.
      const speedBonus = Math.max(0, Math.round((settings.responseWindowMs - reaction) / 10));
      setScore((sc) => sc + 50 + Math.min(100, speedBonus));
      setPhase('caught');
      fishAppearedAtRef.current = null;
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = setTimeout(() => {
        if (playingRef.current) scheduleNextFish();
      }, 800);
    }
  }, [bend, isPlaying, phase, settings.catchThreshold, settings.responseWindowMs]);

  // Elapsed-time loop (drives demo bend animation too)
  useEffect(() => {
    if (!isPlaying) {
      lastTickRef.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (lastTickRef.current === null) lastTickRef.current = now;
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      setElapsedMs((v) => v + dt);
      demoTickRef.current = (demoTickRef.current + dt / 1000) % 1000;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const scheduleNextFish = () => {
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    setPhase('waiting');
    const wait = settings.minWaitMs + Math.random() * (settings.maxWaitMs - settings.minWaitMs);
    phaseTimerRef.current = setTimeout(() => {
      if (!playingRef.current) return;
      setFishKind(Math.floor(Math.random() * FISH_EMOJIS.length));
      setPhase('fish');
      fishAppearedAtRef.current = Date.now();
      // Auto-miss after response window.
      phaseTimerRef.current = setTimeout(() => {
        if (!playingRef.current) return;
        if (fishAppearedAtRef.current !== null) {
          fishAppearedAtRef.current = null;
          setMisses((m) => m + 1);
          setStreak(0);
          setPhase('gone');
          if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
          phaseTimerRef.current = setTimeout(() => {
            if (playingRef.current) scheduleNextFish();
          }, 600);
        }
      }, settings.responseWindowMs);
    }, wait);
  };

  const start = async () => {
    setIsPlaying(true);
    if (phase === 'idle' || phase === 'caught' || phase === 'gone') {
      setTimeout(() => scheduleNextFish(), 50);
    }
    if (isConnected) try { await sendCommand('START'); } catch {}
  };

  const pause = async () => {
    setIsPlaying(false);
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    fishAppearedAtRef.current = null;
    setPhase('idle');
    if (isConnected) try { await sendCommand('STOP'); } catch {}
  };

  const reset = () => {
    setIsPlaying(false);
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    fishAppearedAtRef.current = null;
    lastTickRef.current = null;
    setPhase('idle');
    setReps(0);
    setMisses(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setElapsedMs(0);
    setLastReactionMs(null);
    setBestReactionMs(null);
  };

  const finishSession = async () => {
    setIsPlaying(false);
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    if (isConnected) try { await sendCommand('STOP'); } catch {}
    finish({
      gameType: 'fish-catch',
      difficulty,
      fingerMode,
      durationMs: elapsedMs,
      reps,
      score,
      accuracy,
      bestStreak,
      extra: {
        bestReactionMs: bestReactionMs ?? 0,
        lastReactionMs: lastReactionMs ?? 0,
      },
    });
  };

  // Cleanup any pending timer on unmount.
  useEffect(() => () => {
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
  }, []);

  const handleClose = () => { close(); reset(); resetSummary(); };
  const handleAgain = () => { close(); reset(); resetSummary(); setTimeout(() => { void start(); }, 50); };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-cyan-50 to-blue-100 dark:from-sky-950/40 dark:via-cyan-950/40 dark:to-blue-950/40 text-gray-900 dark:text-white antialiased flex flex-col">
      <AppTopBar showBack />
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-300 dark:border-blue-700/40 bg-white/70 dark:bg-blue-900/20 px-4 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300">
            🐟 Fish Catch
          </div>
          <h1 className="mt-3 text-4xl font-bold">Catch the fish</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            When a fish appears, snap your grip closed quickly to catch it. Faster catches = more points.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_240px]">
          {/* Pond */}
          <section className="relative overflow-hidden rounded-3xl border-2 border-cyan-300 dark:border-cyan-700/40 bg-gradient-to-b from-cyan-200 via-blue-200 to-blue-300 dark:from-cyan-800/40 dark:via-blue-800/40 dark:to-blue-900/40 p-6 shadow-md min-h-[360px]">
            <Ripples />
            <div className="relative h-72 flex items-center justify-center">
              {phase === 'idle' && (
                <div className="text-center text-blue-900 dark:text-blue-100">
                  <div className="text-6xl mb-3">🎣</div>
                  <p className="text-lg font-semibold">Press Start to begin fishing</p>
                </div>
              )}
              {phase === 'waiting' && (
                <div className="text-center text-blue-700 dark:text-blue-200">
                  <div className="text-5xl animate-pulse">🌊</div>
                  <p className="mt-2 text-sm">Watching the water…</p>
                </div>
              )}
              {phase === 'fish' && (
                <div className="text-center">
                  <div className="text-8xl animate-bounce">{FISH_EMOJIS[fishKind]}</div>
                  <p className="mt-2 text-lg font-bold text-rose-600 dark:text-rose-300">Now! Grip!</p>
                </div>
              )}
              {phase === 'caught' && (
                <div className="text-center">
                  <div className="text-8xl">{FISH_EMOJIS[fishKind]}</div>
                  <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-300">Caught!</p>
                  {lastReactionMs !== null && (
                    <p className="text-sm text-blue-700 dark:text-blue-200">{lastReactionMs} ms reaction</p>
                  )}
                </div>
              )}
              {phase === 'gone' && (
                <div className="text-center text-blue-700 dark:text-blue-200">
                  <div className="text-6xl">💧</div>
                  <p className="mt-2 text-base">It got away — keep watching</p>
                </div>
              )}
            </div>

            {/* Bend bar */}
            <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-white/70 dark:bg-black/30 backdrop-blur p-2 text-xs">
              <div className="flex items-center justify-between mb-1 text-gray-700 dark:text-gray-200">
                <span>Grip</span>
                <span className="font-semibold">{bend}% / threshold {settings.catchThreshold}%</span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-700">
                <div
                  className={`h-full ${bend >= settings.catchThreshold ? 'bg-emerald-500' : 'bg-blue-400'}`}
                  style={{ width: `${Math.min(100, bend)}%` }}
                />
                <div
                  className="absolute top-0 h-full w-0.5 bg-rose-500"
                  style={{ left: `${settings.catchThreshold}%` }}
                />
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-center">
              <Stat label="Catches" value={reps.toString()} />
              <Stat label="Streak" value={streak.toString()} />
              <Stat label="Accuracy" value={`${accuracy}%`} />
              <Stat label="Best ms" value={bestReactionMs !== null ? `${bestReactionMs}` : '—'} />
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 shadow-sm">
              <h3 className="mb-3 font-semibold">Session</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={isPlaying ? pause : start} className="flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-3 py-2.5 font-semibold text-white hover:bg-blue-400 transition">
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
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-gray-200 dark:disabled:bg-neutral-800 disabled:text-gray-400 transition"
              >
                <CheckCircle2 size={16} /> Finish &amp; Save
              </button>
              <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
                {elapsedMs < 5000 || reps < 1 ? 'Catch at least one fish to save.' : `Time ${elapsedSeconds}s`}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 shadow-sm">
              <h3 className="mb-3 font-semibold">Settings</h3>
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-3">
                Difficulty
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2">
                  {Object.entries(DIFFICULTY).map(([v, d]) => <option key={v} value={v}>{d.label}</option>)}
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
                <input type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} className="h-4 w-4 accent-blue-500" />
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

/** Demo bend simulation that "catches" fish automatically for visual previews. */
function demoBendForPhase(phase: Phase, t: number): number {
  if (phase === 'fish') {
    // Slow ramp up over ~1.5s
    const ramped = Math.min(100, (t % 2) * 60);
    return Math.round(ramped + 30);
  }
  return Math.round(20 + Math.sin(t * 1.2) * 10);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function Ripples() {
  return (
    <div className="absolute inset-0 pointer-events-none opacity-40">
      <svg className="w-full h-full" viewBox="0 0 400 200" preserveAspectRatio="none">
        <circle cx="80" cy="60" r="20" fill="none" stroke="white" strokeWidth="1" />
        <circle cx="80" cy="60" r="40" fill="none" stroke="white" strokeWidth="1" />
        <circle cx="320" cy="140" r="18" fill="none" stroke="white" strokeWidth="1" />
        <circle cx="320" cy="140" r="32" fill="none" stroke="white" strokeWidth="1" />
      </svg>
    </div>
  );
}
