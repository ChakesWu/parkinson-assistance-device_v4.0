'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, CheckCircle2, Gamepad2, Pause, Play, RotateCcw, Target, Trophy, Zap } from 'lucide-react';
import AppTopBar from '@/components/ui/AppTopBar';
import { useGlobalConnection } from '@/hooks/useGlobalConnection';
import { type SensorData } from '@/utils/bluetoothManager';
import { useSessionFinish } from '@/hooks/useSessionFinish';
import SessionCompleteModal from '@/components/rewards/SessionCompleteModal';

type Difficulty = 'easy' | 'medium' | 'hard';
type FingerMode = 'average' | 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

type SamplePoint = {
  x: number;
  target: number;
};

const GAME_WIDTH = 720;
const GAME_HEIGHT = 320;
const SAMPLE_COUNT = 96;
const REP_HIGH_THRESHOLD = 72;
const REP_LOW_THRESHOLD = 28;

const difficultySettings: Record<Difficulty, { label: string; tolerance: number; speed: number; amplitude: number; frequency: number; tempo: string }> = {
  easy: { label: 'Easy', tolerance: 22, speed: 0.0018, amplitude: 30, frequency: 1, tempo: 'Very slow control' },
  medium: { label: 'Medium', tolerance: 17, speed: 0.0030, amplitude: 32, frequency: 1.5, tempo: 'Slow steady rhythm' },
  hard: { label: 'Hard', tolerance: 13, speed: 0.0042, amplitude: 35, frequency: 2, tempo: 'Controlled precision' },
};

const fingerOptions: Array<{ value: FingerMode; label: string }> = [
  { value: 'average', label: 'Average Grip' },
  { value: 'thumb', label: 'Thumb' },
  { value: 'index', label: 'Index' },
  { value: 'middle', label: 'Middle' },
  { value: 'ring', label: 'Ring' },
  { value: 'pinky', label: 'Pinky' },
];

export default function RehabGamePage() {
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [fingerMode, setFingerMode] = useState<FingerMode>('average');
  const [isPlaying, setIsPlaying] = useState(false);
  const [demoMode, setDemoMode] = useState(true);
  const [phase, setPhase] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [hits, setHits] = useState(0);
  const [samples, setSamples] = useState(0);
  const [reps, setReps] = useState(0);
  const [repStage, setRepStage] = useState<'low' | 'high'>('low');
  const [elapsedMs, setElapsedMs] = useState(0);
  const lastTickRef = useRef<number | null>(null);
  const isOnPathRef = useRef(false);

  const { isConnected, connectionType, deviceName, connectBluetooth, connectSerial, sendCommand, isConnecting, error } = useGlobalConnection({
    onDataReceived: (data) => {
      setSensorData(data);
      setDemoMode(false);
    },
  });

  const { summary, open, finish, close, reset: resetSummary } = useSessionFinish();

  const settings = difficultySettings[difficulty];

  const liveBend = useMemo(() => {
    if (!sensorData?.fingers?.length) return 0;
    const fingers = sensorData.fingers.map(value => Math.max(0, Math.min(1023, value)));
    const indexByMode: Partial<Record<FingerMode, number>> = {
      thumb: 0,
      index: 1,
      middle: 2,
      ring: 3,
      pinky: 4,
    };
    if (fingerMode === 'average') {
      return Math.round((fingers.reduce((sum, value) => sum + value, 0) / fingers.length / 1023) * 100);
    }
    const index = indexByMode[fingerMode] ?? 0;
    return Math.round(((fingers[index] ?? 0) / 1023) * 100);
  }, [fingerMode, sensorData]);

  const demoBend = Math.round(50 + Math.sin(phase * 0.38) * 28);
  const bendPercent = demoMode ? Math.max(0, Math.min(100, demoBend)) : liveBend;
  const playerY = GAME_HEIGHT - (bendPercent / 100) * GAME_HEIGHT;

  const pathPoints = useMemo<SamplePoint[]>(() => {
    return Array.from({ length: SAMPLE_COUNT }, (_, index) => {
      const x = (index / (SAMPLE_COUNT - 1)) * GAME_WIDTH;
      const normalized = index / (SAMPLE_COUNT - 1);
      const wave = 50 + Math.sin(normalized * Math.PI * 2 * settings.frequency + phase) * settings.amplitude;
      return { x, target: Math.max(8, Math.min(92, wave)) };
    });
  }, [phase, settings.amplitude, settings.frequency]);

  const currentTarget = pathPoints[12]?.target ?? 50;
  const targetY = GAME_HEIGHT - (currentTarget / 100) * GAME_HEIGHT;
  const isOnPath = Math.abs(bendPercent - currentTarget) <= settings.tolerance;
  const accuracy = samples === 0 ? 0 : Math.round((hits / samples) * 100);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  useEffect(() => {
    isOnPathRef.current = isOnPath;
  }, [isOnPath]);

  useEffect(() => {
    if (!isPlaying) {
      lastTickRef.current = null;
      return;
    }

    let animationFrame = 0;
    const tick = (now: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = now;
      }
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;

      setElapsedMs(value => value + delta);
      setPhase(value => value + settings.speed * delta);
      setSamples(value => value + 1);

      if (isOnPathRef.current) {
        setHits(value => value + 1);
        setStreak(value => {
          const next = value + 1;
          setScore(scoreValue => scoreValue + 12 + Math.min(next, 20));
          setBestStreak(best => Math.max(best, next));
          return next;
        });
      } else {
        setStreak(0);
      }

      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, settings.speed]);

  useEffect(() => {
    if (!isPlaying) return;

    if (repStage === 'low' && bendPercent >= REP_HIGH_THRESHOLD) {
      setRepStage('high');
    }

    if (repStage === 'high' && bendPercent <= REP_LOW_THRESHOLD) {
      setReps(value => value + 1);
      setRepStage('low');
    }
  }, [bendPercent, isPlaying, repStage]);

  const pathData = pathPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${(GAME_HEIGHT - (point.target / 100) * GAME_HEIGHT).toFixed(1)}`).join(' ');
  const upperBand = pathPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${(GAME_HEIGHT - (Math.min(100, point.target + settings.tolerance) / 100) * GAME_HEIGHT).toFixed(1)}`).join(' ');
  const lowerBand = pathPoints.slice().reverse().map(point => `L ${point.x.toFixed(1)} ${(GAME_HEIGHT - (Math.max(0, point.target - settings.tolerance) / 100) * GAME_HEIGHT).toFixed(1)}`).join(' ');
  const bandPath = `${upperBand} ${lowerBand} Z`;

  const resetGame = () => {
    setIsPlaying(false);
    setPhase(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setHits(0);
    setSamples(0);
    setReps(0);
    setRepStage('low');
    setElapsedMs(0);
    lastTickRef.current = null;
  };

  const startSession = async () => {
    setIsPlaying(true);
    if (isConnected) {
      try {
        await sendCommand('START');
      } catch {}
    }
  };

  const pauseSession = async () => {
    setIsPlaying(false);
    if (isConnected) {
      try {
        await sendCommand('STOP');
      } catch {}
    }
  };

  const finishSession = async () => {
    setIsPlaying(false);
    if (isConnected) {
      try {
        await sendCommand('STOP');
      } catch {}
    }
    const result = finish({
      gameType: 'sine-wave',
      difficulty,
      fingerMode,
      durationMs: elapsedMs,
      reps,
      score,
      accuracy,
      bestStreak,
    });
    // If session was too short to count, just leave the page state alone so the
    // patient can keep practising — the toast/modal won't fire.
    if (!result) {
      // Optional: a quick visual hint could be added; for now, no-op.
    }
  };

  const handleModalClose = () => {
    close();
    resetGame();
    resetSummary();
  };

  const handlePlayAgain = () => {
    close();
    resetGame();
    resetSummary();
    setTimeout(() => { void startSession(); }, 50);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white antialiased flex flex-col">
      <AppTopBar showBack />
      <main className="flex-1 container mx-auto px-4 py-8 pb-28">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium leading-6 tracking-wide text-cyan-200">
              <Gamepad2 size={16} /> Parkinson Rehabilitation Game
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-normal md:text-5xl md:leading-tight">Grip Rhythm Trainer</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 tracking-normal text-slate-300">
              Follow the scrolling path with controlled glove movement. The game rewards full range of motion, steady tempo, and patient engagement during rehabilitation training.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm leading-6 tracking-normal text-slate-200 shadow-xl backdrop-blur">
            <div className="font-semibold leading-6 text-white">Connection</div>
            <div className="mt-1">{isConnected ? `Connected${deviceName ? `: ${deviceName}` : ''}` : 'Demo mode available'}</div>
            <div className="text-slate-400">{connectionType ? `Type: ${connectionType}` : demoMode ? 'Using slow simulated glove motion' : 'Waiting for glove data'}</div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl">
            <div className="border-b border-white/10 bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-purple-500/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold leading-7 tracking-normal">Sine Wave Follower</h2>
                  <p className="mt-1 text-sm leading-6 tracking-normal text-slate-300">Move your fingers in a smooth rhythm to trace the sine wave inside the glowing band.</p>
                </div>
                <div className={`rounded-full px-4 py-2 text-sm font-semibold leading-5 tracking-wide ${isOnPath ? 'bg-emerald-400 text-emerald-950' : 'bg-rose-400 text-rose-950'}`}>
                  {isOnPath ? 'On Path' : 'Adjust Grip'}
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="relative overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-b from-slate-800 to-slate-950">
                <svg viewBox={`0 0 ${GAME_WIDTH} ${GAME_HEIGHT}`} className="h-[320px] w-full" role="img" aria-label="Rehabilitation path following game area">
                  <defs>
                    <linearGradient id="pathGradient" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stopColor="#22d3ee" />
                      <stop offset="50%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#a78bfa" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  {[20, 40, 60, 80].map(line => (
                    <line key={line} x1="0" x2={GAME_WIDTH} y1={(GAME_HEIGHT * line) / 100} y2={(GAME_HEIGHT * line) / 100} stroke="rgba(148,163,184,0.16)" strokeDasharray="8 10" />
                  ))}
                  {/* Y-axis (vertical) and X-axis (midline) for sin graph look */}
                  <line x1="0" x2={GAME_WIDTH} y1={GAME_HEIGHT / 2} y2={GAME_HEIGHT / 2} stroke="rgba(148,163,184,0.45)" strokeWidth="1.5" />
                  <line x1="0" x2="0" y1="0" y2={GAME_HEIGHT} stroke="rgba(148,163,184,0.45)" strokeWidth="1.5" />
                  <text x="6" y="14" fill="rgba(148,163,184,0.7)" fontSize="11">100%</text>
                  <text x="6" y={GAME_HEIGHT / 2 - 4} fill="rgba(148,163,184,0.7)" fontSize="11">50%</text>
                  <text x="6" y={GAME_HEIGHT - 6} fill="rgba(148,163,184,0.7)" fontSize="11">0%</text>
                  <path d={bandPath} fill="rgba(34,211,238,0.13)" />
                  <path d={pathData} fill="none" stroke="url(#pathGradient)" strokeWidth="6" strokeLinecap="round" filter="url(#glow)" />
                  <line x1="90" x2="90" y1="0" y2={GAME_HEIGHT} stroke="rgba(255,255,255,0.28)" strokeDasharray="5 8" />
                  <circle cx="90" cy={targetY} r={settings.tolerance * 1.6} fill="rgba(34,211,238,0.14)" stroke="rgba(34,211,238,0.45)" />
                  <circle cx="90" cy={playerY} r="16" fill={isOnPath ? '#34d399' : '#fb7185'} stroke="white" strokeWidth="4" filter="url(#glow)" />
                </svg>
                <div className="absolute bottom-4 left-4 rounded-xl bg-black/40 px-4 py-2 text-sm leading-6 tracking-normal backdrop-blur">
                  Bend: <span className="font-bold text-cyan-200">{bendPercent}%</span> / Target: <span className="font-bold text-purple-200">{Math.round(currentTarget)}%</span>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard icon={<Trophy size={18} />} label="Score" value={score.toLocaleString()} />
              <MetricCard icon={<Target size={18} />} label="Accuracy" value={`${accuracy}%`} />
              <MetricCard icon={<Activity size={18} />} label="Reps" value={reps.toString()} />
              <MetricCard icon={<Zap size={18} />} label="Streak" value={streak.toString()} />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur">
              <h3 className="mb-4 text-lg font-semibold leading-7 tracking-normal">Session Controls</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={isPlaying ? pauseSession : startSession} className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400">
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                  {isPlaying ? 'Pause' : 'Start'}
                </button>
                <button onClick={resetGame} className="flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-4 py-3 font-semibold transition hover:bg-slate-600">
                  <RotateCcw size={18} /> Reset
                </button>
              </div>
              <button
                onClick={finishSession}
                disabled={elapsedMs < 5000 || reps < 1}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                <CheckCircle2 size={18} /> Finish &amp; Save
              </button>
              <p className="mt-2 text-center text-[11px] text-slate-400">
                {elapsedMs < 5000 || reps < 1
                  ? 'Play for a few seconds to enable saving.'
                  : 'Saves your reps, points, streak and quest progress.'}
              </p>

              <div className="mt-4 space-y-3">
                <label className="block text-sm leading-6 tracking-normal text-slate-300">
                  Difficulty
                  <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-white">
                    {Object.entries(difficultySettings).map(([value, item]) => (
                      <option key={value} value={value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm leading-6 tracking-normal text-slate-300">
                  Motion Input
                  <select value={fingerMode} onChange={(event) => setFingerMode(event.target.value as FingerMode)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-white">
                    {fingerOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between rounded-xl bg-slate-800 px-3 py-2 text-sm leading-6 tracking-normal text-slate-300">
                  Demo Mode
                  <input type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} className="h-5 w-5 accent-cyan-400" />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-5 text-sm leading-6 tracking-normal text-slate-300 shadow-xl backdrop-blur">
              <h3 className="mb-3 text-lg font-semibold leading-7 tracking-normal text-white">Training Metrics</h3>
              <div className="space-y-2">
                <InfoRow label="Mode" value={settings.label} />
                <InfoRow label="Tempo" value={settings.tempo} />
                <InfoRow label="Tolerance" value={`±${settings.tolerance}%`} />
                <InfoRow label="Time" value={`${elapsedSeconds}s`} />
                <InfoRow label="Best Streak" value={bestStreak.toString()} />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur">
              <h3 className="mb-3 text-lg font-semibold leading-7 tracking-normal">Device Actions</h3>
              <div className="grid gap-2">
                <button disabled={isConnecting || isConnected} onClick={connectBluetooth} className="rounded-xl bg-blue-500 px-4 py-2 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50">Connect Bluetooth</button>
                <button disabled={isConnecting || isConnected} onClick={connectSerial} className="rounded-xl bg-purple-500 px-4 py-2 font-semibold text-white transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50">Connect Serial</button>
              </div>
              {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
            </div>
          </aside>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <BenefitCard title="Full Range of Motion" text="Rep counting requires closing and reopening the hand instead of partial half-reps." />
          <BenefitCard title="Tempo Control" text="The scrolling wave guides both flexion and extension speed for smoother rehabilitation practice." />
          <BenefitCard title="Engagement Loop" text="Score, streak, and accuracy make repetitive therapy feel like a high-score challenge." />
        </section>
      </main>

      <SessionCompleteModal
        open={open}
        summary={summary}
        onClose={handleModalClose}
        onPlayAgain={handlePlayAgain}
      />
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center gap-2 text-cyan-200">{icon}<span className="text-sm">{label}</span></div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-2 last:border-b-0">
      <span>{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function BenefitCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-xl backdrop-blur">
      <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm text-slate-300">{text}</p>
    </div>
  );
}
