'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Pencil, User, Users } from 'lucide-react';
import AppTopBar from '@/components/ui/AppTopBar';
import MdsUpdrsCard from '@/components/profile/MdsUpdrsCard';
import RecordsList from '@/components/profile/RecordsList';

interface UserProfile {
  name: string;
  age: string;
  sex: string;
  race?: string;
  onboardingComplete?: boolean;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem('steadigrip_user_profile');
    if (raw) {
      try {
        setProfile(JSON.parse(raw) as UserProfile);
      } catch {
        setProfile(null);
      }
    }
    setLoaded(true);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar showBack />

      <main className="flex-1 container mx-auto py-10 px-4 max-w-5xl w-full">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Profile</h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400 text-sm">
            Your personal information and analysis history.
          </p>
        </div>

        {/* Personal info card */}
        <section className="mb-8">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm border border-gray-100 dark:border-neutral-700 p-6">
            {loaded && profile ? (
              <div className="flex items-start gap-5">
                {/* Avatar */}
                <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold">
                  {(profile.name?.[0] ?? '?').toUpperCase()}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white truncate">
                      {profile.name || 'Unnamed'}
                    </h2>
                    <Link
                      href="/profile/edit"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-700 transition"
                    >
                      <Pencil size={14} />
                      Edit
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <InfoItem
                      icon={<Calendar size={14} />}
                      label="Age"
                      value={profile.age || '—'}
                    />
                    <InfoItem
                      icon={<User size={14} />}
                      label="Sex"
                      value={
                        profile.sex
                          ? profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1)
                          : '—'
                      }
                    />
                    <InfoItem
                      icon={<Users size={14} />}
                      label="Race"
                      value={profile.race || '—'}
                    />
                  </div>
                </div>
              </div>
            ) : loaded ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">🩺</div>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  No profile yet. Complete onboarding to set up your profile.
                </p>
                <Link
                  href="/onboarding"
                  className="inline-block px-5 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-medium hover:opacity-90 transition"
                >
                  Start Onboarding
                </Link>
              </div>
            ) : (
              <div className="h-20" />
            )}
          </div>
        </section>

        {/* MDS-UPDRS */}
        <section className="mb-8">
          <MdsUpdrsCard />
        </section>

        {/* Divider */}
        <hr className="border-gray-200 dark:border-neutral-700 mb-8" />

        {/* Records section */}
        <section>
          <RecordsList />
        </section>
      </main>
    </div>
  );
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-neutral-900/50 border border-gray-100 dark:border-neutral-700 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{value}</div>
    </div>
  );
}
