'use client';
import HandModel from '@/components/device/HandModel';
import SimpleHand3D from '@/components/device/SimpleHand3D';
import GlobalConnector from '@/components/device/GlobalConnector';
import { useConnectionState } from '@/hooks/useGlobalConnection';
import { SensorData } from '@/utils/bluetoothManager';

import { AnimatedDock } from "@/components/ui/animated-dock";
import { Home, Activity, Book, Brain, Settings, MousePointer, Move3d, Gamepad2 } from 'lucide-react';
import { useState } from 'react';
import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { analysisRecordService } from '@/services/analysisRecordService';

// Define sensor data type to match HandModel expectations
interface SensorDataForDisplay {
  fingerBend?: number[];
  accelerometer?: { x: number; y: number; z: number };
  gyroscope?: { x: number; y: number; z: number };
  magnetometer?: { x: number; y: number; z: number };
}

export default function DevicePage() {
  const [sensorData, setSensorData] = useState<any>(null);
  const [controlMode, setControlMode] = useState<'mouse' | 'imu'>('mouse');

  const [activeTab, setActiveTab] = useState<'dashboard' | 'debug' | 'settings' | 'monitor' | 'analysis'>('dashboard');

  const handleDataReceived = (data: Partial<SensorData>) => {
    console.log('🔄 Device page received sensor data:', data);
    setSensorData((prev: any) => {
      const newData = { ...(prev || {}), ...(data || {}) };
      console.log('📊 Updated sensor data state:', newData);
      return newData;
    });

    // Save to localStorage for debug page use
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('sensorData', JSON.stringify(data));
    }

    // Debug info: display received data
    if (data.fingers) {
      console.log('👆 Finger data:', data.fingers);
    }
    if (data.accel) {
      console.log('📱 Accelerometer data:', data.accel);
    }
    if (data.gyro) {
      console.log('🌀 Gyroscope data:', data.gyro);
    }
  };



  const dockItems = [
    {
      link: "/",
      Icon: <Home size={22} />,
    },
    {
      link: "/device",
      Icon: <Activity size={22} />,
    },
    {
      link: "/rehab-game",
      Icon: <Gamepad2 size={22} />,
    },
    {
      link: "/records",
      Icon: <Book size={22} />,
    },
    {
      link: "/ai-analysis",
      Icon: <Brain size={22} />,
    },
    {
      link: "/settings",
      Icon: <Settings size={22} />,
    }
  ];

  // Prepare data to pass to SimpleHand3D
  const fingerBend = sensorData?.fingers || [0, 0, 0, 0, 0];

  // Convert IMU accelerometer data to rotation angles (radians)
  const rotation = sensorData?.accel ? {
    x: Math.atan2(sensorData.accel.y, sensorData.accel.z), // Rotation around X axis
    y: Math.atan2(-sensorData.accel.x, Math.sqrt(sensorData.accel.y * sensorData.accel.y + sensorData.accel.z * sensorData.accel.z)), // Rotation around Y axis
    z: 0 // Rotation around Z axis (can use gyroscope data)
  } : { x: 0, y: 0, z: 0 };

  // Prepare data to pass to HandModel (using correct property names)
  const displayData: SensorDataForDisplay = {
    fingerBend: sensorData?.fingers,
    accelerometer: sensorData?.accel,
    gyroscope: sensorData?.gyro,
    magnetometer: sensorData?.mag
  };

  const toggleControlMode = () => {
    setControlMode(prevMode => prevMode === 'mouse' ? 'imu' : 'mouse');
  };

  // Test function: simulate sensor data
  const testSensorData = () => {
    const testData = {
      fingers: [200, 300, 400, 500, 600],
      accel: { x: 0.1, y: 0.2, z: 0.9 },
      gyro: { x: 0.05, y: -0.1, z: 0.02 },
      mag: { x: 0, y: 0, z: 0 },
      emg: 100
    };
    console.log('🧪 Testing with simulated data:', testData);
    handleDataReceived(testData);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-900">
      <Dashboard
        sensorData={sensorData}
        controlMode={controlMode}
        onDataReceived={handleDataReceived}
        onToggleControlMode={toggleControlMode}
        fingerBend={fingerBend}
        rotation={rotation}
        displayData={displayData}
        dockItems={dockItems}
        testSensorData={testSensorData}
      />
    </div>
  );
}



// Dashboard component with all original device functionality
const Dashboard = ({
  sensorData,
  controlMode,
  onDataReceived,
  onToggleControlMode,
  fingerBend,
  rotation,
  displayData,
  dockItems,
  testSensorData
}: {
  sensorData: any;
  controlMode: 'mouse' | 'imu';
  onDataReceived: (data: Partial<SensorData>) => void;
  onToggleControlMode: () => void;
  fingerBend: number[];
  rotation: { x: number; y: number; z: number };
  displayData: SensorDataForDisplay;
  dockItems: any[];
  testSensorData: () => void;
}) => {
  return (
    <div className="min-h-screen relative">
      <div className="container mx-auto py-6 px-4 flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={testSensorData}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition text-sm"
            >
              🧪 Test Data
            </button>
            <div className="text-sm text-gray-500">
              Connection Status: {sensorData ? 'Connected' : 'Disconnected'} |
              Rotation Angle: X:{rotation.x.toFixed(3)}, Y:{rotation.y.toFixed(3)}, Z:{rotation.z.toFixed(3)} |
              Control Mode: {controlMode}
            </div>
          </div>
        </div>

        <div className="mb-4">
          <GlobalConnector
            onDataReceived={onDataReceived}
            showSensorData={true}
            showConnectionControls={true}
            compact={false}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
          <div className="bg-gray-100 dark:bg-neutral-800 rounded-lg p-4 lg:col-span-2 h-[500px]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">3D Hand Model Control</h2>
              <button
                onClick={onToggleControlMode}
                className={`flex items-center px-4 py-2 rounded-full transition ${
                  controlMode === 'mouse'
                    ? 'bg-blue-500 text-white'
                    : 'bg-purple-500 text-white'
                }`}
              >
                {controlMode === 'mouse' ? (
                  <>
                    <MousePointer size={18} className="mr-2" />
                    Mouse Control
                  </>
                ) : (
                  <>
                    <Move3d size={18} className="mr-2" />
                    IMU Control
                  </>
                )}
              </button>
            </div>

            <div className="w-full h-[calc(100%-60px)]">
              <SimpleHand3D
                sensorData={{
                  fingers: fingerBend,
                  rotation: controlMode === 'imu' ? rotation : { x:0, y:0, z:0 }
                }}
              />
            </div>
          </div>

          <div className="bg-gray-100 dark:bg-neutral-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">Real-time Sensor Data</h2>

            {/* Debug information display */}
            <div className="mb-4 p-3 bg-white dark:bg-gray-700 rounded">
              <h3 className="font-medium mb-2">Debug Info</h3>
              <div className="text-sm space-y-1">
                <div>Connection Status: {sensorData ? 'Connected' : 'Disconnected'}</div>
                {sensorData?.fingers && (
                  <div>
                    <div>Finger Data (Raw): [{sensorData.fingers.join(', ')}]</div>
                    <div>Finger Data (Percentage): [{sensorData.fingers.map((v: number) => Math.round((v / 1023) * 100)).join('%, ')}%]</div>
                  </div>
                )}
                {sensorData?.accel && (
                  <div>Accelerometer: X:{sensorData.accel.x.toFixed(3)}, Y:{sensorData.accel.y.toFixed(3)}, Z:{sensorData.accel.z.toFixed(3)}</div>
                )}
                {sensorData?.gyro && (
                  <div>Gyroscope: X:{sensorData.gyro.x.toFixed(3)}, Y:{sensorData.gyro.y.toFixed(3)}, Z:{sensorData.gyro.z.toFixed(3)}</div>
                )}
                <div>Rotation Angle: X:{rotation.x.toFixed(3)}, Y:{rotation.y.toFixed(3)}, Z:{rotation.z.toFixed(3)}</div>
                <div>Control Mode: {controlMode}</div>
              </div>
            </div>

            <HandModel sensorData={displayData} />
          </div>
        </div>

        {/* Add floating dynamic buttons */}
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
          <AnimatedDock items={dockItems} />
        </div>
      </div>
    </div>
  );
};