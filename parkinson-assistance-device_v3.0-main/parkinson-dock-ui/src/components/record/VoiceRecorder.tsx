'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGlobalConnection } from '@/hooks/useGlobalConnection';

export default function VoiceRecorder() {
  const [isVoiceAnalyzing, setIsVoiceAnalyzing] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceMessage, setVoiceMessage] = useState<string>('Ready to start Arduino voice analysis');
  const [speechResult, setSpeechResult] = useState<{
    class: number;
    probability: number;
    jitter: number;
    shimmer: number;
    hnr: number;
    silenceRatio: number;
    voiceActivity: number;
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

  const startVoiceAnalysis = async () => {
    try {
      setIsVoiceAnalyzing(true);
      setVoiceProgress(0);
      setVoiceMessage('Connecting to Arduino device...');
      if (!isConnected) {
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
        if (elapsed > speechDuration + 500) clearInterval(progressTimer);
      }, progressInterval);

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
    try {
      await sendCommand('STOP');
    } catch {}
    setIsVoiceAnalyzing(false);
    setVoiceProgress(0);
    setVoiceMessage('Voice analysis cancelled');
  };

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Voice Detection</h2>
        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
      </div>
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Uses the Arduino built-in PDM microphone for a 5-second voice recording to analyze Parkinson's symptom features (Jitter, Shimmer, HNR, etc.).
        </p>
        <div className="text-xs text-gray-500 dark:text-gray-400">⚠️ Ensure Arduino is connected and the environment is quiet</div>
        <div className="w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${voiceProgress}%` }} />
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-300">{voiceMessage}</div>
        <div className="flex flex-wrap gap-2">
          {!isVoiceAnalyzing ? (
            <Button
              onClick={startVoiceAnalysis}
              disabled={!isConnected}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {!isConnected ? 'Please connect Arduino first' : 'Start Voice Analysis'}
            </Button>
          ) : (
            <Button onClick={cancelVoiceAnalysis} variant="outline" className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white">
              Cancel Analysis
            </Button>
          )}
          {!isConnected && (
            <>
              <Button onClick={connectSerial} className="border-blue-500 text-white bg-blue-600 hover:bg-blue-700">Serial Connection</Button>
              <Button onClick={connectBluetooth} className="border-blue-500 text-white bg-blue-600 hover:bg-blue-700">Bluetooth Connection</Button>
            </>
          )}
          {isConnected && (
            <Button onClick={disconnect} variant="outline" className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white">
              Disconnect
            </Button>
          )}
        </div>

        {speechResult && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-neutral-700 rounded-lg">
            <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-3">Voice Analysis Results</h4>
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
  );
}
