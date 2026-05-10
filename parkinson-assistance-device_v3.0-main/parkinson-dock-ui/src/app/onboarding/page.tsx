'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, Calendar, Users, Shield, ArrowRight } from 'lucide-react';
import { useGlobalConnection } from '@/hooks/useGlobalConnection';
import { analysisRecordService } from '@/services/analysisRecordService';
import { classifySeverity } from '@/lib/ai/recommendations';
import AppTopBar from '@/components/ui/AppTopBar';
import type { SensorData, SpeechResult } from '@/utils/bluetoothManager';

type Step = 1 | 2 | 3;
type SampleLevel = 'mild' | 'moderate' | 'severe';

// Pre-canned patient profiles for demo / bypass
const SAMPLE_PATIENTS: Record<SampleLevel, {
  label: string;
  tremorHz: number;
  severity: number;
  emgRms: number;
  fingerPositions: number[];
}> = {
  mild: {
    label: 'Mild',
    tremorHz: 1.6,
    severity: 22,
    emgRms: 80,
    fingerPositions: [45, 50, 55, 50, 48],
  },
  moderate: {
    label: 'Moderate',
    tremorHz: 5.2,
    severity: 58,
    emgRms: 220,
    fingerPositions: [55, 70, 75, 70, 60],
  },
  severe: {
    label: 'Severe',
    tremorHz: 6.8,
    severity: 85,
    emgRms: 420,
    fingerPositions: [70, 85, 90, 88, 75],
  },
};

const SAMPLE_VOICE: Record<SampleLevel, { speechClass: 0 | 1; prob: number }> = {
  mild: { speechClass: 0, prob: 0.25 },
  moderate: { speechClass: 1, prob: 0.65 },
  severe: { speechClass: 1, prob: 0.92 },
};

interface UserProfile {
  name: string;
  age: string;
  sex: string;
  race?: string;
  onboardingComplete?: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [profile, setProfile] = useState<UserProfile>({ name: '', age: '', sex: '' });

  // ── Step 2: Motion ──
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectCountdown, setCollectCountdown] = useState(0);
  const [motionResult, setMotionResult] = useState<{ severity: number; summary: string } | null>(null);
  const isCollectingRef = useRef(false);
  const fingerSeriesRef = useRef<number[][]>([[], [], [], [], []]);
  const accelSeriesRef = useRef<{ x: number[]; y: number[]; z: number[] }>({ x: [], y: [], z: [] });
  const emgSeriesRef = useRef<number[]>([]);
  const tsSeriesRef = useRef<number[]>([]);

  // ── Step 3: Voice ──
  const [isVoiceAnalyzing, setIsVoiceAnalyzing] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceMessage, setVoiceMessage] = useState('Ready to start voice analysis');
  const voiceDoneRef = useRef(false);
  const [voiceDone, setVoiceDone] = useState(false);

  useEffect(() => {
    isCollectingRef.current = isCollecting;
  }, [isCollecting]);

  const onDataReceived = useCallback((data: SensorData) => {
    if (!isCollectingRef.current) return;
    const now = performance.now();
    tsSeriesRef.current.push(now);
    for (let i = 0; i < 5; i++) {
      fingerSeriesRef.current[i].push(Math.max(0, Math.min(1023, data.fingers[i] ?? 0)));
    }
    accelSeriesRef.current.x.push(data.accel?.x ?? 0);
    accelSeriesRef.current.y.push(data.accel?.y ?? 0);
    accelSeriesRef.current.z.push(data.accel?.z ?? 0);
    emgSeriesRef.current.push(data.emg ?? 0);
  }, []);

  const onSpeechResultReceived = useCallback((res: SpeechResult) => {
    voiceDoneRef.current = true;
    setVoiceDone(true);
    setVoiceProgress(100);
    setVoiceMessage(
      res.speechClass === 1
        ? "Parkinson's indicators detected in voice analysis"
        : 'Voice analysis complete — normal range'
    );
    setIsVoiceAnalyzing(false);
  }, []);

  const {
    isConnected, connectionType, connectSerial, connectBluetooth,
    disconnect, sendCommand, isConnecting, error,
  } = useGlobalConnection({ onDataReceived, onSpeechResultReceived });

  // ── Step 1 ──
  const handlePersonalInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(
      'steadigrip_user_profile',
      JSON.stringify({ ...profile, onboardingComplete: false })
    );
    setStep(2);
  };

  // ── Step 2 ──
  const startMotionCollection = async () => {
    fingerSeriesRef.current = [[], [], [], [], []];
    accelSeriesRef.current = { x: [], y: [], z: [] };
    emgSeriesRef.current = [];
    tsSeriesRef.current = [];
    setMotionResult(null);
    setCollectCountdown(10);
    setIsCollecting(true);
    try { await sendCommand('START'); } catch { /* ok */ }

    const interval = setInterval(() => {
      setCollectCountdown((c) => {
        if (c <= 1) { clearInterval(interval); return 0; }
        return c - 1;
      });
    }, 1000);

    setTimeout(async () => {
      try { await sendCommand('STOP'); } catch { /* ok */ }
      setIsCollecting(false);
      computeMotionResult();
    }, 10000);
  };

  const computeMotionResult = () => {
    if (tsSeriesRef.current.length < 2) {
      setMotionResult({ severity: 0, summary: 'Not enough data — please try again.' });
      return;
    }
    const durationSec = Math.max(
      0.001,
      (tsSeriesRef.current.at(-1)! - tsSeriesRef.current[0]!) / 1000
    );
    const graspQualityPerFinger: number[] = [];
    for (let i = 0; i < 5; i++) {
      const s = fingerSeriesRef.current[i] ?? [];
      if (!s.length) { graspQualityPerFinger.push(0); continue; }
      const amp = Math.max(...s) - Math.min(...s);
      graspQualityPerFinger.push(Math.max(0, Math.min(100, (amp / 1023) * 100)));
    }
    const { x: ax, y: ay, z: az } = accelSeriesRef.current;
    const n = Math.min(ax.length, ay.length, az.length);
    const mag = Array.from({ length: n }, (_, i) =>
      Math.sqrt(ax[i] * ax[i] + ay[i] * ay[i] + az[i] * az[i])
    );
    const mean = mag.reduce((a, b) => a + b, 0) / Math.max(1, mag.length);
    const hp = mag.map((v) => v - mean);
    let zc = 0;
    for (let i = 1; i < hp.length; i++) {
      if ((hp[i - 1] <= 0 && hp[i] > 0) || (hp[i - 1] >= 0 && hp[i] < 0)) zc++;
    }
    const tremorHz = Math.max(0, (zc / 2) / Math.max(0.001, durationSec));
    const emg = emgSeriesRef.current;
    const emgRms = Math.sqrt(emg.reduce((a, b) => a + b * b, 0) / Math.max(1, emg.length));
    const tremorScore = tremorHz >= 3 && tremorHz <= 7 ? 70 : tremorHz > 7 ? 40 : 20;
    const graspScore = 100 - Math.max(0, 60 - graspQualityPerFinger[2]);
    const emgScore = Math.min(100, (emgRms / 512) * 100);
    const overallSeverity = Math.max(
      0,
      Math.min(100, 0.5 * tremorScore + 0.3 * (100 - graspScore) + 0.2 * emgScore)
    );
    const { stage, confidencePercent } = classifySeverity(overallSeverity);
    try {
      analysisRecordService.saveRecord({
        analysisCount: Date.now(),
        parkinsonLevel: Math.min(5, Math.max(0, Math.round(overallSeverity / 20))),
        parkinsonDescription: stage,
        confidence: confidencePercent,
        recommendation: `Tremor ≈ ${tremorHz.toFixed(2)} Hz, EMG RMS ≈ ${emgRms.toFixed(1)}`,
        recommendedResistance: overallSeverity >= 70 ? 60 : overallSeverity >= 40 ? 40 : 20,
        sensorData: {
          fingerPositions: graspQualityPerFinger,
          accelerometer: { x: 0, y: 0, z: 0 },
          gyroscope: { x: 0, y: 0, z: 0 },
          emg: emgRms,
        },
        source: (connectionType === 'serial' || connectionType === 'bluetooth') ? 'arduino' : 'web-analysis',
        duration: Math.round(durationSec),
      });
    } catch { /* ok */ }
    setMotionResult({
      severity: Math.round(overallSeverity),
      summary: `Tremor ≈ ${tremorHz.toFixed(2)} Hz · Severity: ${Math.round(overallSeverity)}%`,
    });
  };

  // ── Step 3 ──
  const startVoiceAnalysis = async () => {
    voiceDoneRef.current = false;
    setVoiceDone(false);
    setIsVoiceAnalyzing(true);
    setVoiceProgress(0);
    setVoiceMessage('Starting Arduino voice analysis...');

    if (!isConnected) {
      setVoiceMessage('Please connect a device first.');
      setIsVoiceAnalyzing(false);
      return;
    }
    try { await sendCommand('SPEECH'); } catch { /* ok */ }

    const startTime = performance.now();
    const timer = setInterval(() => {
      if (voiceDoneRef.current) { clearInterval(timer); return; }
      const elapsed = performance.now() - startTime;
      setVoiceProgress(Math.min(95, (elapsed / 5000) * 100));
      if (elapsed < 1500) setVoiceMessage('Initializing PDM microphone...');
      else if (elapsed < 3000) setVoiceMessage('Capturing voice signal...');
      else setVoiceMessage("Calculating Parkinson's indicators...");
      if (elapsed >= 5000) clearInterval(timer);
    }, 100);

    setTimeout(() => {
      if (!voiceDoneRef.current) {
        clearInterval(timer);
        setIsVoiceAnalyzing(false);
        setVoiceMessage('Analysis timed out. You can skip or retry.');
      }
    }, 10000);
  };

  // ── Demo helpers ──
  const loadSamplePatient = (level: SampleLevel) => {
    const sample = SAMPLE_PATIENTS[level];
    const { stage, confidencePercent } = classifySeverity(sample.severity);
    try {
      analysisRecordService.saveRecord({
        analysisCount: Date.now(),
        parkinsonLevel: Math.min(5, Math.max(0, Math.round(sample.severity / 20))),
        parkinsonDescription: `Sample · ${sample.label} — ${stage}`,
        confidence: confidencePercent,
        recommendation: `Demo sample. Tremor ≈ ${sample.tremorHz.toFixed(2)} Hz, EMG RMS ≈ ${sample.emgRms.toFixed(1)}`,
        recommendedResistance: sample.severity >= 70 ? 60 : sample.severity >= 40 ? 40 : 20,
        sensorData: {
          fingerPositions: sample.fingerPositions,
          accelerometer: { x: 0, y: 0, z: 0 },
          gyroscope: { x: 0, y: 0, z: 0 },
          emg: sample.emgRms,
        },
        source: 'manual',
        duration: 10,
      });
    } catch { /* ok */ }
    setMotionResult({
      severity: sample.severity,
      summary: `Sample · ${sample.label} · Tremor ${sample.tremorHz.toFixed(1)} Hz · Severity ${sample.severity}%`,
    });
  };

  const loadSampleVoice = (level: SampleLevel) => {
    const s = SAMPLE_VOICE[level];
    voiceDoneRef.current = true;
    setVoiceDone(true);
    setVoiceProgress(100);
    setIsVoiceAnalyzing(false);
    setVoiceMessage(
      s.speechClass === 1
        ? `Sample · ${level} · Parkinson's indicators detected (${(s.prob * 100).toFixed(0)}% confidence)`
        : `Sample · ${level} · Voice analysis: normal range`
    );
  };

  const completeOnboarding = () => {
    try {
      const existing = localStorage.getItem('steadigrip_user_profile');
      const base = existing ? JSON.parse(existing) : profile;
      localStorage.setItem(
        'steadigrip_user_profile',
        JSON.stringify({ ...base, onboardingComplete: true })
      );
    } catch { /* ok */ }
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar showBack />

      {/* Progress section (moved out of top bar) */}
      <div className="flex-shrink-0 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 px-6 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Step {step} of 3</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {step === 1 && 'Personal info'}
              {step === 2 && 'Motion data'}
              {step === 3 && 'Voice data'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {([1, 2, 3] as Step[]).map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  step >= s ? 'bg-blue-500' : 'bg-gray-200 dark:bg-neutral-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 px-6 py-10 max-w-lg mx-auto w-full">
        {step === 1 && (
          <Step1PersonalInfo
            profile={profile}
            onChange={setProfile}
            onNext={handlePersonalInfoSubmit}
          />
        )}
        {step === 2 && (
          <Step2Motion
            isConnected={isConnected}
            isConnecting={isConnecting}
            isCollecting={isCollecting}
            collectCountdown={collectCountdown}
            motionResult={motionResult}
            connectionError={error}
            onConnectSerial={connectSerial}
            onConnectBluetooth={connectBluetooth}
            onDisconnect={disconnect}
            onStart={startMotionCollection}
            onLoadSample={loadSamplePatient}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3Voice
            isConnected={isConnected}
            isVoiceAnalyzing={isVoiceAnalyzing}
            voiceProgress={voiceProgress}
            voiceMessage={voiceMessage}
            voiceDone={voiceDone}
            onConnectSerial={connectSerial}
            onConnectBluetooth={connectBluetooth}
            onStart={startVoiceAnalysis}
            onLoadSample={loadSampleVoice}
            onComplete={completeOnboarding}
          />
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 1 — Personal Info
// ─────────────────────────────────────────────
function Step1PersonalInfo({
  profile,
  onChange,
  onNext,
}: {
  profile: UserProfile;
  onChange: (p: UserProfile) => void;
  onNext: (e: React.FormEvent) => void;
}) {
  const valid = profile.name.trim() && profile.age.trim() && profile.sex;
  return (
    <form onSubmit={onNext} className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#004E80] mb-4">
          <User size={32} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Tell us about yourself
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          Help us personalise your SteadiGrip experience with a few quick details.
        </p>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        <IconField icon={<User size={18} />} label="Preferred Name" required>
          <input
            type="text"
            required
            placeholder="Enter your peferred name"
            value={profile.name}
            onChange={(e) => onChange({ ...profile, name: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </IconField>

        <IconField icon={<Calendar size={18} />} label="Age" required>
          <input
            type="number"
            required
            min={1}
            max={120}
            placeholder="e.g. 65"
            value={profile.age}
            onChange={(e) => onChange({ ...profile, age: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </IconField>

        <IconField icon={<Users size={18} />} label="Sex" required>
          <select
            required
            value={profile.sex}
            onChange={(e) => onChange({ ...profile, sex: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none cursor-pointer"
          >
            <option value="">Select your sex</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other / Prefer not to say</option>
          </select>
        </IconField>

        <IconField icon={<Users size={18} />} label="Race" required={false}>
          <select
            value={profile.race ?? ''}
            onChange={(e) => onChange({ ...profile, race: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none cursor-pointer"
          >
            <option value="">Select your race (optional)</option>
            <option value="Asian">Asian</option>
            <option value="Black or African American">Black or African American</option>
            <option value="Hispanic or Latino">Hispanic or Latino</option>
            <option value="White or Caucasian">White or Caucasian</option>
            <option value="Native American or Alaska Native">Native American or Alaska Native</option>
            <option value="Native Hawaiian or Pacific Islander">Native Hawaiian or Pacific Islander</option>
            <option value="Middle Eastern or North African">Middle Eastern or North African</option>
            <option value="Mixed or Multiracial">Mixed or Multiracial</option>
            <option value="Other">Other</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </select>
        </IconField>
      </div>

      {/* Privacy notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
        <Shield size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <span className="font-semibold">Your privacy matters.</span> All data stays on your device and is never shared.
        </div>
      </div>

      <button
        type="submit"
        disabled={!valid}
        className="w-full py-3.5 bg-[#004E80] text-white font-semibold rounded-xl hover:bg-[#003a61] hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
      >
        Continue to Motion Data
        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
      </button>
    </form>
  );
}

// Icon-enhanced field component
function IconField({
  icon,
  label,
  required = false,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 dark:bg-neutral-900/50 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-gray-500 dark:text-gray-400">{icon}</div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 2 — Motion Collection
// ─────────────────────────────────────────────
function Step2Motion({
  isConnected,
  isConnecting,
  isCollecting,
  collectCountdown,
  motionResult,
  connectionError,
  onConnectSerial,
  onConnectBluetooth,
  onDisconnect,
  onStart,
  onLoadSample,
  onNext,
}: {
  isConnected: boolean;
  isConnecting: boolean;
  isCollecting: boolean;
  collectCountdown: number;
  motionResult: { severity: number; summary: string } | null;
  connectionError: string | null;
  onConnectSerial: () => void;
  onConnectBluetooth: () => void;
  onDisconnect: () => void;
  onStart: () => void;
  onLoadSample: (level: SampleLevel) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          Motion Data Collection
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Put on the glove, connect your SteadiGrip device, and perform a 10-second grip exercise when prompted.
        </p>
      </div>

      {/* Connection */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-700 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-800 dark:text-gray-200">Device</span>
          <span className={`flex items-center gap-1.5 text-sm font-medium ${isConnected ? 'text-green-600' : 'text-gray-400'}`}>
            <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        {!isConnected ? (
          <div className="flex gap-2">
            <button
              onClick={onConnectSerial}
              disabled={isConnecting}
              className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition"
            >
              Serial
            </button>
            <button
              onClick={onConnectBluetooth}
              disabled={isConnecting}
              className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition"
            >
              Bluetooth
            </button>
          </div>
        ) : (
          <button
            onClick={onDisconnect}
            className="w-full py-2 px-3 border border-red-300 text-red-500 text-sm font-medium rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition"
          >
            Disconnect
          </button>
        )}
        {connectionError && (
          <p className="text-xs text-red-500">{connectionError}</p>
        )}
      </div>

      {/* Collect button */}
      <button
        onClick={onStart}
        disabled={!isConnected || isCollecting}
        className="w-full py-3 bg-[#004E80] text-white font-semibold rounded-xl hover:bg-[#003a61] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {isCollecting ? `Collecting… ${collectCountdown}s remaining` : 'Start 10-Second Collection'}
      </button>

      {/* Result */}
      {motionResult && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-5 border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">Collection complete ✓</p>
          <p className="text-sm text-blue-700 dark:text-blue-300">{motionResult.summary}</p>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!motionResult}
        className="w-full py-3 bg-[#004E80] text-white font-semibold rounded-xl hover:bg-[#003a61] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        Next — Voice Collection
      </button>

      <DemoSampleSection
        title="Demo: Skip with sample patient"
        description="Bypass live collection and load a pre-canned patient profile."
        onLoadSample={onLoadSample}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 3 — Voice Collection
// ─────────────────────────────────────────────
function Step3Voice({
  isConnected,
  isVoiceAnalyzing,
  voiceProgress,
  voiceMessage,
  voiceDone,
  onConnectSerial,
  onConnectBluetooth,
  onStart,
  onLoadSample,
  onComplete,
}: {
  isConnected: boolean;
  isVoiceAnalyzing: boolean;
  voiceProgress: number;
  voiceMessage: string;
  voiceDone: boolean;
  onConnectSerial: () => void;
  onConnectBluetooth: () => void;
  onStart: () => void;
  onLoadSample: (level: SampleLevel) => void;
  onComplete: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          Voice Analysis
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Speak naturally for 5 seconds to let the Arduino microphone analyse your voice patterns. You can skip this step if your device does not have a microphone.
        </p>
      </div>

      {/* Connection hint if not connected */}
      {!isConnected && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-700 p-5 space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">Connect device to enable voice analysis:</p>
          <div className="flex gap-2">
            <button
              onClick={onConnectSerial}
              className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition"
            >
              Serial
            </button>
            <button
              onClick={onConnectBluetooth}
              className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition"
            >
              Bluetooth
            </button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {(isVoiceAnalyzing || voiceProgress > 0) && (
        <div className="space-y-2">
          <div className="w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-200"
              style={{ width: `${voiceProgress}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{voiceMessage}</p>
        </div>
      )}

      {voiceDone && (
        <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-5 border border-green-200 dark:border-green-800">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">Voice analysis complete ✓</p>
          <p className="text-sm text-green-700 dark:text-green-300 mt-1">{voiceMessage}</p>
        </div>
      )}

      <button
        onClick={onStart}
        disabled={!isConnected || isVoiceAnalyzing || voiceDone}
        className="w-full py-3 bg-[#004E80] text-white font-semibold rounded-xl hover:bg-[#003a61] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {isVoiceAnalyzing ? 'Analysing voice…' : voiceDone ? 'Analysis complete' : 'Start 5-Second Voice Analysis'}
      </button>

      <div className="flex gap-3">
        <button
          onClick={onComplete}
          className="flex-1 py-3 border border-gray-300 dark:border-neutral-700 text-gray-600 dark:text-gray-400 font-medium rounded-xl hover:bg-gray-100 dark:hover:bg-neutral-800 transition"
        >
          Skip
        </button>
        <button
          onClick={onComplete}
          disabled={!voiceDone}
          className="flex-1 py-3 bg-[#004E80] text-white font-semibold rounded-xl hover:bg-[#003a61] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Complete Setup →
        </button>
      </div>

      <DemoSampleSection
        title="Demo: Skip with sample voice result"
        description="Bypass live voice capture and apply a pre-canned voice analysis."
        onLoadSample={onLoadSample}
      />
    </div>
  );
}

// ────────────────────────────────────────────
// Demo sample picker — used in steps 2 & 3 to bypass live capture
// ────────────────────────────────────────────
function DemoSampleSection({
  title,
  description,
  onLoadSample,
}: {
  title: string;
  description: string;
  onLoadSample: (level: SampleLevel) => void;
}) {
  return (
    <div className="mt-2 rounded-2xl border border-dashed border-amber-300 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-900/10 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🧪</span>
        <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">{title}</span>
      </div>
      <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mb-3">{description}</p>
      <div className="grid grid-cols-3 gap-2">
        {(['mild', 'moderate', 'severe'] as SampleLevel[]).map((level) => (
          <button
            key={level}
            onClick={() => onLoadSample(level)}
            className="py-2 px-3 rounded-lg text-sm font-medium bg-white dark:bg-neutral-800 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition capitalize"
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
}

