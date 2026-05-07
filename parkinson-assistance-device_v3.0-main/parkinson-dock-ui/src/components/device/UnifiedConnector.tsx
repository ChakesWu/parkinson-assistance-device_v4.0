'use client';

import { useState, useEffect } from 'react';
import ArduinoConnector from './ArduinoConnector';
import BluetoothConnector from './BluetoothConnector';

interface SensorData {
  fingers: number[];
  accel: { x: number; y: number; z: number };
  gyro: { x: number; y: number; z: number };
  mag: { x: number; y: number; z: number };
  emg?: number;
}

export interface UnifiedConnectorProps {
  onDataReceived?: (data: Partial<SensorData>) => void;
}

type ConnectionMode = 'serial' | 'bluetooth';

export default function UnifiedConnector({ onDataReceived }: UnifiedConnectorProps) {
  // Default to Bluetooth, for Android Chrome compatibility
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('bluetooth');
  const [isAnyConnected, setIsAnyConnected] = useState(false);
  const [browserSupport, setBrowserSupport] = useState({
    serial: false,
    bluetooth: false
  });

  // Check browser support
  useEffect(() => {
    const checkSupport = () => {
      const serialSupported = typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serial' in navigator;
      const bluetoothSupported = typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'bluetooth' in navigator;

      setBrowserSupport({
        serial: serialSupported,
        bluetooth: bluetoothSupported
      });

      // If the current mode is not supported, automatically switch to a supported mode
      if (connectionMode === 'serial' && !serialSupported && bluetoothSupported) {
        setConnectionMode('bluetooth');
      } else if (connectionMode === 'bluetooth' && !bluetoothSupported && serialSupported) {
        setConnectionMode('serial');
      }
    };

    checkSupport();
  }, [connectionMode]);

  // Handle data received
  const handleDataReceived = (data: Partial<SensorData>) => {
    onDataReceived?.(data);
  };

  // Switch connection mode
  const switchConnectionMode = (mode: ConnectionMode) => {
    if (isAnyConnected) {
      alert('Please disconnect the current connection before switching modes.');
      return;
    }

    if (mode === 'serial' && !browserSupport.serial) {
      alert('Your browser does not support serial connection. Please use Chrome or Edge.');
      return;
    }

    if (mode === 'bluetooth' && !browserSupport.bluetooth) {
      alert('Your browser does not support Bluetooth connection. Please use Chrome or Edge.');
      return;
    }

    setConnectionMode(mode);
  };

  // Monitor connection state changes
  const handleConnectionStatusChange = (connected: boolean) => {
    setIsAnyConnected(connected);
  };

  return (
    <div className="space-y-6">
      {/* Connection mode selector */}
      <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-4">Select Connection Method</h3>
        
        <div className="flex space-x-4 mb-4">
          <button
            onClick={() => switchConnectionMode('serial')}
            disabled={!browserSupport.serial || isAnyConnected}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              connectionMode === 'serial'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            } ${
              !browserSupport.serial || isAnyConnected
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
          >
            Serial Connection
            {!browserSupport.serial && (
              <span className="ml-2 text-xs">(Not Supported)</span>
            )}
          </button>
          
          <button
            onClick={() => switchConnectionMode('bluetooth')}
            disabled={!browserSupport.bluetooth || isAnyConnected}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              connectionMode === 'bluetooth'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            } ${
              !browserSupport.bluetooth || isAnyConnected
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
          >
            Bluetooth Connection
            {!browserSupport.bluetooth && (
              <span className="ml-2 text-xs">(Not Supported)</span>
            )}
          </button>
        </div>

        {/* Browser support status notice */}
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${browserSupport.serial ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span>Serial Connection: {browserSupport.serial ? 'Supported' : 'Not Supported'}</span>
            </div>
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-2 ${browserSupport.bluetooth ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span>Bluetooth Connection: {browserSupport.bluetooth ? 'Supported' : 'Not Supported'}</span>
            </div>
          </div>
          
          {(!browserSupport.serial || !browserSupport.bluetooth) && (
            <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-yellow-800 dark:text-yellow-200">
                We recommend Chrome 89+ or Edge 89+ for full feature support.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Connector component */}
      {connectionMode === 'serial' ? (
        <div>
          <ArduinoConnector 
            onDataReceived={handleDataReceived}
          />
        </div>
      ) : (
        <div>
          <BluetoothConnector 
            onDataReceived={handleDataReceived}
          />
        </div>
      )}

      {/* Connection state listener */}
      <div className="hidden">
        {connectionMode === 'serial' && (
          <ArduinoConnector 
            onDataReceived={(data) => {
              handleDataReceived(data);
              // connection status monitoring logic can be added here
            }}
          />
        )}
        {connectionMode === 'bluetooth' && (
          <BluetoothConnector 
            onDataReceived={(data) => {
              handleDataReceived(data);
              // connection status monitoring logic can be added here
            }}
          />
        )}
      </div>
    </div>
  );
}
