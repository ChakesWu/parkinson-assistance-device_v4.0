'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrainCircuit, Activity, Book, Settings, Brain } from 'lucide-react';
import { getRecommendations, classifySeverity } from '@/lib/ai/recommendations';
import { analysisRecordService } from '@/services/analysisRecordService';
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from "@/components/ui/sidebar";
import { useGlobalConnection } from '@/hooks/useGlobalConnection';
import AppTopBar from '@/components/ui/AppTopBar';
import { SPEECH_ANALYSIS_CONFIG } from "@/lib/speech-analysis-config";


export default function AIAnalysisPage() {
  const [prediction, setPrediction] = useState<number | null>(null);
  const [analysisData, setAnalysisData] = useState({
    analysisCount: 0,
    confidence: 0,
    recommendation: '',
    recommendedResistance: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [sensorData, setSensorData] = useState({
    fingerPositions: [0, 0, 0, 0, 0],
    accelerometer: { x: 0, y: 0, z: 0 },
    gyroscope: { x: 0, y: 0, z: 0 },
    emg: 0,
  });
  const [modelSeverity, setModelSeverity] = useState<number | null>(null); // 0..100 provided by device/CNN/LSTM
  const [groups, setGroups] = useState<ReturnType<typeof getRecommendations>>([]);

  // Connection/collection status
  const [isCollecting, setIsCollecting] = useState(false);
  const isCollectingRef = useRef(false);
  const { isConnected, connectBluetooth, connectSerial, disconnect, sendCommand } = useGlobalConnection({
    onDataReceived: (data) => {
      // Real-time display
      const percentFingers = data.fingers.map(v => Math.round((Math.max(0, Math.min(1023, v)) / 1023) * 100));
      setSensorData({
        fingerPositions: percentFingers,
        accelerometer: data.accel,
        gyroscope: data.gyro,
        emg: data.emg ?? 0,
      });

      // Accumulate sequence only during collection
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

  // 10-second data buffer
  const sessionStartRef = useRef<number | null>(null);
  const fingerSeriesRef = useRef<number[][]>([[], [], [], [], []]);
  const accelSeriesRef = useRef<{ x: number[]; y: number[]; z: number[] }>({ x: [], y: [], z: [] });
  const emgSeriesRef = useRef<number[]>([]);
  const tsSeriesRef = useRef<number[]>([]);

  // Voice recognition status
  const [isVoiceAnalyzing, setIsVoiceAnalyzing] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceMessage, setVoiceMessage] = useState<string>("Ready to start Arduino voice analysis");
  const [speechResult, setSpeechResult] = useState<{
    class: number;
    probability: number;
    jitter: number;
    shimmer: number;
    hnr: number;
    silenceRatio: number;
    voiceActivity: number;
  } | null>(null);

  const startVoiceAnalysis = async () => {
    try {
      setIsVoiceAnalyzing(true);
      setVoiceProgress(0);
      setVoiceMessage("Connecting to Arduino device...");

      if (!isConnected) {
        setVoiceMessage('Please connect device first');
        setIsVoiceAnalyzing(false);
        return;
      }

      setVoiceMessage("Starting Arduino voice analysis...");

      // Send SPEECH command to Arduino
      await sendCommand('SPEECH');

      setVoiceMessage("Arduino is performing 5-second voice capture...");

      // Listen for Arduino voice analysis progress and results
      const startTime = performance.now();
      const speechDuration = 5000; // Arduino set to 5 seconds
      const progressInterval = 100;

      const progressTimer = setInterval(() => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(100, (elapsed / speechDuration) * 100);
        setVoiceProgress(progress);

        if (elapsed < 1000) {
          setVoiceMessage("Initializing Arduino PDM microphone...");
        } else if (elapsed < 2000) {
          setVoiceMessage("Capturing voice signal...");
        } else if (elapsed < 4000) {
          setVoiceMessage("Analyzing voice features...");
        } else if (elapsed < speechDuration) {
          setVoiceMessage("Calculating Parkinson's symptom indicators...");
        } else {
          setVoiceMessage("Waiting for Arduino analysis results...");
        }
      }, progressInterval);

      // Timeout protection
      setTimeout(() => {
        setIsVoiceAnalyzing(false);
        setVoiceMessage('Voice analysis timeout, please retry');
      }, 10000);

    } catch (err) {
      console.error('Voice analysis startup failed:', err);
      setIsVoiceAnalyzing(false);
      setVoiceMessage("❌ Unable to start voice analysis: " + (err as Error).message);
    }
  };

  const cancelVoiceAnalysis = async () => {
    try {
      // Send stop command to Arduino (if supported)
      await sendCommand('STOP');
    } catch (error) {
      console.log('Failed to send stop command:', error);
    }

    setIsVoiceAnalyzing(false);
    setVoiceProgress(0);
    setVoiceMessage("Voice analysis cancelled");
  };


  // Listen for data provided by parent page (optional)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'sensorData') {
        const p = event.data.payload;
        setSensorData(prev => ({
          fingerPositions: p.fingerPositions ?? prev.fingerPositions,
          accelerometer: p.accelerometer ?? prev.accelerometer,
          gyroscope: p.gyroscope ?? prev.gyroscope,
          emg: p.emg ?? prev.emg,
        }));
      }
      if (event.data.type === 'modelPrediction') {
        const sv = Math.max(0, Math.min(100, Number(event.data.payload?.severityPercent)));
        if (!Number.isNaN(sv)) setModelSeverity(sv);
        if (event.data.payload?.confidence) {
          setAnalysisData(prev => ({ ...prev, confidence: event.data.payload.confidence }));
        }
      }
    };

    window.addEventListener('message', handleMessage);
    window.parent.postMessage({ type: 'requestSensorData' }, '*');
    window.parent.postMessage({ type: 'requestModelPrediction' }, '*');

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Sync collection flag
  useEffect(() => { isCollectingRef.current = isCollecting; }, [isCollecting]);

  // Test record saving function
  const testRecordSaving = () => {
    try {
      const testRecord = analysisRecordService.saveRecord({
        analysisCount: 999,
        parkinsonLevel: 2,
        parkinsonDescription: 'Test Record',
        confidence: 85.5,
        recommendation: 'This is a test record',
        recommendedResistance: 45,
        sensorData: {
          fingerPositions: [45, 52, 38, 41, 49],
          accelerometer: { x: 0.12, y: -0.34, z: 0.98 },
          gyroscope: { x: 1.2, y: -0.8, z: 0.3 },
          emg: 234,
        },
        source: 'web-analysis',
        duration: 10,
      });
      console.log('Test record saved:', testRecord);
      alert('Test record saved, please check Records page');
    } catch (error) {
      console.error('Test record save failed:', error);
      alert('Test record save failed');
    }
  };

  // Use global connection sendCommand (already provided by useGlobalConnection)

  // Parse DATA line (supports 16 or 10 columns)
  const parseDataLine = (trimmed: string) => {
    if (!trimmed.startsWith('DATA')) return null;
    const payload = trimmed.startsWith('DATA,') ? trimmed.substring(5) : trimmed.substring(4).replace(/^,/, '');
    const parts = payload.split(',');
    const nums = parts.map(v => parseFloat(v));
    if (nums.length >= 15) {
      const fingers = nums.slice(0, 5).map(v => Math.max(0, Math.min(1023, v)));
      const emg = nums[5] ?? 0;
      const accel = { x: nums[6], y: nums[7], z: nums[8] };
      // Optional: gyro/mag if present
      const gyro = {
        x: nums[9] ?? 0,
        y: nums[10] ?? 0,
        z: nums[11] ?? 0,
      };
      return { fingers, emg, accel, gyro };
    } else if (nums.length >= 9) {
      const fingers = nums.slice(0, 5).map(v => Math.max(0, Math.min(1023, v)));
      const emg = nums[5] ?? 0;
      const accel = { x: nums[6], y: nums[7], z: nums[8] };
      const gyro = { x: 0, y: 0, z: 0 };
      return { fingers, emg, accel, gyro };
    }
    return null;
  };

  // Start 10-second collection and analysis
  const startTenSecondAnalysis = async () => {
    setIsLoading(true);
    setPrediction(null);
    setGroups([]);

    // Clear sequences
    fingerSeriesRef.current = [[], [], [], [], []];
    accelSeriesRef.current = { x: [], y: [], z: [] };
    emgSeriesRef.current = [];
    tsSeriesRef.current = [];

    try {
      // If not connected, prompt to select connection method
      if (!isConnected) {
        alert('Please connect device first (Serial or Bluetooth)');
        return;
      }
      // Start device collection (same for both connection methods)
      await sendCommand('START');
      setIsCollecting(true);
      sessionStartRef.current = performance.now();
      // Automatically end collection after 10 seconds
      setTimeout(async () => {
        try { await sendCommand('STOP'); } catch {}
        setIsCollecting(false);
      }, 10000);
    } catch (e) {
      console.error('Collection failed', e);
    } finally {
      // Result calculation performed below
    }

    // Calculate results
    try {
      const res = computeFinalAssessment();
      const severity = res.overallSeverity;
      const { stage, confidencePercent } = classifySeverity(severity);

      // Recommended resistance
      let recommendedResistance = 20;
      if (severity >= 70) recommendedResistance = 60;
      else if (severity >= 40) recommendedResistance = 40;

      setPrediction(severity);
      const newAnalysisData = {
        analysisCount: analysisData.analysisCount + 1,
        confidence: analysisData.confidence || confidencePercent,
        recommendation: res.summary,
        recommendedResistance,
      };
      setAnalysisData(newAnalysisData);
      setGroups(getRecommendations(severity));

      // Save analysis record
      try {
        // Calculate Parkinson's level (0-100 severity -> 0-5 level)
        const parkinsonLevel = Math.min(5, Math.max(0, Math.round(severity / 20)));

        console.log('Preparing to save analysis record:', {
          severity,
          parkinsonLevel,
          stage,
          confidencePercent,
          analysisCount: newAnalysisData.analysisCount
        });

        const lastTs = tsSeriesRef.current.length > 0 ? tsSeriesRef.current[tsSeriesRef.current.length - 1] : (sessionStartRef.current ?? 0);
        const firstTs = sessionStartRef.current ?? (tsSeriesRef.current.length > 0 ? tsSeriesRef.current[0] : 0);
        const durationSec = Math.max(0.001, (lastTs - firstTs) / 1000);

        const record = analysisRecordService.saveRecord({
          analysisCount: newAnalysisData.analysisCount,
          parkinsonLevel,
          parkinsonDescription: stage,
          confidence: confidencePercent,
          recommendation: res.summary,
          recommendedResistance,
          sensorData: {
            fingerPositions: sensorData.fingerPositions,
            accelerometer: sensorData.accelerometer,
            gyroscope: sensorData.gyroscope,
            emg: sensorData.emg,
          },
          analysisDetails: {
            tremorFrequency: res.tremorHz,
            graspQuality: res.graspQualityPerFinger?.[2], // Middle finger grasp quality
            emgRms: res.emgRms,
            overallSeverity: severity,
            fingerSummary: res.fingerSummary,
            tremorSummary: res.tremorSummary,
            emgSummary: res.emgSummary,
          },
          source: 'web-analysis',
          duration: Math.round(durationSec),
        });
        console.log('Analysis record successfully saved:', record);
      } catch (error) {
        console.error('Failed to save analysis record:', error);
      }
    } catch (e) {
      console.error('Analysis calculation failed', e);
      setPrediction(null);
    }

    setIsLoading(false);
  };

  // Sidebar link configuration
  const sidebarLinks = [
    {
      label: "AI Symptom Analysis",
      href: "/ai-analysis",
      icon: <Brain className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" />
    },
    {
      label: "Voice Detection",
      href: "/voice-analysis",
      icon: <Activity className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" />
    },
    {
      label: "Multimodal Analysis",
      href: "/multimodal-analysis",
      icon: <Settings className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" />
    }
  ];

  // Logo component
  const Logo = () => (
    <div className="font-normal flex space-x-2 items-center text-sm text-black py-1 relative z-20">
      <div className="h-6 w-6 bg-blue-600 dark:bg-blue-500 rounded-lg flex-shrink-0 flex items-center justify-center">
        <Brain className="h-4 w-4 text-white" />
      </div>
      <span className="font-medium text-black dark:text-white whitespace-nowrap overflow-hidden text-ellipsis">
        Parkinson's Assistance Device
      </span>
    </div>
  );

  const LogoIcon = () => (
    <div className="font-normal flex space-x-2 items-center text-sm text-black py-1 relative z-20">
      <div className="h-6 w-6 bg-blue-600 dark:bg-blue-500 rounded-lg flex-shrink-0 flex items-center justify-center">
        <Brain className="h-4 w-4 text-white" />
      </div>
    </div>
  );

  const SidebarHeader: React.FC = () => {
    const { open } = useSidebar();
    return open ? <Logo /> : <LogoIcon />;
  };

  // Calculate: finger grasp, tremor frequency, EMG level and overall severity
  const computeFinalAssessment = () => {

    const durationSec = Math.max(0.001, (tsSeriesRef.current.at(-1)! - (sessionStartRef.current ?? tsSeriesRef.current[0]!)) / 1000);

    // Finger grasp assessment: check amplitude and cycle count for each finger (approximated by threshold zero-crossing count)
    const graspCyclesPerFinger: number[] = [];
    const graspQualityPerFinger: number[] = [];
    for (let i = 0; i < 5; i++) {
      const s = fingerSeriesRef.current[i] ?? [];
      if (s.length === 0) { graspCyclesPerFinger.push(0); graspQualityPerFinger.push(0); continue; }
      const maxV = Math.max(...s);
      const minV = Math.min(...s);
      const amp = maxV - minV; // 0..1023
      const thr = minV + amp * 0.6; // High threshold
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

    // Tremor frequency: zero-crossing estimation using acceleration vector magnitude after mean removal
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

    // Level determination (simplified rules, can be provided by CNN/LSTM in practice)
    // tremor: 4-6Hz common; if >=3Hz with obvious amplitude, increase weight
    let tremorScore = 0;
    if (tremorHz >= 3 && tremorHz <= 7) tremorScore = 70; else if (tremorHz > 7) tremorScore = 40; else tremorScore = 20;
    // grasp: take median finger quality and cycle count
    const midIdx = 2;
    const graspScore = 100 - Math.max(0, 60 - graspQualityPerFinger[midIdx]) - Math.max(0, 3 - graspCyclesPerFinger[midIdx]) * 10;
    // emg: relative amplitude (for demonstration only, practical application should calibrate baseline)
    const emgScore = Math.min(100, (emgRms / 512) * 100);

    const overallSeverity = Math.max(0, Math.min(100, 0.5 * tremorScore + 0.3 * (100 - graspScore) + 0.2 * emgScore));

    // Summary text
    const fingerSummary = `Grasp cycles (middle finger) ≈${graspCyclesPerFinger[midIdx]} times, amplitude ${graspQualityPerFinger[midIdx].toFixed(1)}%`;
    const tremorSummary = `Estimated tremor frequency ≈ ${tremorHz.toFixed(2)} Hz`;
    const emgSummary = `EMG RMS ≈ ${emgRms.toFixed(1)}`;

    const summary = `${fingerSummary}；${tremorSummary}；${emgSummary}`;

    return {
      overallSeverity,
      fingerSummary,
      tremorSummary,
      emgSummary,
      summary,
      tremorHz,
      graspQualityPerFinger,
      emgRms
    };
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
        <AppTopBar showBack />
        <main className="flex-1 container mx-auto py-12 px-4">
          <div className="flex gap-4 items-stretch max-[760px]:flex-col">
            <Sidebar>
              <SidebarBody>
                <div className="flex flex-col h-full">
                  <SidebarHeader />
                  <div className="mt-4 space-y-1">
                    {sidebarLinks.map((link, index) => (
                      <SidebarLink key={index} link={link} />
                    ))}
                  </div>
                </div>
              </SidebarBody>
            </Sidebar>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center">
                  <BrainCircuit className="h-8 w-8 mr-3 text-blue-600" />
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">AI Symptom Analysis</h1>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Intelligent Parkinson's Symptom Assessment System
                </div>
              </div>
        {/* End top three-column grid container */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Device connection status card */}
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Device Connection</h2>
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-neutral-700 rounded-lg">
                <span className="text-gray-700 dark:text-gray-300">
                  {isConnected ? 'Arduino Connected' : 'Arduino Not Connected'}
                </span>
                <span className={`text-sm font-medium ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                  {isConnected ? 'Online' : 'Offline'}
                </span>
              </div>

              <div className="flex gap-2">
                {!isConnected ? (
                  <>
                    <Button onClick={connectSerial} className="flex-1 bg-blue-600 hover:bg-blue-700">Serial Connect</Button>
                    <Button onClick={connectBluetooth} className="flex-1 bg-blue-600 hover:bg-blue-700">Bluetooth Connect</Button>
                  </>
                ) : (
                  <Button onClick={disconnect} variant="outline" className="flex-1 border-red-500 text-red-500 hover:bg-red-500 hover:text-white">Disconnect</Button>
                )}
              </div>
            </div>
          </div>

          {/* Sensor data card */}
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Real-time Sensor Data</h2>
            <div className="space-y-4">

                <div>
                  <h3 className="font-medium mb-3 text-gray-700 dark:text-gray-300">Finger Bend</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {sensorData.fingerPositions.map((value, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-neutral-700 rounded">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Finger {index + 1}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{value}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>


                  <h3 className="font-medium mb-3 text-gray-700 dark:text-gray-300">Accelerometer (g)</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 bg-gray-50 dark:bg-neutral-700 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400">X</div>
                      <div className="font-medium text-gray-900 dark:text-white">{sensorData.accelerometer.x.toFixed(2)}</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 dark:bg-neutral-700 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Y</div>
                      <div className="font-medium text-gray-900 dark:text-white">{sensorData.accelerometer.y.toFixed(2)}</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 dark:bg-neutral-700 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Z</div>
                      <div className="font-medium text-gray-900 dark:text-white">{sensorData.accelerometer.z.toFixed(2)}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-3 text-gray-700 dark:text-gray-300">Gyroscope (deg/s)</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 bg-gray-50 dark:bg-neutral-700 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400">X</div>
                      <div className="font-medium text-gray-900 dark:text-white">{sensorData.gyroscope.x.toFixed(2)}</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 dark:bg-neutral-700 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Y</div>
                      <div className="font-medium text-gray-900 dark:text-white">{sensorData.gyroscope.y.toFixed(2)}</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 dark:bg-neutral-700 rounded">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Z</div>
                      <div className="font-medium text-gray-900 dark:text-white">{sensorData.gyroscope.z.toFixed(2)}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-3 text-gray-700 dark:text-gray-300">EMG Signal</h3>
                  <div className="p-3 bg-gray-50 dark:bg-neutral-700 rounded text-center">
                    <span className="text-lg font-bold text-gray-900 dark:text-white">
                      {sensorData.emg?.toFixed ? sensorData.emg.toFixed(0) : sensorData.emg}
                    </span>
                  </div>
                </div>

                {isCollecting && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-blue-700 dark:text-blue-300">Collecting data (10 seconds)</span>
                    </div>
                  </div>
                )}
              </div>
          </div>

          {/* Analysis control card */}
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">AI Analysis Control</h2>

            <div className="space-y-4">
              <Button
                onClick={startTenSecondAnalysis}
                disabled={isLoading || !isConnected}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white py-3 px-6 rounded-lg transition-colors"
              >
                {isLoading ? 'Analyzing...' :
                 !isConnected ? 'Please connect device first' :
                 'Start Symptom Analysis (10s collection)'}
              </Button>

              <Button
                onClick={testRecordSaving}
                variant="outline"
                className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-neutral-600 dark:text-gray-300 dark:hover:bg-neutral-700"
              >
                Test Record Saving Function
              </Button>

              {isLoading && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span className="text-blue-700 dark:text-blue-300">Performing AI analysis...</span>
                  </div>
                </div>
              )}
          </div>
        </div>

        </div>

        {/* Voice recognition for Parkinson's feature migrated to /voice-analysis page */}

        {/* Analysis results area */}
        {prediction !== null && (
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">AI Analysis Results</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic information */}
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-neutral-700 rounded-lg p-4">
                  <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Basic Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Analysis Number</span>
                      <span className="font-semibold text-gray-900 dark:text-white">#{analysisData.analysisCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Confidence</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{analysisData.confidence.toFixed(1)}%</span>
                    </div>
                    {modelSeverity !== null && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Model Severity</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{modelSeverity}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Symptom severity */}
              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-3">Symptom Severity</h3>
                  <div className="text-center mb-4">
                    <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">{prediction}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-neutral-600 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed analysis results */}
            <div className="mt-6 space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <h3 className="font-medium text-green-800 dark:text-green-200 mb-2">AI Analysis Recommendations</h3>
                <p className="text-green-700 dark:text-green-300">{analysisData.recommendation}</p>
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                <h3 className="font-medium text-orange-800 dark:text-orange-200 mb-2">Training Parameter Recommendations</h3>
                <p className="text-orange-700 dark:text-orange-300">
                  Recommended resistance setting: <span className="font-semibold">{analysisData.recommendedResistance}°</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Personalized training recommendations */}
        {prediction !== null && groups.length > 0 && (
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Personalized Training Recommendations</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {groups.map((g, idx) => (
                <div key={idx} className="bg-gray-50 dark:bg-neutral-700 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">{g.category}</h3>
                  <ul className="space-y-2">
                    {g.items.map((it, j) => (
                      <li key={j} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                        <span className="text-sm">{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick access links */}
        <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Quick Access</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a
              href="/records"
              className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              <Book className="h-5 w-5 text-blue-600" />
              <div>
                <div className="font-medium text-blue-800 dark:text-blue-200">View Records</div>
                <div className="text-sm text-blue-600 dark:text-blue-400">Historical analysis records</div>
              </div>
            </a>

            <a
              href="/device"
              className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              <Activity className="h-5 w-5 text-green-600" />
              <div>
                <div className="font-medium text-green-800 dark:text-green-200">Device Monitoring</div>
                <div className="text-sm text-green-600 dark:text-green-400">Real-time data monitoring</div>
              </div>
            </a>

            <a
              href="/settings"
              className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <Settings className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              <div>
                <div className="font-medium text-gray-800 dark:text-gray-200">System Settings</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Parameter configuration</div>
              </div>
            </a>
            </div>
          </div>
        </div>
        </div>
      </main>
      </div>
    </>
  );
}