'use client';

import { useState } from 'react';
import HandModel from './HandModel';
import SimpleHand3D from './SimpleHand3D';
import GlobalConnector from './GlobalConnector';
import { SensorData } from '@/utils/bluetoothManager';
import { MousePointer, Move3d } from 'lucide-react';

interface SensorDataForDisplay {
  fingerBend?: number[];
  accelerometer?: { x: number; y: number; z: number };
  gyroscope?: { x: number; y: number; z: number };
  magnetometer?: { x: number; y: number; z: number };
}

export interface DeviceDashboardProps {
  /**
   * Visual variant.
   * - `page`: full page layout (used by `/device` route).
   * - `modal`: padded layout for a desktop modal/dialog.
   * - `sheet`: vertical-stacked layout for an iOS-style bottom sheet.
   */
  variant?: 'page' | 'modal' | 'sheet';
}

/**
 * The device dashboard previously inlined inside `/app/device/page.tsx`.
 *
 * Extracted so it can be rendered in three contexts: the dedicated
 * `/device` route, a desktop floating modal, or a mobile bottom sheet.
 */
export default function DeviceDashboard({ variant = 'page' }: DeviceDashboardProps) {
  const [sensorData, setSensorData] = useState<any>(null);
  const [controlMode, setControlMode] = useState<'mouse' | 'imu'>('mouse');

  const handleDataReceived = (data: Partial<SensorData>) => {
    setSensorData((prev: any) => ({ ...(prev || {}), ...(data || {}) }));
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('sensorData', JSON.stringify(data));
    }
  };

  const fingerBend = sensorData?.fingers || [0, 0, 0, 0, 0];

  const rotation = sensorData?.accel
    ? {
        x: Math.atan2(sensorData.accel.y, sensorData.accel.z),
        y: Math.atan2(
          -sensorData.accel.x,
          Math.sqrt(
            sensorData.accel.y * sensorData.accel.y +
              sensorData.accel.z * sensorData.accel.z,
          ),
        ),
        z: 0,
      }
    : { x: 0, y: 0, z: 0 };

  const displayData: SensorDataForDisplay = {
    fingerBend: sensorData?.fingers,
    accelerometer: sensorData?.accel,
    gyroscope: sensorData?.gyro,
    magnetometer: sensorData?.mag,
  };

  const toggleControlMode = () =>
    setControlMode((p) => (p === 'mouse' ? 'imu' : 'mouse'));

  const testSensorData = () => {
    handleDataReceived({
      fingers: [200, 300, 400, 500, 600],
      accel: { x: 0.1, y: 0.2, z: 0.9 },
      gyro: { x: 0.05, y: -0.1, z: 0.02 },
      mag: { x: 0, y: 0, z: 0 },
      emg: 100,
    });
  };

  const containerClass =
    variant === 'page'
      ? 'container mx-auto py-6 px-4 flex flex-col gap-6'
      : 'p-4 sm:p-6 flex flex-col gap-6';

  const isSheet = variant === 'sheet';
  const gridClass = isSheet
    ? 'grid grid-cols-1 gap-4'
    : 'grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1';
  const handModelColSpan = isSheet ? '' : 'lg:col-span-2';
  const modelHeight = isSheet ? 'h-[380px]' : 'h-[500px]';

  return (
    <div className={containerClass}>
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={testSensorData}
            className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition text-sm"
          >
            🧪 Test Data
          </button>
          <div className="text-xs sm:text-sm text-gray-500">
            {sensorData ? 'Connected' : 'Disconnected'} | X:
            {rotation.x.toFixed(2)} Y:{rotation.y.toFixed(2)} | {controlMode}
          </div>
        </div>
      </div>

      <div>
        <GlobalConnector
          onDataReceived={handleDataReceived}
          showSensorData
          showConnectionControls
          compact={false}
        />
      </div>

      <div className={gridClass}>
        <div
          className={`bg-gray-100 dark:bg-neutral-800 rounded-lg p-4 ${modelHeight} ${handModelColSpan}`}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">3D Hand Model Control</h2>
            <button
              onClick={toggleControlMode}
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
                rotation:
                  controlMode === 'imu' ? rotation : { x: 0, y: 0, z: 0 },
              }}
            />
          </div>
        </div>

        <div className="bg-gray-100 dark:bg-neutral-800 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Real-time Sensor Data</h2>

          <div className="mb-4 p-3 bg-white dark:bg-gray-700 rounded">
            <h3 className="font-medium mb-2">Debug Info</h3>
            <div className="text-sm space-y-1">
              <div>
                Connection Status: {sensorData ? 'Connected' : 'Disconnected'}
              </div>
              {sensorData?.fingers && (
                <>
                  <div>Finger Data (Raw): [{sensorData.fingers.join(', ')}]</div>
                  <div>
                    Finger Data (%): [
                    {sensorData.fingers
                      .map((v: number) => Math.round((v / 1023) * 100))
                      .join('%, ')}
                    %]
                  </div>
                </>
              )}
              {sensorData?.accel && (
                <div>
                  Accel: X:{sensorData.accel.x.toFixed(2)}, Y:
                  {sensorData.accel.y.toFixed(2)}, Z:
                  {sensorData.accel.z.toFixed(2)}
                </div>
              )}
              {sensorData?.gyro && (
                <div>
                  Gyro: X:{sensorData.gyro.x.toFixed(2)}, Y:
                  {sensorData.gyro.y.toFixed(2)}, Z:
                  {sensorData.gyro.z.toFixed(2)}
                </div>
              )}
              <div>
                Rotation: X:{rotation.x.toFixed(2)}, Y:
                {rotation.y.toFixed(2)}, Z:{rotation.z.toFixed(2)}
              </div>
              <div>Control Mode: {controlMode}</div>
            </div>
          </div>

          <HandModel sensorData={displayData} />
        </div>
      </div>
    </div>
  );
}
