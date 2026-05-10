'use client';

import { useEffect, useRef, useState } from 'react';
import { Moon, Sun, Monitor, Download, Upload, Trash2, AlertTriangle, Contrast } from 'lucide-react';
import { dataExportService } from '@/services/dataExportService';

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
      <span className="text-gray-700 dark:text-gray-300">{label}</span>
      <button
        type="button"
        aria-pressed={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-neutral-600'
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
  const [theme, setTheme] = useState<'system' | 'light' | 'dark' | 'high-contrast'>('system');
  const [notifications, setNotifications] = useState(true);
  const [vibration, setVibration] = useState(false);
  const [dataSharing, setDataSharing] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('steadigrip_theme') as 'system' | 'light' | 'dark' | 'high-contrast' | null;
    if (savedTheme) setTheme(savedTheme);
    else setTheme('system');
  }, []);

  const applyTheme = (newTheme: 'system' | 'light' | 'dark' | 'high-contrast') => {
    setTheme(newTheme);
    localStorage.setItem('steadigrip_theme', newTheme);

    const root = document.documentElement;
    root.classList.remove('dark', 'high-contrast');

    if (newTheme === 'dark') {
      root.classList.add('dark');
    } else if (newTheme === 'high-contrast') {
      root.classList.add('dark', 'high-contrast');
    } else if (newTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) root.classList.add('dark');
    }
  };

  const handleExportProfile = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    dataExportService.downloadBackup(`steadigrip-backup-${timestamp}.json`);
  };

  const handleImportProfile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const bundle = JSON.parse(content);
        const result = dataExportService.importBackup(bundle);
        
        if (result.errors.length > 0) {
          alert(`Import completed with errors:\n${result.errors.join('\n')}`);
        } else {
          alert(`Successfully imported ${result.imported.length} items. Please refresh the page.`);
          window.location.reload();
        }
      } catch (err) {
        alert('Failed to import profile. Invalid file format.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteProfile = () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    const keys = [
      'steadigrip_user_profile',
      'steadigrip_rehab_sessions',
      'steadigrip_rewards_state',
      'steadigrip_daily_quests',
      'steadigrip_achievements',
      'steadigrip_medals',
      'steadigrip_cards',
      'steadigrip_garden',
      'parkinson_analysis_records',
    ];
    
    keys.forEach(key => localStorage.removeItem(key));
    alert('Profile deleted. Redirecting to onboarding...');
    window.location.href = '/';
  };

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
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Theme</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => applyTheme('system')}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  theme === 'system'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-neutral-600'
                }`}
              >
                <Monitor size={20} className={theme === 'system' ? 'text-blue-500' : 'text-gray-600 dark:text-gray-400'} />
                <span className={`text-sm font-medium ${
                  theme === 'system' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                }`}>System</span>
              </button>
              <button
                onClick={() => applyTheme('light')}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  theme === 'light'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-neutral-600'
                }`}
              >
                <Sun size={20} className={theme === 'light' ? 'text-blue-500' : 'text-gray-600 dark:text-gray-400'} />
                <span className={`text-sm font-medium ${
                  theme === 'light' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                }`}>Light</span>
              </button>
              <button
                onClick={() => applyTheme('dark')}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  theme === 'dark'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-neutral-600'
                }`}
              >
                <Moon size={20} className={theme === 'dark' ? 'text-blue-500' : 'text-gray-600 dark:text-gray-400'} />
                <span className={`text-sm font-medium ${
                  theme === 'dark' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                }`}>Dark</span>
              </button>
              <button
                onClick={() => applyTheme('high-contrast')}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  theme === 'high-contrast'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-neutral-600'
                }`}
              >
                <Contrast size={20} className={theme === 'high-contrast' ? 'text-blue-500' : 'text-gray-600 dark:text-gray-400'} />
                <span className={`text-sm font-medium ${
                  theme === 'high-contrast' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                }`}>High Contrast</span>
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={20} className="text-red-500" />
            <h2 className="text-xl font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
          </div>
          <div className="space-y-3">
            <button
              onClick={handleExportProfile}
              className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-200 dark:border-neutral-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                  <Download size={18} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-gray-900 dark:text-white">Export Profile</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Download all your data as JSON</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-200 dark:border-neutral-700 hover:border-green-300 dark:hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition-colors">
                  <Upload size={18} className="text-green-600 dark:text-green-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-gray-900 dark:text-white">Import Profile</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Restore from a backup file</div>
                </div>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportProfile}
              className="hidden"
            />

            <button
              onClick={handleDeleteProfile}
              className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-red-200 dark:border-red-900/50 hover:border-red-400 dark:hover:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 group-hover:bg-red-200 dark:group-hover:bg-red-900/50 transition-colors">
                  <Trash2 size={18} className="text-red-600 dark:text-red-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-red-600 dark:text-red-400">
                    {showDeleteConfirm ? 'Click again to confirm deletion' : 'Erase Profile'}
                  </div>
                  <div className="text-xs text-red-500 dark:text-red-400/80">
                    {showDeleteConfirm ? 'This action cannot be undone!' : 'Permanently remove all your data'}
                  </div>
                </div>
              </div>
            </button>
            {showDeleteConfirm && (
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
