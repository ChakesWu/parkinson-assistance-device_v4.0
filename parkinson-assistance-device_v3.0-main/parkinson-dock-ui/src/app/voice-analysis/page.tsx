'use client';
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sidebar, SidebarBody, SidebarLink } from '@/components/ui/sidebar';
import GlobalConnector from '@/components/device/GlobalConnector';
import { useGlobalConnection } from '@/hooks/useGlobalConnection';
import { Activity, Brain, Home, Settings, Book } from 'lucide-react';

export default function VoiceAnalysisPage() {
  const [isVoiceAnalyzing, setIsVoiceAnalyzing] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceMessage, setVoiceMessage] = useState<string>('Ready to start Arduino voice analysis');
  const [speechResult, setSpeechResult] = useState<{
    class: number; probability: number; jitter: number; shimmer: number; hnr: number; silenceRatio: number; voiceActivity: number;
  } | null>(null);

  const { isConnected, connectBluetooth, connectSerial, disconnect, sendCommand } = useGlobalConnection({
    onSpeechResultReceived: (res) => {
      setSpeechResult({
        class: res.speechClass,
        probability: res.probability,
        jitter: res.jitter,
        shimmer: res.shimmer,
        hnr: res.hnr,
        silenceRatio: res.silenceRatio,
        voiceActivity: res.voiceActivity,
      });
      setVoiceProgress(100);
      setVoiceMessage('✅ Voice analysis complete');
      setTimeout(() => setIsVoiceAnalyzing(false), 1500);
    },
  });

  const sidebarLinks = [
    { label: 'AI Symptom Analysis', href: '/ai-analysis', icon: <Brain className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" /> },
    { label: 'Voice Detection', href: '/voice-analysis', icon: <Activity className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" /> },
    { label: 'Multimodal Analysis', href: '/multimodal-analysis', icon: <Settings className="text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0" /> },
  ];

  const startVoiceAnalysis = async () => {
    try {
      setIsVoiceAnalyzing(true);
      setVoiceProgress(0);
      setVoiceMessage('Connecting to Arduino device...');
      if (!isConnected) {
        // Prompt user to select a connection method
        setVoiceMessage('Please select a connection method: Serial or Bluetooth');
        return;
      }
      setVoiceMessage('Starting Arduino voice analysis...');
      await sendCommand('SPEECH');
      setVoiceMessage('Arduino is collecting voice for 5 seconds...');

      const startTime = performance.now();
      const speechDuration = 5000;
      const progressInterval = 100;
      const progressTimer = setInterval(() => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(100, (elapsed / speechDuration) * 100);
        setVoiceProgress(progress);
        if (elapsed < 1000) setVoiceMessage('Arduino PDM microphone initializing...');
        else if (elapsed < 2000) setVoiceMessage('Collecting voice signal...');
        else if (elapsed < 4000) setVoiceMessage('Analyzing voice features...');
        else if (elapsed < speechDuration) setVoiceMessage("Calculating Parkinson's symptom indicators...");
        else setVoiceMessage('Waiting for Arduino analysis results...');
      }, progressInterval);

      // Timeout protection: completion triggered by BLE/Serial callback; treat as timeout after 10s with no result
      setTimeout(() => {
        if (isVoiceAnalyzing) {
          setIsVoiceAnalyzing(false);
          setVoiceMessage('Voice analysis timeout, please retry');
        }
      }, 10000);
    } catch (err) {
      setIsVoiceAnalyzing(false);
      setVoiceMessage('❌ Unable to start voice analysis: ' + (err as Error).message);
    }
  };

  const cancelVoiceAnalysis = async () => {
    try { if (writerRef.current) await sendCommand('STOP'); } catch {}
    setIsVoiceAnalyzing(false);
    setVoiceProgress(0);
    setVoiceMessage('Voice analysis cancelled');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-900">
      <main className="container mx-auto py-12 px-4">
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
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Voice Detection for Parkinson's</h2>
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-300">Uses the Arduino built-in PDM microphone for a 5-second voice recording to analyze Parkinson's symptom features (Jitter, Shimmer, HNR, etc.).</p>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">⚠️ Ensure Arduino is connected and the environment is quiet</div>
                <div className="w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${voiceProgress}%` }} />
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">{voiceMessage}</div>
                <div className="flex gap-2">
                  {!isVoiceAnalyzing ? (
                    <Button onClick={startVoiceAnalysis} disabled={!isConnected} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                      {!isConnected ? 'Please connect Arduino first' : 'Start Arduino Voice Analysis'}
                    </Button>
                  ) : (
                    <Button onClick={cancelVoiceAnalysis} variant="outline" className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white">Cancel Analysis</Button>
                  )}
                  {!isConnected && (
                    <>
                      <Button onClick={connectSerial} className="border-blue-500 text-white bg-blue-600 hover:bg-blue-700">Serial Connection</Button>
                      <Button onClick={connectBluetooth} className="border-blue-500 text-white bg-blue-600 hover:bg-blue-700">Bluetooth Connection</Button>
                    </>
                  )}
                  {isConnected && (
                    <Button onClick={disconnect} variant="outline" className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white">Disconnect</Button>
                  )}
                </div>

                {speechResult && (
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-neutral-700 rounded-lg">
                    <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-3">Arduino Voice Analysis Results</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Classification: </span>
                        <span className={`font-medium ${speechResult.class === 1 ? 'text-red-600' : 'text-green-600'}`}>
                          {speechResult.class === 1 ? "Parkinson's symptoms detected" : 'Normal voice'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Probability: </span>
                        <span className="font-medium text-gray-900 dark:text-white">{(speechResult.probability * 100).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Jitter: </span>
                        <span className="font-medium text-gray-900 dark:text-white">{speechResult.jitter.toFixed(4)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Shimmer: </span>
                        <span className="font-medium text-gray-900 dark:text-white">{speechResult.shimmer.toFixed(4)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">HNR: </span>
                        <span className="font-medium text-gray-900 dark:text-white">{speechResult.hnr.toFixed(1)} dB</span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Voice Activity: </span>
                        <span className="font-medium text-gray-900 dark:text-white">{(speechResult.voiceActivity * 100).toFixed(1)}%</span>
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

