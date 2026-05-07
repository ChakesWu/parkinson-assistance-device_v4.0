'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, PanInfo, motion } from 'framer-motion';
import { Activity, Settings as SettingsIcon, X } from 'lucide-react';
import DeviceDashboard from './DeviceDashboard';
import SettingsPanel from './SettingsPanel';
import { useConnectionState } from '@/hooks/useGlobalConnection';

type PanelTab = 'device' | 'settings';

const MOBILE_BREAKPOINT_PX = 768;

/**
 * Notion-AI / iOS-style floating ball that expands the entire device dashboard.
 *
 * - Collapsed: a small floating ball in the bottom-right of the viewport with
 *   a live connection-status dot.
 * - Expanded (desktop, viewport ≥ 768px): centered modal with a blurred
 *   backdrop hosting the full {@link DeviceDashboard}.
 * - Expanded (mobile, viewport < 768px): an iOS-style bottom sheet with a
 *   drag handle, swipe-down to dismiss.
 *
 * Auto-hides on the `/device` route to avoid double-mounting the dashboard.
 */
export default function FloatingDevicePanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>('device');
  const [isMobile, setIsMobile] = useState(false);
  const { isConnected } = useConnectionState();
  const pathname = usePathname();

  // Track viewport size to decide modal vs. bottom sheet.
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Don't render the floating ball on routes that already render this content
  // inline (avoids double-mounting the GlobalConnector / duplicate UI).
  if (pathname === '/device' || pathname === '/settings') return null;

  const handleSheetDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (info.offset.y > 120 || info.velocity.y > 600) setOpen(false);
  };

  return (
    <>
      {/* Floating ball (collapsed state) */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="ball"
            type="button"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 360, damping: 22 }}
            aria-label="Open device dashboard"
            className="fixed bottom-24 right-6 z-[60] h-14 w-14 rounded-full shadow-xl flex items-center justify-center text-white bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 print:hidden"
          >
            <Activity className="h-6 w-6" />
            <span
              className={`absolute top-1 right-1 h-3 w-3 rounded-full border-2 border-white dark:border-neutral-900 ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            {isConnected && (
              <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-blue-400/60 animate-ping" />
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Backdrop + expanded panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-md"
            />

            {isMobile ? (
              <motion.div
                key="sheet"
                role="dialog"
                aria-modal="true"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.4 }}
                onDragEnd={handleSheetDragEnd}
                className="fixed inset-x-0 bottom-0 z-[71] max-h-[92vh] rounded-t-3xl bg-white dark:bg-neutral-900 shadow-2xl flex flex-col"
              >
                <div className="flex flex-col items-center pt-3 pb-1 cursor-grab active:cursor-grabbing select-none">
                  <div className="h-1.5 w-10 rounded-full bg-gray-300 dark:bg-neutral-700" />
                </div>
                <div className="flex items-center justify-between px-4 pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isConnected ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {tab === 'device' ? 'Device Dashboard' : 'Settings'}
                    </h2>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-neutral-800"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <Tabs tab={tab} onChange={setTab} />
                <div className="flex-1 overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom),1.25rem)]">
                  {tab === 'device' ? (
                    <DeviceDashboard variant="sheet" />
                  ) : (
                    <SettingsPanel variant="embedded" />
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="modal"
                role="dialog"
                aria-modal="true"
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className="fixed left-1/2 top-1/2 z-[71] -translate-x-1/2 -translate-y-1/2 w-[min(95vw,1200px)] max-h-[90vh] rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-neutral-700">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isConnected ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {tab === 'device' ? 'Device Dashboard' : 'Settings'}
                    </h2>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-neutral-800"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <Tabs tab={tab} onChange={setTab} />
                <div className="flex-1 overflow-y-auto">
                  {tab === 'device' ? (
                    <DeviceDashboard variant="modal" />
                  ) : (
                    <SettingsPanel variant="embedded" />
                  )}
                </div>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function Tabs({
  tab,
  onChange,
}: {
  tab: PanelTab;
  onChange: (next: PanelTab) => void;
}) {
  const items: { id: PanelTab; label: string; Icon: typeof Activity }[] = [
    { id: 'device', label: 'Device', Icon: Activity },
    { id: 'settings', label: 'Settings', Icon: SettingsIcon },
  ];

  return (
    <div className="px-3 sm:px-5 mt-2 pt-2 pb-2 border-b border-gray-200 dark:border-neutral-700">
      <div className="pt-2 inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-neutral-800 p-1">
        {items.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={active}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                active
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="floating-panel-tab-pill"
                  className="absolute inset-0 rounded-full bg-white dark:bg-neutral-700 shadow"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
