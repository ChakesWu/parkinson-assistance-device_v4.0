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

// 定义传感器数据类型以匹配HandModel的期望
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

    // 保存到localStorage供调试页面使用
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('sensorData', JSON.stringify(data));
    }

    // 调试信息：显示接收到的数据
    if (data.fingers) {
      console.log('👆 手指数据:', data.fingers);
    }
    if (data.accel) {
      console.log('📱 加速度计数据:', data.accel);
    }
    if (data.gyro) {
      console.log('🌀 陀螺仪数据:', data.gyro);
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

  // 准备传递给SimpleHand3D的数据
  const fingerBend = sensorData?.fingers || [0, 0, 0, 0, 0];

  // 将 IMU 加速度计数据转换为旋转角度（弧度）
  const rotation = sensorData?.accel ? {
    x: Math.atan2(sensorData.accel.y, sensorData.accel.z), // 绕 X 轴旋转
    y: Math.atan2(-sensorData.accel.x, Math.sqrt(sensorData.accel.y * sensorData.accel.y + sensorData.accel.z * sensorData.accel.z)), // 绕 Y 轴旋转
    z: 0 // 绕 Z 轴旋转（可以使用陀螺仪数据）
  } : { x: 0, y: 0, z: 0 };

  // 准备传递给HandModel的数据（使用正确的属性名）
  const displayData: SensorDataForDisplay = {
    fingerBend: sensorData?.fingers,
    accelerometer: sensorData?.accel,
    gyroscope: sensorData?.gyro,
    magnetometer: sensorData?.mag
  };

  const toggleControlMode = () => {
    setControlMode(prevMode => prevMode === 'mouse' ? 'imu' : 'mouse');
  };

  // 测试函数：模拟传感器数据
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
          <h1 className="text-2xl font-bold">数据台</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={testSensorData}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition text-sm"
            >
              🧪 测试数据
            </button>
            <div className="text-sm text-gray-500">
              连接状态: {sensorData ? '已连接' : '未连接'} |
              旋转角度: X:{rotation.x.toFixed(3)}, Y:{rotation.y.toFixed(3)}, Z:{rotation.z.toFixed(3)} |
              控制模式: {controlMode}
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
              <h2 className="text-xl font-semibold">3D手部模型控制</h2>
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
                    鼠标控制
                  </>
                ) : (
                  <>
                    <Move3d size={18} className="mr-2" />
                    IMU控制
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
            <h2 className="text-xl font-semibold mb-4">实时传感器数据</h2>

            {/* 调试信息显示 */}
            <div className="mb-4 p-3 bg-white dark:bg-gray-700 rounded">
              <h3 className="font-medium mb-2">调试信息</h3>
              <div className="text-sm space-y-1">
                <div>连接状态: {sensorData ? '已连接' : '未连接'}</div>
                {sensorData?.fingers && (
                  <div>
                    <div>手指数据 (原始): [{sensorData.fingers.join(', ')}]</div>
                    <div>手指数据 (百分比): [{sensorData.fingers.map((v: number) => Math.round((v / 1023) * 100)).join('%, ')}%]</div>
                  </div>
                )}
                {sensorData?.accel && (
                  <div>加速度计: X:{sensorData.accel.x.toFixed(3)}, Y:{sensorData.accel.y.toFixed(3)}, Z:{sensorData.accel.z.toFixed(3)}</div>
                )}
                {sensorData?.gyro && (
                  <div>陀螺仪: X:{sensorData.gyro.x.toFixed(3)}, Y:{sensorData.gyro.y.toFixed(3)}, Z:{sensorData.gyro.z.toFixed(3)}</div>
                )}
                <div>旋转角度: X:{rotation.x.toFixed(3)}, Y:{rotation.y.toFixed(3)}, Z:{rotation.z.toFixed(3)}</div>
                <div>控制模式: {controlMode}</div>
              </div>
            </div>

            <HandModel sensorData={displayData} />
          </div>
        </div>

        {/* 添加悬浮动态按钮 */}
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
          <AnimatedDock items={dockItems} />
        </div>
      </div>
    </div>
  );
};