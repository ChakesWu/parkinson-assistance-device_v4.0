'use client';

import { useState, useEffect } from 'react';
import { useGlobalConnection } from '@/hooks/useGlobalConnection';
import { SensorData, AIResult } from '@/utils/bluetoothManager';
import { analysisRecordService } from '@/services/analysisRecordService';
import { GlobalConnectionManager } from '@/utils/globalConnectionManager';

export interface GlobalConnectorProps {
  onDataReceived?: (data: Partial<SensorData>) => void;
  showSensorData?: boolean;
  showConnectionControls?: boolean;
  compact?: boolean;
}

export default function GlobalConnector({
  onDataReceived,
  showSensorData = true,
  showConnectionControls = true,
  compact = false
}: GlobalConnectorProps) {
  const [sensorData, setSensorData] = useState<SensorData>({
    fingers: [0, 0, 0, 0, 0],
    accel: { x: 0, y: 0, z: 0 },
    gyro: { x: 0, y: 0, z: 0 },
    mag: { x: 0, y: 0, z: 0 }
  });

  const [aiAnalysisData, setAiAnalysisData] = useState({
    analysisCount: 0,
    parkinsonLevel: 0,
    parkinsonDescription: '',
    confidence: 0,
    recommendation: '',
    recommendedResistance: 0,
    isAnalyzing: false
  });

  const [isInitialized, setIsInitialized] = useState(false);

  // Potentiometer direction setting
  const [potentiometerReversed, setPotentiometerReversed] = useState(false);

  const {
    connectionState,
    isConnected,
    connectionType,
    deviceName,
    browserSupport,
    connectBluetooth,
    connectSerial,
    disconnect,
    sendCommand,
    isConnecting,
    error,
    clearError
  } = useGlobalConnection({
    onDataReceived: handleDataReceived,
    onAIResultReceived: handleAIResult,
    autoRequestState: !compact // do not auto-request state in compact mode
  });

  // Delay initialization to avoid blocking page render
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialized(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Handle potentiometer setting changes
  useEffect(() => {
    const manager = GlobalConnectionManager.getInstance();
    manager.setPotentiometerSettings({
      reversed: potentiometerReversed
    });
  }, [potentiometerReversed]);

  // Handle data received
  function handleDataReceived(data: SensorData) {
    console.log('🔗 GlobalConnector received data:', data);
    setSensorData(data);
    console.log('📤 GlobalConnector calling onDataReceived callback');
    onDataReceived?.(data);
  }

  // Handle AI result
  function handleAIResult(result: AIResult) {
    setAiAnalysisData(prev => ({
      ...prev,
      analysisCount: result.analysisCount,
      parkinsonLevel: result.parkinsonLevel,
      confidence: result.confidence,
      isAnalyzing: false
    }));

    // Save analysis record
    try {
      const record = analysisRecordService.saveRecord({
        analysisCount: result.analysisCount,
        parkinsonLevel: result.parkinsonLevel,
        parkinsonDescription: getParkinsonLevelDescription(result.parkinsonLevel),
        confidence: result.confidence,
        recommendation: getRecommendation(result.parkinsonLevel),
        recommendedResistance: getRecommendedResistance(result.parkinsonLevel),
        sensorData: {
          fingerPositions: sensorData.fingers.map(v => Math.round((v / 1023) * 100)),
          accelerometer: sensorData.accel,
          gyroscope: sensorData.gyro,
          emg: sensorData.emg || 0,
        },
        source: connectionType || 'unknown',
      });
      console.log('Global connection AI analysis record saved:', record);
    } catch (error) {
      console.error('Failed to save global connection AI analysis record:', error);
    }
  }

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

  // Send test command
  const handleSendCommand = async (command: string) => {
    try {
      await sendCommand(command);
    } catch (error) {
      console.error('Send command failed:', error);
    }
  };

  if (compact) {
    return (
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <div>
              <div className="font-medium text-sm">
                {isConnected ? `Connected (${connectionType})` : 'Not Connected'}
              </div>
              {deviceName && (
                <div className="text-xs text-gray-500">{deviceName}</div>
              )}
            </div>
          </div>

          {showConnectionControls && isInitialized && (
            <div className="flex space-x-2">
              {!isConnected ? (
                <>
                  <button
                    onClick={connectSerial}
                    disabled={isConnecting || !browserSupport.serial}
                    className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
                  >
                    Serial
                  </button>
                  <button
                    onClick={connectBluetooth}
                    disabled={isConnecting || !browserSupport.bluetooth}
                    className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
                  >
                    Bluetooth
                  </button>
                </>
              ) : (
                <button
                  onClick={disconnect}
                  className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  Disconnect
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-2 p-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded text-xs">
            {error}
            <button onClick={clearError} className="ml-2 underline">Clear Error</button>
          </div>
        )}
      </div>
    );
  }

  // Show simple loading state if not yet initialized
  if (!isInitialized) {
    return (
      <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 shadow-lg">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600 dark:text-gray-400">Initializing connection manager...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Global Device Connection</h2>
        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg">
          {error}
          <button onClick={clearError} className="ml-2 underline">Clear Error</button>
        </div>
      )}

      {/* Connection status */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-neutral-700 rounded-lg">
          <span>Connection Status</span>
          <span className={`font-semibold ${isConnected ? 'text-green-500' : isConnecting ? 'text-yellow-500' : 'text-gray-500'}`}>
            {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Not Connected'}
          </span>
        </div>
        
        {connectionType && (
          <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-neutral-700 rounded-lg">
            <span>Connection Type</span>
            <span className="font-semibold">{connectionType === 'serial' ? 'Serial' : 'Bluetooth'}</span>
          </div>
        )}
        
        {deviceName && (
          <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-neutral-700 rounded-lg">
            <span>Device Name</span>
            <span className="font-semibold">{deviceName}</span>
          </div>
        )}

        {/* Cross-page state notice */}
        {isConnected && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-blue-700 dark:text-blue-300">
                Connection state synchronized across all pages
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Connection controls */}
      {showConnectionControls && (
        <div className="space-y-4 mb-6">
          <h3 className="text-lg font-semibold">Connection Controls</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!isConnected ? (
              <>
                <button
                  onClick={connectSerial}
                  disabled={isConnecting || !browserSupport.serial}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white py-2 px-4 rounded-lg transition"
                >
                  {isConnecting ? 'Connecting...' : 'Serial Connection'}
                  {!browserSupport.serial && <span className="ml-2 text-xs">(Not Supported)</span>}
                </button>
                
                <button
                  onClick={connectBluetooth}
                  disabled={isConnecting || !browserSupport.bluetooth}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white py-2 px-4 rounded-lg transition"
                >
                  {isConnecting ? 'Connecting...' : 'Bluetooth Connection'}
                  {!browserSupport.bluetooth && <span className="ml-2 text-xs">(Not Supported)</span>}
                </button>
              </>
            ) : (
              <button
                onClick={disconnect}
                className="bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition"
              >
                Disconnect
              </button>
            )}
          </div>

          {/* Browser support status */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${browserSupport.serial ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span>Serial: {browserSupport.serial ? 'Supported' : 'Not Supported'}</span>
              </div>
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${browserSupport.bluetooth ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span>Bluetooth: {browserSupport.bluetooth ? 'Supported' : 'Not Supported'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Potentiometer direction settings */}
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

      {/* Sensor data */}
      {showSensorData && isConnected && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Live Sensor Data</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-100 dark:bg-neutral-700 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Finger Bend</h4>
              {sensorData.fingers.map((value, index) => {
                const percentage = Math.min(100, Math.max(0, (value / 1023) * 100));
                return (
                  <div key={index} className="flex items-center justify-between mb-2">
                    <span className="text-sm">Finger {index + 1}:</span>
                    <span className="text-sm font-medium">{Math.round(percentage)}%</span>
                  </div>
                );
              })}
            </div>
            
            <div className="bg-gray-100 dark:bg-neutral-700 p-4 rounded-lg">
              <h4 className="font-medium mb-2">IMU Data</h4>
              <div className="space-y-2 text-sm">
                <div>Accel: X:{sensorData.accel.x.toFixed(2)} Y:{sensorData.accel.y.toFixed(2)} Z:{sensorData.accel.z.toFixed(2)}</div>
                <div>Gyro: X:{sensorData.gyro.x.toFixed(2)} Y:{sensorData.gyro.y.toFixed(2)} Z:{sensorData.gyro.z.toFixed(2)}</div>
                {sensorData.emg !== undefined && (
                  <div>EMG: {sensorData.emg.toFixed(0)}</div>
                )}
              </div>
            </div>
          </div>

          {/* AI analysis results */}
          {aiAnalysisData.analysisCount > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h4 className="font-medium mb-2 text-blue-800 dark:text-blue-200">Latest AI Analysis Result</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>Analysis Count: {aiAnalysisData.analysisCount}</div>
                <div>Parkinson Level: {aiAnalysisData.parkinsonLevel}</div>
                <div>Confidence: {aiAnalysisData.confidence.toFixed(1)}%</div>
                <div>Recommended Resistance: {getRecommendedResistance(aiAnalysisData.parkinsonLevel)}°</div>
              </div>
            </div>
          )}

          {/* Quick commands */}
          {isConnected && (
            <div className="space-y-2">
              <h4 className="font-medium">Quick Commands</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleSendCommand('CALIBRATE')}
                  className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                >
                  Calibrate
                </button>
                <button
                  onClick={() => handleSendCommand('AUTO')}
                  className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
                >
                  AI Analysis
                </button>
                <button
                  onClick={() => handleSendCommand('STATUS')}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Status Query
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
