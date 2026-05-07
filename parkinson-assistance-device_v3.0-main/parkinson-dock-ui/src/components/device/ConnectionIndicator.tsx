'use client';

import { useState, useEffect } from 'react';
import { useConnectionState } from '@/hooks/useGlobalConnection';

export interface ConnectionIndicatorProps {
  showDetails?: boolean;
  className?: string;
  lazy?: boolean; // whether to lazy load
}

export default function ConnectionIndicator({
  showDetails = false,
  className = '',
  lazy = true
}: ConnectionIndicatorProps) {
  const [isLoaded, setIsLoaded] = useState(!lazy);
  const { isConnected, connectionType, deviceName, refreshState } = useConnectionState();

  // Lazy load to avoid blocking page render
  useEffect(() => {
    if (lazy) {
      const timer = setTimeout(() => {
        setIsLoaded(true);
      }, 500); // delay 500ms before loading

      return () => clearTimeout(timer);
    }
  }, [lazy]);

  if (!isLoaded) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
        <span className="text-sm text-gray-400">Loading...</span>
      </div>
    );
  }

  if (!showDetails) {
    // Simple status indicator
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div 
          className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}
          title={isConnected ? 'Device Connected' : 'Device Not Connected'}
        />
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {isConnected ? 'Connected' : 'Not Connected'}
        </span>
      </div>
    );
  }

  // Detailed status display
  return (
    <div className={`bg-white dark:bg-neutral-800 rounded-lg p-3 shadow-sm ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <div>
            <div className="text-sm font-medium">
              {isConnected ? 'Device Connected' : 'Device Not Connected'}
            </div>
            {isConnected && connectionType && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {connectionType === 'serial' ? 'Serial Connection' : 'Bluetooth Connection'}
                {deviceName && ` - ${deviceName}`}
              </div>
            )}
          </div>
        </div>
        
        <button
          onClick={refreshState}
          className="text-xs text-blue-500 hover:text-blue-600 underline"
          title="Refresh connection status"
        >
          Refresh
        </button>
      </div>
      
      {isConnected && (
        <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs text-green-700 dark:text-green-300">
          ✓ Connection state synchronized across all pages
        </div>
      )}
    </div>
  );
}
