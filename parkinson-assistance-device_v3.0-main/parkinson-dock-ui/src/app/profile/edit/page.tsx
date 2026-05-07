'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Check, Shield, User, Users } from 'lucide-react';
import AppTopBar from '@/components/ui/AppTopBar';

interface UserProfile {
  name: string;
  age: string;
  sex: string;
  race?: string;
  onboardingComplete?: boolean;
}

const inputClass =
  'w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';

export default function EditProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    age: '',
    sex: '',
    race: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem('steadigrip_user_profile');
    if (raw) {
      try {
        const p = JSON.parse(raw) as UserProfile;
        setProfile(p);
      } catch {}
    }
  }, []);

  const valid = profile.name.trim() && profile.age.trim() && profile.sex;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    localStorage.setItem('steadigrip_user_profile', JSON.stringify(profile));
    setSaved(true);
    setTimeout(() => router.push('/profile'), 800);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar showBack />

      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 mb-4">
              <User size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Edit Profile</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Update your personal information below.
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {/* Name */}
            <IconField icon={<User size={18} />} label="Preferred Name" required>
              <input
                type="text"
                required
                placeholder="Enter your preferred name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className={inputClass}
              />
            </IconField>

            {/* Age */}
            <IconField icon={<Calendar size={18} />} label="Age" required>
              <input
                type="number"
                required
                min={1}
                max={120}
                placeholder="e.g. 65"
                value={profile.age}
                onChange={(e) => setProfile({ ...profile, age: e.target.value })}
                className={inputClass}
              />
            </IconField>

            {/* Sex */}
            <IconField icon={<Users size={18} />} label="Sex" required>
              <select
                required
                value={profile.sex}
                onChange={(e) => setProfile({ ...profile, sex: e.target.value })}
                className={`${inputClass} appearance-none cursor-pointer`}
              >
                <option value="">Select your sex</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other / Prefer not to say</option>
              </select>
            </IconField>

            {/* Race */}
            <IconField icon={<Users size={18} />} label="Race">
              <select
                value={profile.race ?? ''}
                onChange={(e) => setProfile({ ...profile, race: e.target.value })}
                className={`${inputClass} appearance-none cursor-pointer`}
              >
                <option value="">Select your race (optional)</option>
                <option value="Asian">Asian</option>
                <option value="Black or African American">Black or African American</option>
                <option value="Hispanic or Latino">Hispanic or Latino</option>
                <option value="White or Caucasian">White or Caucasian</option>
                <option value="Native American or Alaska Native">Native American or Alaska Native</option>
                <option value="Native Hawaiian or Pacific Islander">Native Hawaiian or Pacific Islander</option>
                <option value="Middle Eastern or North African">Middle Eastern or North African</option>
                <option value="Mixed or Multiracial">Mixed or Multiracial</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </IconField>

            {/* Privacy notice */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
              <Shield size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <span className="font-semibold">Your privacy matters.</span> All data stays on your device and is never shared.
              </p>
            </div>

            {/* Save button */}
            <button
              type="submit"
              disabled={!valid || saved}
              className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:opacity-90 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {saved ? (
                <>
                  <Check size={18} />
                  Saved!
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function IconField({
  icon,
  label,
  required = false,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 dark:bg-neutral-900/50 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-gray-500 dark:text-gray-400">{icon}</div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      </div>
      {children}
    </div>
  );
}
