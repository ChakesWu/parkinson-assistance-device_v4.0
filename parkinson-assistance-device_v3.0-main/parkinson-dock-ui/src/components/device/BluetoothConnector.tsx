'use client';

import { useState, useEffect, useRef } from 'react';
import { BluetoothManager, SensorData, AIResult } from '@/utils/bluetoothManager';
import { analysisRecordService, AnalysisRecord } from '@/services/analysisRecordService';
import { analysisRecordService } from '@/services/analysisRecordService';

export interface BluetoothConnectorProps {
  onDataReceived?: (data: Partial<SensorData>) => void;
}

export default function BluetoothConnector({ onDataReceived }: BluetoothConnectorProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sensorData, setSensorData] = useState<SensorData>({
    fingers: [0, 0, 0, 0, 0],
    accel: { x: 0, y: 0, z: 0 },
    gyro: { x: 0, y: 0, z: 0 },
    mag: { x: 0, y: 0, z: 0 }
  });
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [showAllDevices, setShowAllDevices] = useState(false); // Advanced: show all devices

  // Initialization-related state
  const [isInitializing, setIsInitializing] = useState(false);
  const [initializationComplete, setInitializationComplete] = useState(false);
  const [fingerBaselines, setFingerBaselines] = useState<number[]>([0, 0, 0, 0, 0]);

  // Potentiometer direction setting
  const [potentiometerReversed, setPotentiometerReversed] = useState(false);

  const bluetoothManagerRef = useRef<BluetoothManager | null>(null);

  // AI analysis result state
  const [aiAnalysisData, setAiAnalysisData] = useState({
    analysisCount: 0,
    parkinsonLevel: 0,
    parkinsonDescription: '',
    confidence: 0,
    recommendation: '',
    recommendedResistance: 0,
    isAnalyzing: false
  });

  // Training confirmation modal
  const [showTrainingConfirm, setShowTrainingConfirm] = useState(false);

  // Initialize Bluetooth manager
  useEffect(() => {
    bluetoothManagerRef.current = new BluetoothManager();
    
    // Set up callback functions
    bluetoothManagerRef.current.onDataReceived = handleDataReceived;
    bluetoothManagerRef.current.onAIResultReceived = handleAIResult;
    bluetoothManagerRef.current.onConnectionStatusChanged = handleConnectionStatusChanged;

    return () => {
      if (bluetoothManagerRef.current?.getConnectionStatus().isConnected) {
        bluetoothManagerRef.current.disconnect();
      }
      // Unsubscribe from analysis record events
      unsubscribe?.();
    };
  }, []);

  // Subscribe to local/web analysis save events: also show training confirmation when source is web-analysis
  const unsubscribeRef = useRef<() => void | null>(null);
  const unsubscribe = unsubscribeRef.current as (() => void) | null;
  useEffect(() => {
    const off = analysisRecordService.subscribe((record: AnalysisRecord) => {
      try {
        if (record.source === 'web-analysis') {
          // Sync to page AI state (for modal display text)
          setAiAnalysisData(prev => ({
            ...prev,
            analysisCount: record.analysisCount,
            parkinsonLevel: record.parkinsonLevel,
            parkinsonDescription: record.parkinsonDescription,
            confidence: record.confidence,
            recommendation: record.recommendation,
            recommendedResistance: record.recommendedResistance,
            isAnalyzing: false
          }));
          setShowTrainingConfirm(true);
        }
      } catch (e) {
        console.error('Failed to trigger training modal from web-analysis subscription', e);
      }
    });
    unsubscribeRef.current = off;
    return () => { try { off?.(); } catch {} };
  }, []);

  // Check if browser supports Web Bluetooth API
  const isBluetoothSupported = () => {
    return bluetoothManagerRef.current?.isBluetoothSupported() || false;
  };

  // Handle data received
  const handleDataReceived = (data: SensorData) => {
    // Adjust finger direction
    const processedData = adjustFingerDirection(data);

    setSensorData(processedData);
    onDataReceived?.(processedData);
    console.log('Bluetooth data received:', processedData);
  };

  // Handle AI result
  const handleAIResult = (result: AIResult) => {
    setAiAnalysisData(prev => ({
      ...prev,
      analysisCount: result.analysisCount,
      parkinsonLevel: result.parkinsonLevel,
      parkinsonDescription: result.parkinsonDescription || getParkinsonLevelDescription(result.parkinsonLevel),
      confidence: result.confidence,
      recommendation: result.recommendation || getRecommendation(result.parkinsonLevel),
      recommendedResistance: result.recommendedResistance || getRecommendedResistance(result.parkinsonLevel),
      isAnalyzing: false
    }));

    // Note: AI analysis record saving is now handled by BluetoothManager to avoid duplicate saves
    console.log('Bluetooth AI analysis result received:', result);

    // Show training confirmation after AI completes
    setShowTrainingConfirm(true);
  };

  // Handle connection status changes
  const handleConnectionStatusChanged = (connected: boolean, type: string) => {
    setIsConnected(connected);
    setIsConnecting(false);

    if (connected) {
      const status = bluetoothManagerRef.current?.getConnectionStatus();
      setDeviceName(status?.deviceName || null);
      setError(null);

      // Reset initialization state after Bluetooth reconnect and start new initialization
      console.log('🔄 Bluetooth device connected, starting re-initialization...');
      console.log('📋 Please ensure fingers are fully extended, preparing for baseline calibration');

      setIsInitializing(false);
      setInitializationComplete(false);
      setFingerBaselines([0, 0, 0, 0, 0]);

      // Delay initialization start to ensure stable connection
      setTimeout(() => {
        startWebInitialization();
      }, 1000);

    } else {
      setDeviceName(null);
      setIsInitializing(false);
      setInitializationComplete(false);
      setFingerBaselines([0, 0, 0, 0, 0]);
      setSensorData({
        fingers: [0, 0, 0, 0, 0],
        accel: { x: 0, y: 0, z: 0 },
        gyro: { x: 0, y: 0, z: 0 },
        mag: { x: 0, y: 0, z: 0 }
      });
    }
  };

  // Connect to Bluetooth device
  const connectToBluetooth = async () => {
    if (!isBluetoothSupported()) {
      setError('Your browser does not support the Web Bluetooth API. Please use Chrome or Edge.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      await bluetoothManagerRef.current?.connect({ acceptAll: showAllDevices });
    } catch (err) {
      console.error('Bluetooth connection error:', err);
      setError(`Bluetooth connection failed: ${(err as Error).message}`);
      setIsConnecting(false);
    }
  };

  // Disconnect Bluetooth
  const disconnectBluetooth = async () => {
    try {
      await bluetoothManagerRef.current?.disconnect();
    } catch (err) {
      console.error('Bluetooth disconnect error:', err);
    }
  };

  // Send command
  const sendCommand = async (command: string) => {
    try {
      await bluetoothManagerRef.current?.sendCommand(command);
    } catch (err) {
      setError(`Send command failed: ${(err as Error).message}`);
    }
  };

  // Get Parkinson level description
  const getParkinsonLevelDescription = (level: number): string => {
    switch (level) {
      case 1: return 'Normal';
      case 2: return 'Mild';
      case 3: return 'Moderate';
      case 4: return 'Severe';
      case 5: return 'Very Severe';
      default: return 'Unknown';
    }
  };

  // Get training recommendation
  const getRecommendation = (level: number): string => {
    switch (level) {
      case 1: return 'Maintain current training intensity';
      case 2: return 'Increase finger flexibility training';
      case 3: return 'Perform resistance training';
      case 4: return 'Seek professional guidance';
      case 5: return 'Seek immediate medical attention';
      default: return 'Unknown';
    }
  };

  // Get recommended resistance
  const getRecommendedResistance = (level: number): number => {
    return Math.round(30 + (level - 1) * 30); // range 30-150 degrees
  };

  // Web-side initialization function
  const startWebInitialization = () => {
    console.log('🔄 Starting Bluetooth-side finger baseline initialization...');
    console.log('📋 Please keep fingers fully extended, collecting baseline data in 3 seconds');

    setIsInitializing(true);
    setInitializationComplete(false);

    // 3-second countdown
    let countdown = 3;
    const countdownInterval = setInterval(() => {
      console.log(`⏰ Countdown: ${countdown} s...`);
      countdown--;
      if (countdown < 0) {
        clearInterval(countdownInterval);
        collectBaseline();
      }
    }, 1000);
  };

  // Collect baseline data
  const collectBaseline = () => {
    console.log('📊 Starting to collect finger extension baseline data...');

    const baselineData: number[][] = [[], [], [], [], []]; // data collection for 5 fingers
    const sampleCount = 30; // collect 30 samples (~3 seconds)
    let currentSample = 0;

    const collectInterval = setInterval(() => {
      if (sensorData && currentSample < sampleCount) {
        // Collect current raw data as baseline
        sensorData.fingers.forEach((value, index) => {
          baselineData[index].push(value);
        });

        currentSample++;
        console.log(`📈 Collection progress: ${currentSample}/${sampleCount}`);

      } else if (currentSample >= sampleCount) {
        clearInterval(collectInterval);

        // Calculate average baseline values
        const newBaselines = baselineData.map(fingerData => {
          const sum = fingerData.reduce((a, b) => a + b, 0);
          return sum / fingerData.length;
        });

        setFingerBaselines(newBaselines);
        setIsInitializing(false);
        setInitializationComplete(true);

        console.log('✅ Bluetooth-side initialization complete!');
        console.log('📊 Finger extension baseline values:', newBaselines);
        console.log('🎯 3D model reset to extended state');
        console.log('👆 Finger bend detection can now begin');

        // Notify 3D model to reset to extended state
        onDataReceived?.({
          fingers: [0, 0, 0, 0, 0], // reset to extended state
          accel: { x: 0, y: 0, z: 0 },
          gyro: { x: 0, y: 0, z: 0 },
          mag: { x: 0, y: 0, z: 0 }
        });
      }
    }, 100); // collect once every 100ms
  };

  // Adjust finger direction - directly invert data
  const adjustFingerDirection = (data: SensorData): SensorData => {
    const adjustedFingers = data.fingers.map((value, index) => {
      let adjustedValue = value;

      // If potentiometer is set to reversed, invert the bend value
      if (potentiometerReversed) {
        // Assuming the normal bend range is 0-200
        // Inversion formula: new value = max value - original value
        const maxValue = 200;
        adjustedValue = Math.max(0, maxValue - value);
      }

      // Pinky sensitivity enhancement (index 4 is the pinky)
      if (index === 4) {
        return adjustedValue * 1.5; // increase sensitivity by 50%
      }

      return adjustedValue;
    });

    return {
      ...data,
      fingers: adjustedFingers
    };
  };

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 shadow-lg max-w-2xl mx-auto">
      <div className="flex flex-col items-center mb-6">
        <div className={`p-4 rounded-full mb-4 ${isConnected ? 'bg-blue-100 dark:bg-blue-900' : 'bg-gray-100 dark:bg-gray-700'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-16 w-16 ${isConnected ? 'text-blue-600 dark:text-blue-300' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold">Bluetooth Connection</h2>
        <p className="text-gray-600 dark:text-gray-300">ParkinsonDevice v2.0</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-neutral-700 rounded-lg">
          <span>Connection Status</span>
          <span className={`font-semibold ${isConnected ? 'text-blue-500' : isConnecting ? 'text-yellow-500' : 'text-gray-500'}`}>
            {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Not Connected'}
          </span>
        </div>

        {deviceName && (
          <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-neutral-700 rounded-lg">
            <span>Device Name</span>
            <span className="font-semibold">{deviceName}</span>
          </div>
        )}

        {/* Advanced option: show all devices */}
        <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-neutral-700 rounded-lg">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={showAllDevices}
              onChange={(e) => setShowAllDevices(e.target.checked)}
            />
            <span className="text-sm">Show All Devices (Advanced)</span>
          </label>
          <span className="text-xs text-gray-500">Filters by device name by default; check to select from all BLE devices</span>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        {!isConnected ? (
          <button
            onClick={connectToBluetooth}
            disabled={isConnecting || !isBluetoothSupported()}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white py-2 px-4 rounded-lg transition"
          >
            {isConnecting ? 'Connecting...' : 'Connect Bluetooth Device'}
          </button>
        ) : (
          <button
            onClick={disconnectBluetooth}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 px-4 rounded-lg transition"
          >
            Disconnect
          </button>
        )}

        <button
          className={`bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded-lg transition ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={!isConnected}
          onClick={() => sendCommand('START')}
        >
          Start Data Collection
        </button>
      </div>

      {/* Potentiometer Direction Settings */}
      <div className="mt-4 p-4 bg-gray-50 dark:bg-neutral-700 rounded-lg">
        <h3 className="text-sm font-medium mb-2">Potentiometer Settings</h3>
        <div className="flex items-center space-x-3">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={potentiometerReversed}
              onChange={(e) => setPotentiometerReversed(e.target.checked)}
              className="sr-only"
            />
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              potentiometerReversed ? 'bg-blue-600' : 'bg-gray-300'
            }`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                potentiometerReversed ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </div>
            <span className="ml-3 text-sm">
              Reverse Potentiometer {potentiometerReversed ? '(Decrease = Bend)' : '(Increase = Bend)'}
            </span>
          </label>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          If the finger bend direction is reversed, enable this option.
        </p>
      </div>

      {/* Control command buttons */}
      {isConnected && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">Device Control</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => sendCommand('STOP')}
              className="bg-red-500 hover:bg-red-600 text-white py-2 px-3 rounded-lg transition text-sm"
            >
              Stop Collection
            </button>
            <button
              onClick={() => sendCommand('CALIBRATE')}
              className="bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-3 rounded-lg transition text-sm"
            >
              Calibrate Sensor
            </button>
            <button
              onClick={() => sendCommand('AUTO')}
              className="bg-green-500 hover:bg-green-600 text-white py-2 px-3 rounded-lg transition text-sm"
            >
              AI Analysis
            </button>
            <button
              onClick={() => sendCommand('STATUS')}
              className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded-lg transition text-sm"
            >
              Query Status
            </button>
          </div>
        </div>
      )}

      {isConnected && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Live Sensor Data</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-100 dark:bg-neutral-700 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Finger Bend</h4>
              {sensorData.fingers.map((value, index) => {
                const percentage = Math.min(100, Math.max(0, (value / 1023) * 100));
                const displayValue = Math.round(percentage);

                return (
                  <div key={index} className="flex items-center justify-between mb-2">
                    <span className="text-sm">Finger {index + 1}:</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${displayValue}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium w-10">{displayValue}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="bg-gray-100 dark:bg-neutral-700 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Accelerometer (g)</h4>
              <div className="space-y-2">
                <div>X: {sensorData.accel.x.toFixed(2)}</div>
                <div>Y: {sensorData.accel.y.toFixed(2)}</div>
                <div>Z: {sensorData.accel.z.toFixed(2)}</div>
              </div>
            </div>
            
            <div className="bg-gray-100 dark:bg-neutral-700 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Gyroscope (deg/s)</h4>
              <div className="space-y-2">
                <div>X: {sensorData.gyro.x.toFixed(2)}</div>
                <div>Y: {sensorData.gyro.y.toFixed(2)}</div>
                <div>Z: {sensorData.gyro.z.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* AI analysis status display */}
          {(aiAnalysisData.analysisCount > 0 || aiAnalysisData.isAnalyzing) && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">AI Analysis Results</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-100 dark:bg-neutral-700 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Analysis Status</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Analysis Count:</span>
                      <span className="font-medium">{aiAnalysisData.analysisCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className={`font-medium ${aiAnalysisData.isAnalyzing ? 'text-blue-600' : 'text-green-600'}`}>
                        {aiAnalysisData.isAnalyzing ? 'Analyzing...' : 'Completed'}
                      </span>
                    </div>
                  </div>
                </div>

                {aiAnalysisData.parkinsonLevel > 0 && (
                  <div className="bg-gray-100 dark:bg-neutral-700 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">Analysis Result</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Level:</span>
                        <span className="font-medium">{aiAnalysisData.parkinsonLevel} ({getParkinsonLevelDescription(aiAnalysisData.parkinsonLevel)})</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Confidence:</span>
                        <span className="font-medium">{aiAnalysisData.confidence.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Recommended Resistance:</span>
                        <span className="font-medium">{getRecommendedResistance(aiAnalysisData.parkinsonLevel)}°</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {aiAnalysisData.parkinsonLevel > 0 && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h4 className="font-medium mb-2 text-blue-800 dark:text-blue-200">Training Recommendation</h4>
                  <p className="text-blue-700 dark:text-blue-300">{getRecommendation(aiAnalysisData.parkinsonLevel)}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Training Confirmation Modal */}
      {showTrainingConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 w-full max-w-md shadow-lg">
            <h4 className="text-lg font-semibold mb-3">Start 20-second Resistance Training?</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              AI Recommended Level: {aiAnalysisData.parkinsonLevel}, Recommended Resistance: {getRecommendedResistance(aiAnalysisData.parkinsonLevel)}°
            </p>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1 rounded bg-gray-200 dark:bg-neutral-700" onClick={() => setShowTrainingConfirm(false)}>Cancel</button>
              <button
                className="px-3 py-1 rounded bg-blue-600 text-white"
                onClick={() => {
                  const level = Math.max(1, Math.min(5, aiAnalysisData.parkinsonLevel || 2));
                  sendCommand(`TRAIN_SERVO,20000,0,${level}`);
                  setShowTrainingConfirm(false);
                }}
              >
                Start Training
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
