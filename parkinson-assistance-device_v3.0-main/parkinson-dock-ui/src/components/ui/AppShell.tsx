'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings as SettingsIcon, X } from 'lucide-react';
import { useConnectionState } from '@/hooks/useGlobalConnection';
import DeviceDashboard from '@/components/device/DeviceDashboard';
import SettingsPanel from '@/components/device/SettingsPanel';

interface DevicePanelCtx {
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  togglePanel: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
}

const Ctx = createContext<DevicePanelCtx | null>(null);

export function useDevicePanel(): DevicePanelCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Safe fallback for server render or stray usage — no-op
    return {
      panelOpen: false,
      setPanelOpen: () => {},
      togglePanel: () => {},
      settingsOpen: false,
      setSettingsOpen: () => {},
    };
  }
  return v;
}

/**
 * AppShell renders the global persistent UI (device side panel + settings modal)
 * once at the layout level so they survive page navigation. It also provides
 * the panel state to descendants via context.
 */
const MIN_WIDTH = 280;
const MAX_VW   = 0.70; // 70%
const DEFAULT_WIDTH = 400;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isConnected } = useConnectionState();
  const [panelOpen, setPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Notion-style split: push body content using a CSS variable for live width
  useEffect(() => {
    if (panelOpen && !isMobile) {
      document.body.style.setProperty('--panel-width', `${panelWidth}px`);
      document.body.classList.add('device-panel-open');
    } else {
      document.body.classList.remove('device-panel-open');
      document.body.style.removeProperty('--panel-width');
    }
    return () => {
      document.body.classList.remove('device-panel-open');
      document.body.style.removeProperty('--panel-width');
    };
  }, [panelOpen, isMobile, panelWidth]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.classList.add('panel-resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      const maxW = Math.floor(window.innerWidth * MAX_VW);
      const next = Math.min(maxW, Math.max(MIN_WIDTH, startWidth.current + delta));
      setPanelWidth(next);
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.classList.remove('panel-resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const ctx: DevicePanelCtx = {
    panelOpen,
    setPanelOpen,
    togglePanel: () => setPanelOpen(!panelOpen),
    settingsOpen,
    setSettingsOpen,
  };

  return (
    <Ctx.Provider value={ctx}>
      {children}

      {/* ── Device panel — desktop side panel (persists across pages) ── */}
      <AnimatePresence>
        {panelOpen && !isMobile && (
          <motion.div
            className="fixed top-0 right-0 bottom-0 z-30 flex flex-col bg-white dark:bg-neutral-900 border-l border-gray-200 dark:border-neutral-800"
            style={{ width: panelWidth }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Drag handle */}
            <div
              onMouseDown={onDragStart}
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 group"
            >
              <div className="absolute inset-y-0 left-0 w-1 group-hover:w-1.5 bg-transparent group-hover:bg-blue-400/60 transition-all duration-150" />
            </div>

            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-neutral-800 flex-shrink-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-400'}`} />
                Device
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DeviceDashboard variant="modal" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Device panel — mobile bottom sheet ── */}
      <AnimatePresence>
        {panelOpen && isMobile && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPanelOpen(false)}
            />
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-white dark:bg-neutral-900 rounded-t-2xl shadow-2xl"
              style={{ maxHeight: '80vh' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <div className="flex-shrink-0 flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex-1 flex justify-center">
                  <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-neutral-600" />
                </div>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <DeviceDashboard variant="sheet" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Settings modal ── */}
      <AnimatePresence>
        {settingsOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSettingsOpen(false)}
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            >
              <div className="pointer-events-auto w-full max-w-2xl max-h-[80vh] flex flex-col bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-neutral-800 flex-shrink-0">
                  <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                    <SettingsIcon size={16} />
                    Settings
                  </div>
                  <button
                    onClick={() => setSettingsOpen(false)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <SettingsPanel variant="embedded" />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
