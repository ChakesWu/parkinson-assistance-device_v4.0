'use client';

import { useState } from 'react';
import {
  Bluetooth,
  ChevronDown,
  Cable,
  MousePointer,
  Move3d,
  Power,
  Activity,
  AlertCircle,
} from 'lucide-react';
import SimpleHand3D from './SimpleHand3D';
import { useGlobalConnection } from '@/hooks/useGlobalConnection';
import type { SensorData } from '@/utils/bluetoothManager';

export interface DeviceDashboardProps {
  /**
   * Visual variant.
   * - `page`: full-page layout (used by `/device` route).
   * - `modal`: padded layout for desktop split panel.
   * - `sheet`: stacked layout for mobile bottom sheet.
   */
  variant?: 'page' | 'modal' | 'sheet';
}

const FINGER_LABELS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

export default function DeviceDashboard({ variant = 'page' }: DeviceDashboardProps) {
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [controlMode, setControlMode] = useState<'mouse' | 'imu'>('mouse');
  const [motionExpanded, setMotionExpanded] = useState(true);

  const handleData = (data: SensorData) => {
    setSensorData((prev) => ({ ...(prev ?? {} as SensorData), ...data }));
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('sensorData', JSON.stringify(data)); } catch { /* ok */ }
    }
  };

  const {
    isConnected,
    connectionType,
    deviceName,
    browserSupport,
    connectBluetooth,
    connectSerial,
    disconnect,
    isConnecting,
    error,
    clearError,
  } = useGlobalConnection({ onDataReceived: handleData });

  const fingers = sensorData?.fingers ?? [0, 0, 0, 0, 0];
  const accel = sensorData?.accel;
  const gyro = sensorData?.gyro;

  const rotation = accel
    ? {
        x: Math.atan2(accel.y, accel.z),
        y: Math.atan2(-accel.x, Math.sqrt(accel.y * accel.y + accel.z * accel.z)),
        z: 0,
      }
    : { x: 0, y: 0, z: 0 };

  const isPage = variant === 'page';
  const containerClass = isPage
    ? 'max-w-5xl mx-auto px-6 py-8 space-y-5'
    : 'p-4 sm:p-5 space-y-4';
  const modelHeight = isPage ? 'h-[480px]' : 'h-[300px]';

  return (
    <div className={containerClass}>
      {/* ── Connection bar ── */}
      <section className="bg-white dark:bg-neutral-800 rounded-2xl border border-gray-200 dark:border-neutral-700 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`relative flex h-2.5 w-2.5 flex-shrink-0`}>
              {isConnected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isConnected ? 'bg-green-500' : isConnecting ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-neutral-600'
                }`}
              />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {isConnecting
                  ? 'Connecting…'
                  : isConnected
                    ? `Connected · ${connectionType === 'serial' ? 'Serial' : 'Bluetooth'}`
                    : 'No device'}
              </div>
              {deviceName && (
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{deviceName}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isConnected ? (
              <>
                <button
                  onClick={connectSerial}
                  disabled={isConnecting || !browserSupport.serial}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <Cable size={14} />
                  Serial
                </button>
                <button
                  onClick={connectBluetooth}
                  disabled={isConnecting || !browserSupport.bluetooth}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <Bluetooth size={14} />
                  Bluetooth
                </button>
              </>
            ) : (
              <button
                onClick={disconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
              >
                <Power size={14} />
                Disconnect
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={clearError} className="text-xs underline whitespace-nowrap">Dismiss</button>
          </div>
        )}
      </section>

      {/* ── 3D hand model ── */}
      <section className="relative bg-gradient-to-br from-gray-100 to-gray-50 dark:from-neutral-800 dark:to-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
        {/* Mode toggle — overlaid */}
        <div className="absolute top-3 right-3 z-10">
          <div className="inline-flex bg-white/90 dark:bg-neutral-900/90 backdrop-blur rounded-lg p-0.5 shadow-sm border border-gray-200 dark:border-neutral-700">
            <button
              onClick={() => setControlMode('mouse')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                controlMode === 'mouse'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <MousePointer size={12} />
              Mouse
            </button>
            <button
              onClick={() => setControlMode('imu')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                controlMode === 'imu'
                  ? 'bg-purple-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Move3d size={12} />
              IMU
            </button>
          </div>
        </div>

        {/* Label */}
        <div className="absolute top-3 left-3 z-10 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide pointer-events-none">
          3D Hand Model
        </div>

        <div className={`w-full ${modelHeight}`}>
          <SimpleHand3D
            sensorData={
              sensorData
                ? {
                    fingers,
                    rotation: controlMode === 'imu' ? rotation : { x: 0, y: 0, z: 0 },
                  }
                : null
            }
          />
        </div>
      </section>

      {/* ── Finger bend ── */}
      <section className="bg-white dark:bg-neutral-800 rounded-2xl border border-gray-200 dark:border-neutral-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Finger Bend</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">% of full flex</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {FINGER_LABELS.map((label, i) => {
            const raw = fingers[i] ?? 0;
            const pct = Math.max(0, Math.min(100, Math.round((raw / 1023) * 100)));
            return (
              <div key={label} className="flex flex-col items-center">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
                <div className="w-full h-1.5 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#004E80] rounded-full transition-all duration-150"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                  {pct}%
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Motion sensors (collapsible) ── */}
      <section className="bg-white dark:bg-neutral-800 rounded-2xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <button
          onClick={() => setMotionExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-neutral-700/50 transition"
        >
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Motion Sensors</span>
          </div>
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${motionExpanded ? 'rotate-180' : ''}`}
          />
        </button>
        {motionExpanded && (
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            <SensorTriad label="Accelerometer" data={accel} />
            <SensorTriad label="Gyroscope" data={gyro} />
            <SensorTriad label="Rotation (rad)" data={rotation} />
            {sensorData?.emg !== undefined && (
              <div className="col-span-2 sm:col-span-1 bg-gray-50 dark:bg-neutral-900 rounded-xl p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">EMG</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums">
                  {sensorData.emg.toFixed(0)}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SensorTriad({
  label,
  data,
}: {
  label: string;
  data?: { x: number; y: number; z: number };
}) {
  const fmt = (v?: number) => (v === undefined ? '—' : v.toFixed(2));
  return (
    <div className="bg-gray-50 dark:bg-neutral-900 rounded-xl p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">{label}</div>
      <div className="grid grid-cols-3 gap-1.5 text-xs">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <div key={axis} className="flex flex-col">
            <span className="text-gray-400 dark:text-gray-500 uppercase text-[10px]">{axis}</span>
            <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
              {fmt(data?.[axis])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
