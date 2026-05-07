'use client';
import React, { useRef, useState, useEffect } from 'react';
import { Sidebar, SidebarBody, SidebarLink } from '@/components/ui/sidebar';
import { Activity, Brain, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGlobalConnection } from '@/hooks/useGlobalConnection';
import { getRecommendations, classifySeverity } from '@/lib/ai/recommendations';
import { analysisRecordService } from '@/services/analysisRecordService';
import AppTopBar from '@/components/ui/AppTopBar';

type SensorSnapshot = {
  fingerPositions: number[];
  accelerometer: { x: number; y: number; z: number };
  gyroscope: { x: number; y: number; z: number };
  emg: number;
};

export default function MultimodalAnalysisPage() {
  const sidebarLinks = [
    { label: 'AI Symptom Analysis', href: '/ai-analysis', icon: <Brain className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" /> },
    { label: 'Voice Detection', href: '/voice-analysis', icon: <Activity className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" /> },
    { label: 'Multimodal Analysis', href: '/multimodal-analysis', icon: <Settings className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" /> },
  ];

  // Live data display
  const [sensorData, setSensorData] = useState<SensorSnapshot>({
    fingerPositions: [0, 0, 0, 0, 0],
    accelerometer: { x: 0, y: 0, z: 0 },
    gyroscope: { x: 0, y: 0, z: 0 },
    emg: 0,
  });

  // Collection queue
  const fingerSeriesRef = useRef<number[][]>([[], [], [], [], []]);
  const accelSeriesRef = useRef<{ x: number[]; y: number[]; z: number[] }>({ x: [], y: [], z: [] });
  const emgSeriesRef = useRef<number[]>([]);
  const tsSeriesRef = useRef<number[]>([]);

  // State
  const [isCollecting, setIsCollecting] = useState(false);
  const isCollectingRef = useRef(false);
  useEffect(() => { isCollectingRef.current = isCollecting; }, [isCollecting]);

  const [severity, setSeverity] = useState<number | null>(null);
  const [summary, setSummary] = useState<string>('');
  const [groups, setGroups] = useState<ReturnType<typeof getRecommendations>>([]);

  const { isConnected, connectionType, connectSerial, connectBluetooth, disconnect, sendCommand } = useGlobalConnection({
    onDataReceived: (data) => {
      const percentFingers = data.fingers.map(v => Math.round((Math.max(0, Math.min(1023, v)) / 1023) * 100));
      setSensorData({
        fingerPositions: percentFingers,
        accelerometer: data.accel,
        gyroscope: data.gyro,
        emg: data.emg ?? 0,
      });

      if (isCollectingRef.current) {
        const now = performance.now();
        tsSeriesRef.current.push(now);
        for (let i = 0; i < 5; i++) {
          fingerSeriesRef.current[i].push(Math.max(0, Math.min(1023, data.fingers[i] ?? 0)));
        }
        accelSeriesRef.current.x.push(data.accel.x ?? 0);
        accelSeriesRef.current.y.push(data.accel.y ?? 0);
        accelSeriesRef.current.z.push(data.accel.z ?? 0);
        emgSeriesRef.current.push(data.emg ?? 0);
      }
    },
  });

  const startMultimodalAnalysis = async () => {
    if (!isConnected) {
      alert('Please connect a device first (Serial or Bluetooth)');
      return;
    }

    // Clear queue
    fingerSeriesRef.current = [[], [], [], [], []];
    accelSeriesRef.current = { x: [], y: [], z: [] };
    emgSeriesRef.current = [];
    tsSeriesRef.current = [];

    setSeverity(null);
    setSummary('');
    setGroups([]);

    // Start collecting for 10 seconds
    setIsCollecting(true);
    try {
      await sendCommand('START');
    } catch {}

    setTimeout(async () => {
      try { await sendCommand('STOP'); } catch {}
      setIsCollecting(false);
      computeAndRender();
    }, 10000);
  };

  const computeAndRender = () => {
    if (tsSeriesRef.current.length < 2) return;

    const durationSec = Math.max(0.001, (tsSeriesRef.current.at(-1)! - tsSeriesRef.current[0]!) / 1000);

    // Finger grasp assessment
    const graspCyclesPerFinger: number[] = [];
    const graspQualityPerFinger: number[] = [];
    for (let i = 0; i < 5; i++) {
      const s = fingerSeriesRef.current[i] ?? [];
      if (s.length === 0) { graspCyclesPerFinger.push(0); graspQualityPerFinger.push(0); continue; }
      const maxV = Math.max(...s);
      const minV = Math.min(...s);
      const amp = maxV - minV; // 0..1023
      const thr = minV + amp * 0.6;
      let cycles = 0;
      let prevAbove = s[0] > thr;
      for (let k = 1; k < s.length; k++) {
        const above = s[k] > thr;
        if (above && !prevAbove) cycles++;
        prevAbove = above;
      }
      graspCyclesPerFinger.push(cycles);
      graspQualityPerFinger.push(Math.max(0, Math.min(100, (amp / 1023) * 100)));
    }

    // Tremor frequency (accelerometer magnitude zero-crossing)
    const ax = accelSeriesRef.current.x, ay = accelSeriesRef.current.y, az = accelSeriesRef.current.z;
    const n = Math.min(ax.length, ay.length, az.length);
    const mag: number[] = [];
    for (let i = 0; i < n; i++) mag.push(Math.sqrt(ax[i] * ax[i] + ay[i] * ay[i] + az[i] * az[i]));
    const mean = mag.reduce((a, b) => a + b, 0) / Math.max(1, mag.length);
    const hp = mag.map(v => v - mean);
    let zc = 0;
    for (let i = 1; i < hp.length; i++) {
      if ((hp[i - 1] <= 0 && hp[i] > 0) || (hp[i - 1] >= 0 && hp[i] < 0)) zc++;
    }
    const tremorHz = Math.max(0, (zc / 2) / Math.max(0.001, durationSec));

    // EMG: RMS
    const emg = emgSeriesRef.current;
    const emgRms = Math.sqrt(emg.reduce((a, b) => a + b * b, 0) / Math.max(1, emg.length));

    // Combined metrics
    let tremorScore = 0;
    if (tremorHz >= 3 && tremorHz <= 7) tremorScore = 70; else if (tremorHz > 7) tremorScore = 40; else tremorScore = 20;
    const midIdx = 2;
    const graspScore = 100 - Math.max(0, 60 - graspQualityPerFinger[midIdx]) - Math.max(0, 3 - graspCyclesPerFinger[midIdx]) * 10;
    const emgScore = Math.min(100, (emgRms / 512) * 100);
    const overallSeverity = Math.max(0, Math.min(100, 0.5 * tremorScore + 0.3 * (100 - graspScore) + 0.2 * emgScore));

    const fingerSummary = `Grasp cycles (middle finger) ≈ ${graspCyclesPerFinger[midIdx]}, amplitude ${graspQualityPerFinger[midIdx].toFixed(1)}%`;
    const tremorSummary = `Estimated tremor frequency ≈ ${tremorHz.toFixed(2)} Hz`;
    const emgSummary = `EMG RMS ≈ ${emgRms.toFixed(1)}`;
    const mergedSummary = `${fingerSummary}; ${tremorSummary}; ${emgSummary}`;

    setSeverity(overallSeverity);
    setSummary(mergedSummary);
    setGroups(getRecommendations(overallSeverity));

    // Save result
    try {
      const { stage, confidencePercent } = classifySeverity(overallSeverity);
      analysisRecordService.saveRecord({
        analysisCount: Date.now(),
        parkinsonLevel: Math.min(5, Math.max(0, Math.round(overallSeverity / 20))),
        parkinsonDescription: stage,
        confidence: confidencePercent,
        recommendation: mergedSummary,
        recommendedResistance: overallSeverity >= 70 ? 60 : overallSeverity >= 40 ? 40 : 20,
        sensorData: {
          fingerPositions: sensorData.fingerPositions,
          accelerometer: sensorData.accelerometer,
          gyroscope: sensorData.gyroscope,
          emg: sensorData.emg,
        },
        analysisDetails: {
          tremorFrequency: tremorHz,
          emgRms,
          overallSeverity,
          fingerSummary,
          tremorSummary,
          emgSummary,
        },
        source: connectionType || 'unknown',
        duration: Math.round(durationSec),
      });
    } catch (e) {
      console.error('Failed to save multimodal analysis record', e);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar showBack />
      <main className="flex-1 container mx-auto py-12 px-4">
        <div className="flex gap-4 items-stretch min-h-[70vh]">
          <Sidebar>
            <SidebarBody>
              <div className="flex flex-col h-full">
                <div className="font-normal flex space-x-2 items-center text-sm text-black py-1 relative z-20">
                  <div className="h-6 w-6 bg-blue-600 dark:bg-blue-500 rounded-lg flex-shrink-0 flex items-center justify-center"></div>
                  <span className="font-medium text-black dark:text-white whitespace-nowrap overflow-hidden text-ellipsis">Parkinson's Assist Device</span>
                </div>
                <div className="mt-4 space-y-1">
                  {sidebarLinks.map((link, index) => (
                    <SidebarLink key={index} link={link} />
                  ))}
                </div>
              </div>
            </SidebarBody>
          </Sidebar>

          <div className="flex-1">
            <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Multimodal Analysis</h2>
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              </div>

              <div className="space-y-4">
                <div className="flex gap-2">
                  {!isConnected ? (
                    <>
                      <Button onClick={connectSerial} className="bg-blue-600 hover:bg-blue-700">Serial Connection</Button>
                      <Button onClick={connectBluetooth} className="bg-blue-600 hover:bg-blue-700">Bluetooth Connection</Button>
                    </>
                  ) : (
                    <Button onClick={disconnect} variant="outline" className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white">Disconnect</Button>
                  )}
                  <Button onClick={startMultimodalAnalysis} disabled={!isConnected || isCollecting} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400">
                    {isCollecting ? 'Collecting (10s)...' : 'Start Multimodal Analysis (10s collection)'}
                  </Button>
                </div>

                {/* Live data */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-100 dark:bg-neutral-700 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">Finger Bend</h4>
                    <div className="space-y-1">
                      {sensorData.fingerPositions.map((value, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span>Finger {index + 1}</span>
                          <span className="font-medium">{value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-100 dark:bg-neutral-700 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">IMU / EMG</h4>
                    <div className="space-y-1 text-sm">
                      <div>Accel: X: {sensorData.accelerometer.x.toFixed(2)} Y: {sensorData.accelerometer.y.toFixed(2)} Z: {sensorData.accelerometer.z.toFixed(2)}</div>
                      <div>Gyro: X: {sensorData.gyroscope.x.toFixed(2)} Y: {sensorData.gyroscope.y.toFixed(2)} Z: {sensorData.gyroscope.z.toFixed(2)}</div>
                      <div>EMG: {sensorData.emg.toFixed ? sensorData.emg.toFixed(0) : sensorData.emg}</div>
                    </div>
                  </div>
                </div>

                {/* Analysis results */}
                {severity !== null && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <div className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">Analysis Results</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div className="p-3 bg-white/60 dark:bg-neutral-800/50 rounded">
                        <div className="text-gray-600 dark:text-gray-400">Overall Severity</div>
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{severity.toFixed(1)}%</div>
                      </div>
                      <div className="p-3 bg-white/60 dark:bg-neutral-800/50 rounded">
                        <div className="text-gray-600 dark:text-gray-400">Summary</div>
                        <div className="text-gray-800 dark:text-gray-200">{summary}</div>
                      </div>
                      <div className="p-3 bg-white/60 dark:bg-neutral-800/50 rounded">
                        <div className="text-gray-600 dark:text-gray-400 mb-1">Training Recommendations</div>
                        <ul className="list-disc pl-5 space-y-1 text-gray-800 dark:text-gray-200">
                          {groups.flatMap(g => g.items).slice(0, 5).map((it, idx) => (
                            <li key={idx} className="text-sm">{it}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

