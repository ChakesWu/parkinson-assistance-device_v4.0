'use client';
import DeviceDashboard from '@/components/device/DeviceDashboard';
import AppTopBar from '@/components/ui/AppTopBar';

export default function DevicePage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar showBack />
      <main className="flex-1">
        <DeviceDashboard variant="page" />
      </main>
    </div>
  );
}