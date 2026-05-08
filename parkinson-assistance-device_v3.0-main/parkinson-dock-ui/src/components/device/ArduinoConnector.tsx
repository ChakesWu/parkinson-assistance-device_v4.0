'use client';

/// &lt;reference path="../../types/web-serial.d.ts" />
import { useState, useEffect, useRef } from 'react';
import { analysisRecordService } from '@/services/analysisRecordService';
import { getRecommendedTraining, getLevelLabelZh } from '@/utils/parkinsonClassifier';

interface SensorData {
  fingers: number[];
  accel: { x: number; y: number; z: number };
  gyro: { x: number; y: number; z: number };
  mag: { x: number; y: number; z: number };
}

export interface ArduinoConnectorProps {
  onDataReceived?: (data: Partial<SensorData> & { emg?: number }) => void;
}

export default function ArduinoConnector({ onDataReceived }: ArduinoConnectorProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [sensorData, setSensorData] = useState<SensorData>({
    fingers: [0, 0, 0, 0, 0],
    accel: { x: 0, y: 0, z: 0 },
    gyro: { x: 0, y: 0, z: 0 },
    mag: { x: 0, y: 0, z: 0 }
  });
  const [port, setPort] = useState<SerialPort | null>(null);
  const [reader, setReader] = useState<ReadableStreamDefaultReader | null>(null);
  const [writer, setWriter] = useState<WritableStreamDefaultWriter | null>(null);
  const writableClosedRef = useRef<Promise<void> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readBufferRef = useRef<string>('');

  // Initialization-related state
  const [isInitializing, setIsInitializing] = useState(false);
  const [initializationComplete, setInitializationComplete] = useState(false);
  const [fingerBaselines, setFingerBaselines] = useState<number[]>([0, 0, 0, 0, 0]);

  // Potentiometer direction setting
  const [potentiometerReversed, setPotentiometerReversed] = useState(false);

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

  // Servo settings state (thumb to pinky)
  const [servoInitialAngles, setServoInitialAngles] = useState<number[]>([90, 90, 90, 90, 90]);
  const [servoMinAngles, setServoMinAngles] = useState<number[]>([10, 10, 10, 10, 10]);
  const [servoMaxAngles, setServoMaxAngles] = useState<number[]>([170, 170, 170, 170, 170]);
  const [showTrainingConfirm, setShowTrainingConfirm] = useState(false);

  const updateArrayValue = (arr: number[], idx: number, val: number) => {
    const next = [...arr];
    next[idx] = Math.max(0, Math.min(180, Math.round(val)));
    return next;
  };

  // Check if the browser supports the Web Serial API
  const isWebSerialSupported = () => {
    return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serial' in navigator;
  };

  const sendCommand = async (command: string) => {
    try {
      if (!writer) return;
      const payload = command.endsWith('\n') ? command : `${command}\n`;
      await writer.write(payload);
    } catch (e) {
      console.error('Serial write failed:', e);
      setError(`Serial write failed: ${(e as Error).message}`);
    }
  };

  // Connect to Arduino device
  const connectToArduino = async () => {
    if (!isWebSerialSupported()) {
      setError('Your browser does not support the Web Serial API. Please use Chrome or Edge.');
      return;
    }

    try {
      // Request the user to select a serial port device
      const selectedPort = await navigator.serial.requestPort();
      // Matches the Arduino firmware (Serial.begin(115200))
      await selectedPort.open({ baudRate: 115200 });
      
      setPort(selectedPort);
      setIsConnected(true);
      setError(null);
      
      // Set up the reader
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = selectedPort.readable.pipeTo(textDecoder.writable);
      const newReader = textDecoder.readable.getReader();
      setReader(newReader);
      
      // Set up the writer
      const textEncoder = new TextEncoderStream();
      writableClosedRef.current = textEncoder.readable.pipeTo(selectedPort.writable);
      const newWriter = textEncoder.writable.getWriter();
      setWriter(newWriter);

      // Start reading data
      readData(newReader);

      // Reset initialization state
      setIsInitializing(false);
      setInitializationComplete(false);
      setFingerBaselines([0, 0, 0, 0, 0]);
      setIsConnected(true);

      // Wait for the device to stabilize after a successful connection
      await new Promise(r => setTimeout(r, 1000));
      console.log('🔄 Serial device connected, starting re-initialization...');
      console.log('📋 Please ensure fingers are fully extended, preparing for baseline calibration');

      // Query status
      await newWriter.write('STATUS\n');

      // Wait a moment before initialization to ensure the device responds
      await new Promise(r => setTimeout(r, 500));

      // Arduino handles calibration automatically; the frontend only needs to adjust direction
      console.log('🚀 Serial connection: Arduino will handle calibration automatically');
      
    } catch (err) {
      console.error('Connection error:', err);
      setError(`Connection failed: ${(err as Error).message}`);
      setIsConnected(false);
    }
  };

  // Disconnect
  const disconnectArduino = async () => {
    if (reader) {
      await reader.cancel();
    }
    
    if (writer) {
      try {
        await writer.close();
      } catch {}
      setWriter(null);
    }

    if (writableClosedRef.current) {
      try {
        await writableClosedRef.current;
      } catch {}
      writableClosedRef.current = null;
    }

    if (port) {
      await port.close();
    }
    
    setIsConnected(false);
    setPort(null);
    setReader(null);
  };

  // Read serial port data
  const readData = async (currentReader: ReadableStreamDefaultReader) => {
    try {
      while (true) {
        const { value, done } = await currentReader.read();
        if (done) {
          currentReader.releaseLock();
          break;
        }
        
        if (value) {
          // Accumulate into the line buffer to ensure data spanning multiple chunks is fully parsed
          readBufferRef.current += value as string;
          const parts = readBufferRef.current.split('\n');
          // The last segment may be an incomplete line; hold it back in the buffer
          readBufferRef.current = parts.pop() ?? '';
          for (const line of parts) {
            parseSensorData(line);
          }
        }
      }
    } catch (err) {
      console.error('Read error:', err);
      setError(`Data read error: ${(err as Error).message}`);
      disconnectArduino();
    }
  };

  // Parse sensor data
  const parseSensorData = (dataString: string) => {
    try {
      const lines = dataString.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Add debug info
        console.log('📥 Serial data received:', trimmedLine);

        // Handle initialization complete signal
        if (trimmedLine === 'INIT_COMPLETE') {
          console.log('✅ Arduino device initialization complete!');
          // After Arduino initialization is complete, start web-side initialization
          startWebInitialization();
          return;
        }

        // Parse DATA format: DATA,thumb,index,middle,ring,pinky,emg,accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z,mag_x,mag_y,mag_z
        // Left hand logic: finger1=thumb, finger2=index, finger3=middle, finger4=ring, finger5=pinky
        if (trimmedLine.startsWith('DATA,')) {
          const parts = trimmedLine.split(',');
          console.log('📊 Parsing DATA, parts length:', parts.length, 'parts:', parts);

          if (parts.length >= 16) { // DATA + 15 values (including accel/gyro/mag)
            // Parse raw finger data (indices 1-5) - left hand order: thumb to pinky
            const rawFingers = [
              parseInt(parts[1]),  // thumb raw value
              parseInt(parts[2]),  // index raw value
              parseInt(parts[3]),  // middle raw value
              parseInt(parts[4]),  // ring raw value
              parseInt(parts[5])   // pinky raw value
            ];

            // Process potentiometer direction adjustment
            const processedFingers = adjustFingerDirection(rawFingers);

            // Parse IMU data (indices 7-15)
            const accel = {
              x: parseFloat(parts[7]),
              y: parseFloat(parts[8]),
              z: parseFloat(parts[9])
            };

            const gyro = {
              x: parseFloat(parts[10]),
              y: parseFloat(parts[11]),
              z: parseFloat(parts[12])
            };

            const mag = {
              x: parseFloat(parts[13]),
              y: parseFloat(parts[14]),
              z: parseFloat(parts[15])
            };

            // Update sensor data
            const newSensorData = {
              fingers: processedFingers,
              accel,
              gyro,
              mag,
              emg: parseInt(parts[6]) // EMG data at index 6
            };

            setSensorData(newSensorData as SensorData);
            onDataReceived?.(newSensorData);

            if (isInitializing) {
              console.log('Initializing, raw data:', rawFingers, 'processed:', processedFingers);
            }
          } else if (parts.length >= 10) { // DATA + 9 values (fingers(5), emg(1), accel(3))
            // Parse finger data (indices 1-5) - left hand order: thumb to pinky
            const rawFingers = [
              parseInt(parts[1]),  // thumb (finger1)
              parseInt(parts[2]),  // index (finger2)
              parseInt(parts[3]),  // middle (finger3)
              parseInt(parts[4]),  // ring (finger4)
              parseInt(parts[5])   // pinky (finger5)
            ];
            // Clamp to 0..1023 to avoid negative values causing 3D model inversion or UI bar chart anomalies
            const fingers = rawFingers.map(v => Math.max(0, Math.min(1023, v)));

            const accel = {
              x: parseFloat(parts[7]),
              y: parseFloat(parts[8]),
              z: parseFloat(parts[9])
            };

            const newSensorData = {
              fingers,
              accel,
              gyro: { x: 0, y: 0, z: 0 },
              mag: { x: 0, y: 0, z: 0 },
              emg: parseInt(parts[6])
            };

            setSensorData(newSensorData as SensorData);
            onDataReceived?.(newSensorData);
            console.log('Parsed data (simplified format):', newSensorData);
          }
        }

        // Retain backward compatibility with old format
        // Parse finger bend data
        else if (trimmedLine.startsWith('Fingers:')) {
          const fingersMatch = trimmedLine.match(/Fingers:\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/);
          if (fingersMatch) {
            const newFingers = [
              parseInt(fingersMatch[1]),
              parseInt(fingersMatch[2]),
              parseInt(fingersMatch[3]),
              parseInt(fingersMatch[4]),
              parseInt(fingersMatch[5])
            ];
            setSensorData(prev => ({
              ...prev,
              fingers: newFingers
            }));
            onDataReceived?.({ fingers: newFingers });
          }
        }

        // Parse accelerometer data
        else if (trimmedLine.startsWith('Accel:')) {
          const accelMatch = trimmedLine.match(/Accel:\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)/);
          if (accelMatch) {
            const newAccel = {
              x: parseFloat(accelMatch[1]),
              y: parseFloat(accelMatch[2]),
              z: parseFloat(accelMatch[3])
            };
            setSensorData(prev => ({
              ...prev,
              accel: newAccel
            }));
            onDataReceived?.({ accel: newAccel });
          }
        }

        // Parse gyroscope data
        else if (trimmedLine.startsWith('Gyro:')) {
          const gyroMatch = trimmedLine.match(/Gyro:\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)/);
          if (gyroMatch) {
            const newGyro = {
              x: parseFloat(gyroMatch[1]),
              y: parseFloat(gyroMatch[2]),
              z: parseFloat(gyroMatch[3])
            };
            setSensorData(prev => ({
              ...prev,
              gyro: newGyro
            }));
            onDataReceived?.({ gyro: newGyro });
          }
        }

        // Parse magnetometer data
        else if (trimmedLine.startsWith('Mag:')) {
          const magMatch = trimmedLine.match(/Mag:\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)/);
          if (magMatch) {
            const newMag = {
              x: parseFloat(magMatch[1]),
              y: parseFloat(magMatch[2]),
              z: parseFloat(magMatch[3])
            };
            setSensorData(prev => ({
              ...prev,
              mag: newMag
            }));
            onDataReceived?.({ mag: newMag });
          }
        }

        // Parse AI analysis results
        else if (trimmedLine.includes('=== AI Analysis Results ===')) {
          setAiAnalysisData(prev => ({ ...prev, isAnalyzing: true }));
        }
        else if (trimmedLine.startsWith('Analysis Count:')) {
          const countMatch = trimmedLine.match(/Analysis Count:\s*(\d+)/);
          if (countMatch) {
            setAiAnalysisData(prev => ({ ...prev, analysisCount: parseInt(countMatch[1]) }));
          }
        }
        else if (trimmedLine.startsWith('Parkinson Level:')) {
          const levelMatch = trimmedLine.match(/Parkinson Level:\s*(\d+)\s*\(([^)]+)\)/);
          if (levelMatch) {
            setAiAnalysisData(prev => ({
              ...prev,
              parkinsonLevel: parseInt(levelMatch[1]),
              parkinsonDescription: levelMatch[2]
            }));
          }
        }
        else if (trimmedLine.startsWith('Confidence:')) {
          const confidenceMatch = trimmedLine.match(/Confidence:\s*([\d.]+)%/);
          if (confidenceMatch) {
            setAiAnalysisData(prev => ({ ...prev, confidence: parseFloat(confidenceMatch[1]) }));
          }
        }
        else if (trimmedLine.startsWith('Training Recommendation:')) {
          const recommendation = trimmedLine.split(':')[1]?.trim();
          if (recommendation) {
            setAiAnalysisData(prev => ({ ...prev, recommendation }));
          }
        }
        else if (trimmedLine.startsWith('Recommended Resistance:')) {
          const resistanceMatch = trimmedLine.match(/Recommended Resistance:\s*(\d+) deg/);
          if (resistanceMatch) {
            setAiAnalysisData(prev => ({ ...prev, recommendedResistance: parseInt(resistanceMatch[1]) }));
          }
        }
        else if (trimmedLine.includes('==================') && aiAnalysisData.isAnalyzing) {
          // AI analysis complete, save record
          try {
            const record = analysisRecordService.saveRecord({
              analysisCount: aiAnalysisData.analysisCount,
              parkinsonLevel: aiAnalysisData.parkinsonLevel,
              parkinsonDescription: aiAnalysisData.parkinsonDescription,
              confidence: aiAnalysisData.confidence,
              recommendation: aiAnalysisData.recommendation,
              recommendedResistance: aiAnalysisData.recommendedResistance,
              sensorData: {
                fingerPositions: sensorData.fingers.map(v => Math.round((v / 1023) * 100)),
                accelerometer: sensorData.accel,
                gyroscope: sensorData.gyro,
                emg: 0, // EMG data if available
              },
              source: 'arduino',
            });
            console.log('Arduino AI analysis record saved:', record);
            setAiAnalysisData(prev => ({ ...prev, isAnalyzing: false }));
            // Show 20-second training confirmation dialog after analysis
            setShowTrainingConfirm(true);
          } catch (error) {
            console.error('Failed to save Arduino AI analysis record:', error);
          }
        }

        // Parse servo config echo: SERVO_CFG,OK,zero(5),min(5),max(5),dir(5)
        if (trimmedLine.startsWith('SERVO_CFG,OK,')) {
          const parts = trimmedLine.split(',');
          // parts: [SERVO_CFG, OK, z0,z1,z2,z3,z4, min0..min4, max0..max4, dir0..dir4]  (no change)
          if (parts.length >= 2 + 5 + 5 + 5 + 5) {
            const base = 2;
            const mins = parts.slice(base + 5, base + 10).map(v => parseInt(v));
            const maxs = parts.slice(base + 10, base + 15).map(v => parseInt(v));
            setServoMinAngles(mins.map(v => isNaN(v) ? 10 : v));
            setServoMaxAngles(maxs.map(v => isNaN(v) ? 170 : v));
          }
        }
      }
    } catch (err) {
      console.error('Data parse error:', err);
      setError(`Data parse error: ${(err as Error).message}`);
    }
  };

  // Servo command wrappers
  const servoSet = (fingerId: number, angle: number) => sendCommand(`SERVO_SET,${fingerId},${Math.max(0, Math.min(180, Math.round(angle)))}`);
  const servoInitAll = (angles: number[]) => sendCommand(`SERVO_INIT,${angles.map(a => Math.max(0, Math.min(180, Math.round(a)))).join(',')}`);
  const servoLimit = (fingerId: number, minA: number, maxA: number) => sendCommand(`SERVO_LIMIT,${fingerId},${Math.max(0, Math.min(180, Math.round(minA)))},${Math.max(0, Math.min(180, Math.round(maxA)))}`);
  const servoSave = () => sendCommand('SERVO_SAVE');
  const servoLoad = () => sendCommand('SERVO_LOAD');
  const startServoTraining = (durationMs = 20000, mode = 0, level = 2) => sendCommand(`TRAIN_SERVO,${durationMs},${mode},${level}`);

  // Web-side initialization function
  const startWebInitialization = () => {
    console.log('🔄 Starting web-side finger baseline initialization...');
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

        console.log('✅ Web-side initialization complete!');
        console.log('📊 Finger extension baseline values:', newBaselines);
        console.log('🎯 3D model reset to extended state');
        console.log('👆 Finger bend detection can now begin');

        // Notify 3D model to reset to extended state
        onDataReceived?.({
          fingers: [0, 0, 0, 0, 0], // reset to extended state
          accel: { x: 0, y: 0, z: 0 },
          gyro: { x: 0, y: 0, z: 0 },
          mag: { x: 0, y: 0, z: 0 },
          emg: 0
        });
      }
    }, 100); // collect once every 100ms
  };

  // Adjust finger direction - directly invert data
  const adjustFingerDirection = (fingerData: number[]): number[] => {
    const result = fingerData.map((value, index) => {
      let adjustedValue = value;

      // If potentiometer is set to reversed, invert the bend value
      if (potentiometerReversed) {
        // Assuming the normal bend range is 0-200
        // Inversion formula: new value = max value - original value
        const maxValue = 200;
        adjustedValue = Math.max(0, maxValue - value);

        // Debug info
        if (index === 0) { // print debug info only for the first finger
          console.log(`🔄 Reverse mode: original=${value} → adjusted=${adjustedValue}`);
        }
      }

      // Pinky sensitivity enhancement (index 4 is the pinky)
      if (index === 4) {
        return adjustedValue * 1.5; // increase sensitivity by 50%
      }

      return adjustedValue;
    });

    // Debug info
    if (potentiometerReversed) {
      console.log('🔄 Reversed potentiometer enabled, original:', fingerData, 'adjusted:', result);
    }

    return result;
  };

  // Disconnect when component unmounts
  useEffect(() => {
    return () => {
      if (isConnected) {
        disconnectArduino();
      }
    };
  }, []);

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 shadow-lg max-w-2xl mx-auto">
      <div className="flex flex-col items-center mb-6">
        <div className={`p-4 rounded-full mb-4 ${isConnected ? 'bg-green-100 dark:bg-green-900' : 'bg-blue-100 dark:bg-blue-900'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-16 w-16 ${isConnected ? 'text-green-600 dark:text-green-300' : 'text-blue-600 dark:text-blue-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold">Parkinson's Assistance Device</h2>
        <p className="text-gray-600 dark:text-gray-300">Version 2.0</p>
      </div>

      {error && (
        <div className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-neutral-700 rounded-lg">
          <span>Connection Status</span>
          <span className={`font-semibold ${isConnected ? 'text-green-500' : 'text-yellow-500'}`}>
            {isConnected ? 'Connected' : 'Not Connected'}
          </span>
        </div>
        
        {isConnected && (
          <>
            <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-neutral-700 rounded-lg">
              <span>Device Serial No.</span>
              <span>PD-2023-001</span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-neutral-700 rounded-lg">
              <span>Firmware Version</span>
              <span>v2.1.4</span>
            </div>
          </>
        )}
      </div>
      
      <div className="mt-8 grid grid-cols-2 gap-4">
        {!isConnected ? (
          <button 
            onClick={connectToArduino}
            className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg transition"
          >
            Connect Device
          </button>
        ) : (
          <button 
            onClick={disconnectArduino}
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
          Sync Data
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

      {/* Servo Settings */}
      {isConnected && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-neutral-700 rounded-lg">
          <h3 className="text-sm font-medium mb-3">Servo Settings (Thumb → Pinky)</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {['Thumb','Index','Middle','Ring','Pinky'].map((label, idx) => (
              <div key={idx} className="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-600">
                <div className="text-xs font-medium mb-2">{label}</div>
                <div className="space-y-2">
                  <label className="block text-xs">Initial Angle: {servoInitialAngles[idx]}°</label>
                  <input type="range" min={0} max={180} value={servoInitialAngles[idx]}
                         onChange={(e) => setServoInitialAngles(updateArrayValue(servoInitialAngles, idx, parseInt(e.target.value)))}
                  />
                  <div className="flex gap-2">
                    <input className="w-1/2 text-xs bg-neutral-100 dark:bg-neutral-700 rounded px-2 py-1"
                           type="number" min={0} max={180} value={servoMinAngles[idx]}
                           onChange={(e) => setServoMinAngles(updateArrayValue(servoMinAngles, idx, parseInt(e.target.value)))} />
                    <input className="w-1/2 text-xs bg-neutral-100 dark:bg-neutral-700 rounded px-2 py-1"
                           type="number" min={0} max={180} value={servoMaxAngles[idx]}
                           onChange={(e) => setServoMaxAngles(updateArrayValue(servoMaxAngles, idx, parseInt(e.target.value)))} />
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 text-xs bg-blue-500 text-white rounded px-2 py-1"
                            onClick={() => servoSet(idx, servoInitialAngles[idx])}>Test</button>
                    <button className="flex-1 text-xs bg-gray-200 dark:bg-neutral-600 rounded px-2 py-1"
                            onClick={() => servoLimit(idx, servoMinAngles[idx], servoMaxAngles[idx])}>Limit</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="text-xs bg-purple-500 text-white rounded px-3 py-1" onClick={() => servoInitAll(servoInitialAngles)}>Send All Initial Angles</button>
            <button className="text-xs bg-emerald-500 text-white rounded px-3 py-1" onClick={servoSave}>Save to Device</button>
            <button className="text-xs bg-gray-300 dark:bg-neutral-600 rounded px-3 py-1" onClick={servoLoad}>Load Device Config</button>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Default safe angles: min 10°, max 170°. Keep defaults if unsure.</p>
        </div>
      )}

      {isConnected && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Live Sensor Data</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-100 dark:bg-neutral-700 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Finger Bend</h4>
              {sensorData.fingers.map((value, index) => {
                // Convert raw sensor data (0-1023) to percentage (0-100%)
                const percentage = Math.min(100, Math.max(0, (value / 1023) * 100));
                const displayValue = Math.round(percentage);

                return (
                  <div key={index} className="flex items-center mb-2">
                    <span className="w-16">Finger {index + 1}:</span>
                    <div className="flex-1 ml-2">
                      <div className="w-full bg-gray-300 dark:bg-neutral-600 rounded-full h-2.5">
                        <div
                          className="bg-blue-600 dark:bg-blue-400 h-2.5 rounded-full transition-all duration-200"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                    <span className="w-12 text-right text-sm">{displayValue}%</span>
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
                        <span className="font-medium">{aiAnalysisData.parkinsonLevel} ({aiAnalysisData.parkinsonDescription})</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Confidence:</span>
                        <span className="font-medium">{aiAnalysisData.confidence.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Recommended Resistance:</span>
                        <span className="font-medium">{aiAnalysisData.recommendedResistance}°</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {aiAnalysisData.recommendation && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h4 className="font-medium mb-2 text-blue-800 dark:text-blue-200">Training Recommendation</h4>
                  <p className="text-blue-700 dark:text-blue-300">{aiAnalysisData.recommendation}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Training Confirmation Modal */}
      {showTrainingConfirm && (() => {
        const lv = Math.max(1, Math.min(5, aiAnalysisData.parkinsonLevel || 2));
        const rec = getRecommendedTraining(lv);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 w-full max-w-lg shadow-lg">
              <h4 className="text-lg font-semibold mb-2">Recommended Training</h4>
              <div className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                Detection result: <span className="font-semibold">Level {lv} &middot; {getLevelLabelZh(lv)}</span>
                {aiAnalysisData.confidence > 0 && (
                  <span className="ml-2 text-xs text-gray-500">(Confidence {aiAnalysisData.confidence.toFixed(0)}%)</span>
                )}
              </div>
              <div className="p-3 mb-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                  Recommended: {rec.modeLabel} &mdash; {rec.modeNameZh}
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                  Duration: {rec.durationSec} s &nbsp;&middot;&nbsp; Active servos: {rec.activeServos}
                </div>
                <div className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                  {rec.rationale}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button className="px-3 py-1 rounded bg-gray-200 dark:bg-neutral-700" onClick={() => setShowTrainingConfirm(false)}>Skip</button>
                <button
                  className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => {
                    sendCommand(rec.mode);
                    setShowTrainingConfirm(false);
                  }}
                >
                  Start {rec.mode}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}