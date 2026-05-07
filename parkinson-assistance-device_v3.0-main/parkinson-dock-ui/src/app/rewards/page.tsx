'use client';

import { useEffect, useMemo, useState } from 'react';
import { Lock, Medal as MedalIcon, Sparkles, Trophy } from 'lucide-react';
import AppTopBar from '@/components/ui/AppTopBar';
import {
  achievementsService,
  type AchievementCategory,
  type AchievementDefinition,
  type AchievementProgress,
} from '@/services/achievementsService';
import {
  medalsService,
  type MedalAward,
  type MedalDefinition,
} from '@/services/medalsService';
import {
  cardService,
  type OwnedCard,
  type PlantCardDefinition,
} from '@/services/cardService';

type Tab = 'achievements' | 'medals' | 'cards';

export default function RewardsPage() {
  const [tab, setTab] = useState<Tab>('achievements');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar showBack />
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Rewards</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-300">
            Track every achievement, medal and plant card you've earned.
          </p>
        </div>

        <div className="mb-6 flex gap-2 rounded-2xl bg-white dark:bg-neutral-900 p-1 border border-gray-200 dark:border-neutral-700">
          <TabButton active={tab === 'achievements'} onClick={() => setTab('achievements')} icon={<Trophy size={16} />} label="Achievements" />
          <TabButton active={tab === 'medals'} onClick={() => setTab('medals')} icon={<MedalIcon size={16} />} label="Medals" />
          <TabButton active={tab === 'cards'} onClick={() => setTab('cards')} icon={<Sparkles size={16} />} label="Cards" />
        </div>

        {tab === 'achievements' && <AchievementsTab />}
        {tab === 'medals' && <MedalsTab />}
        {tab === 'cards' && <CardsTab />}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition ${
        active
          ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-neutral-800'
      }`}
    >
      {icon}{label}
    </button>
  );
}

// ---------------------------------------------------------------------
// Achievements tab
// ---------------------------------------------------------------------

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  onboarding: 'Onboarding',
  volume: 'Volume',
  consistency: 'Consistency',
  range: 'Range of Motion',
  quality: 'Quality',
  variety: 'Variety',
  comeback: 'Comeback',
};

function AchievementsTab() {
  const [progress, setProgress] = useState<AchievementProgress[]>([]);
  const defs = achievementsService.getDefinitions();

  useEffect(() => {
    setProgress(achievementsService.peekProgress());
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<AchievementCategory, AchievementDefinition[]>();
    for (const d of defs) {
      const arr = map.get(d.category) ?? [];
      arr.push(d);
      map.set(d.category, arr);
    }
    return map;
  }, [defs]);

  const unlocked = progress.filter(p => p.unlocked).length;

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Unlocked</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{unlocked}<span className="text-base font-normal text-gray-500 dark:text-gray-400"> / {defs.length}</span></div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Bonus points</div>
            <div className="text-2xl font-bold text-amber-500">
              {progress.filter(p => p.unlocked).reduce((s, p) => s + (defs.find(d => d.id === p.id)?.pointsReward ?? 0), 0).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-800">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500"
            style={{ width: `${(unlocked / Math.max(1, defs.length)) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-5">
        {Array.from(grouped.entries()).map(([cat, list]) => (
          <section key={cat}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {CATEGORY_LABELS[cat as AchievementCategory]}
            </h3>
            <div className="grid gap-2">
              {(list as AchievementDefinition[]).map((def) => {
                const p = progress.find((x) => x.id === def.id);
                return <AchievementRow key={def.id} def={def} progress={p} />;
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function AchievementRow({ def, progress }: { def: AchievementDefinition; progress: AchievementProgress | undefined }) {
  const unlocked = progress?.unlocked === true;
  const cur = Math.min(progress?.current ?? 0, def.target);
  const ratio = def.target > 0 ? cur / def.target : 0;
  const isTime = def.target > 60_000;
  const display = isTime ? formatDuration(cur) + ' / ' + formatDuration(def.target) : `${cur} / ${def.target}`;
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3 ${
      unlocked
        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/40'
        : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700'
    }`}>
      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-2xl ${unlocked ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-white' : 'bg-gray-100 dark:bg-neutral-800 text-gray-400 dark:text-neutral-500'}`}>
        {unlocked ? def.icon : <Lock size={18} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold truncate ${unlocked ? 'text-amber-900 dark:text-amber-100' : 'text-gray-900 dark:text-white'}`}>
          {def.title}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{def.description}</div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-700">
          <div
            className={`h-full ${unlocked ? 'bg-amber-500' : 'bg-gradient-to-r from-purple-500 to-indigo-500'}`}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-[10px] text-gray-500 dark:text-gray-400">{display}</div>
        <div className={`text-xs font-semibold ${unlocked ? 'text-amber-600 dark:text-amber-300' : 'text-gray-400'}`}>
          +{def.pointsReward}
        </div>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  return `${minutes}m`;
}

// ---------------------------------------------------------------------
// Medals tab
// ---------------------------------------------------------------------

function MedalsTab() {
  const [availability, setAvailability] = useState<ReturnType<typeof medalsService.getAvailability> | null>(null);
  const [history, setHistory] = useState<MedalAward[]>([]);

  useEffect(() => {
    setAvailability(medalsService.getAvailability());
    setHistory(medalsService.getAllAwards());
  }, []);

  if (!availability) return null;

  return (
    <div>
      <PeriodSection
        title="This week"
        subtitle={availability.weekInfo.key}
        items={availability.week}
      />
      <div className="my-6 h-px bg-gray-200 dark:bg-neutral-800" />
      <PeriodSection
        title="This month"
        subtitle={availability.monthInfo.key}
        items={availability.month}
      />

      {history.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">History</h3>
          <div className="space-y-2">
            {history.slice(0, 30).map((a) => {
              const def = medalsService.getDefinitions().find(d => d.id === a.id);
              return (
                <div
                  key={`${a.periodKey}::${a.id}`}
                  className="flex items-center gap-3 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 px-3 py-2"
                >
                  <div className="text-2xl">{def?.icon ?? '🏅'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{def?.title ?? a.id}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">{a.periodKey} · {a.period}</div>
                  </div>
                  <div className="text-xs font-semibold text-rose-500">+{a.pointsReward}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function PeriodSection({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: { def: MedalDefinition; earned: boolean; meetsCriteria: boolean }[];
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</h3>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">{subtitle}</span>
      </div>
      <div className="grid gap-2">
        {items.map(({ def, earned, meetsCriteria }) => (
          <div
            key={def.id}
            className={`flex items-center gap-3 rounded-2xl border p-3 ${
              earned
                ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700/40'
                : meetsCriteria
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/40'
                : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700'
            }`}
          >
            <div className={`text-3xl ${earned ? '' : meetsCriteria ? 'opacity-90' : 'opacity-40'}`}>{def.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{def.title}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{def.description}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider">
                {earned ? (
                  <span className="text-rose-600 dark:text-rose-300 font-semibold">Earned this {def.period}</span>
                ) : meetsCriteria ? (
                  <span className="text-emerald-600 dark:text-emerald-300 font-semibold">Eligible — finish a session to claim</span>
                ) : (
                  <span className="text-gray-400">Not yet</span>
                )}
              </div>
            </div>
            <div className="text-xs font-semibold text-rose-500 flex-shrink-0">+{def.pointsReward}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Cards tab
// ---------------------------------------------------------------------

function CardsTab() {
  const [owned, setOwned] = useState<Record<string, OwnedCard>>({});
  const defs = cardService.getDefinitions();

  useEffect(() => {
    setOwned(cardService.getOwned());
  }, []);

  const summary = useMemo(() => {
    const byRarity: Record<PlantCardDefinition['rarity'], { owned: number; total: number }> = {
      common: { owned: 0, total: 0 },
      uncommon: { owned: 0, total: 0 },
      rare: { owned: 0, total: 0 },
      legendary: { owned: 0, total: 0 },
    };
    for (const d of defs) {
      byRarity[d.rarity].total += 1;
      if (owned[d.id]) byRarity[d.rarity].owned += 1;
    }
    return byRarity;
  }, [defs, owned]);

  return (
    <div>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {(['common', 'uncommon', 'rare', 'legendary'] as const).map(r => (
          <div key={r} className="rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{r}</div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">
              {summary[r].owned}<span className="text-xs font-normal text-gray-500 dark:text-gray-400">/{summary[r].total}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {defs.map(def => {
          const o = owned[def.id];
          return <AlbumSlot key={def.id} card={def} owned={o} />;
        })}
      </div>
    </div>
  );
}

function AlbumSlot({ card, owned }: { card: PlantCardDefinition; owned?: OwnedCard }) {
  const isOwned = !!owned;
  const rarityClass =
    card.rarity === 'legendary' ? 'from-amber-200 to-pink-200 ring-amber-300 dark:from-amber-700/30 dark:to-pink-700/30 dark:ring-amber-500/50' :
    card.rarity === 'rare' ? 'from-purple-100 to-indigo-100 ring-purple-200 dark:from-purple-800/30 dark:to-indigo-800/30 dark:ring-purple-500/40' :
    card.rarity === 'uncommon' ? 'from-emerald-100 to-cyan-100 ring-emerald-200 dark:from-emerald-800/30 dark:to-cyan-800/30 dark:ring-emerald-500/40' :
    'from-white to-gray-50 ring-gray-200 dark:from-neutral-900 dark:to-neutral-800 dark:ring-neutral-700';
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${rarityClass} p-3 ring-1 text-center ${isOwned ? '' : 'opacity-50'}`}>
      <div className="text-4xl">{isOwned ? card.emoji : '❓'}</div>
      <div className="mt-1 text-[12px] font-semibold text-gray-900 dark:text-white truncate">{isOwned ? card.name : '???'}</div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{card.rarity}</div>
      {isOwned && owned!.count > 1 && (
        <div className="mt-1 inline-block rounded-full bg-black/10 dark:bg-white/10 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:text-gray-200">
          ×{owned!.count}
        </div>
      )}
    </div>
  );
}
