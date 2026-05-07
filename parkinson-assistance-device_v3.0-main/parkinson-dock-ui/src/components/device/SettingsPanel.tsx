'use client';

import { useState } from 'react';

export interface SettingsPanelProps {
  /**
   * Visual variant matching the host context.
   * - `page`: full page layout (used by `/settings` route).
   * - `embedded`: tighter padding for use inside the floating dashboard panel.
   */
  variant?: 'page' | 'embedded';
}

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}

function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <span>{label}</span>
      <button
        type="button"
        aria-pressed={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          checked ? 'bg-blue-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
            checked ? 'left-7' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
}

/**
 * Reusable settings UI shared by `/settings` and the floating dashboard panel.
 */
export default function SettingsPanel({ variant = 'page' }: SettingsPanelProps) {
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [vibration, setVibration] = useState(false);
  const [dataSharing, setDataSharing] = useState(true);

  const wrapperClass =
    variant === 'page'
      ? 'container mx-auto py-12 max-w-3xl'
      : 'p-4 sm:p-6 max-w-3xl mx-auto w-full';

  return (
    <div className={wrapperClass}>
      {variant === 'page' && (
        <h1 className="text-3xl font-bold text-center mb-8">System Settings</h1>
      )}

      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-neutral-700">
          <h2 className="text-xl font-semibold mb-4">Appearance</h2>
          <Toggle checked={darkMode} onChange={setDarkMode} label="Dark Mode" />
        </div>

        <div className="p-6 border-b border-gray-200 dark:border-neutral-700">
          <h2 className="text-xl font-semibold mb-4">Notifications</h2>
          <Toggle
            checked={notifications}
            onChange={setNotifications}
            label="Enable Notifications"
          />
          <Toggle
            checked={vibration}
            onChange={setVibration}
            label="Vibration Alerts"
          />
        </div>

        <div className="p-6 border-b border-gray-200 dark:border-neutral-700">
          <h2 className="text-xl font-semibold mb-4">Data & Privacy</h2>
          <Toggle
            checked={dataSharing}
            onChange={setDataSharing}
            label="Share Anonymous Data"
          />
        </div>

        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Account</h2>
          <div className="flex items-center justify-between py-3">
            <span>Logout</span>
            <button className="text-blue-500 hover:text-blue-700">
              Click to Logout
            </button>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-red-500">Delete Account</span>
            <button className="text-red-500 hover:text-red-700">
              Permanently Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
