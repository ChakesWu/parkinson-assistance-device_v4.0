'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Droplet, Leaf, Scissors, Sprout } from 'lucide-react';
import AppTopBar from '@/components/ui/AppTopBar';
import { gardenService, GARDEN_SLOTS, type PlantedSpeciesView } from '@/services/gardenService';
import { cardService, type OwnedCard, type PlantCardDefinition } from '@/services/cardService';

interface OwnedCardEntry {
  card: PlantCardDefinition;
  owned: OwnedCard;
}

export default function GardenPage() {
  const [active, setActive] = useState<PlantedSpeciesView[]>([]);
  const [owned, setOwned] = useState<OwnedCardEntry[]>([]);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState<number | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  const refresh = () => {
    setActive(gardenService.getActive());
    const ownedMap = cardService.getOwned();
    const entries: OwnedCardEntry[] = Object.values(ownedMap)
      .map((o) => {
        const card = cardService.getDefinitionById(o.cardId);
        return card ? { card, owned: o } : null;
      })
      .filter((e): e is OwnedCardEntry => e !== null)
      .sort((a, b) => rarityRank(a.card.rarity) - rarityRank(b.card.rarity));
    setOwned(entries);
    setDiscovered(gardenService.getDiscovered());
  };

  const slots = useMemo(() => {
    const arr: (PlantedSpeciesView | null)[] = Array(GARDEN_SLOTS).fill(null);
    for (const p of active) {
      if (p.slot >= 0 && p.slot < GARDEN_SLOTS) arr[p.slot] = p;
    }
    return arr;
  }, [active]);

  const handlePlant = (slot: number, cardId: string) => {
    const planted = gardenService.plant(cardId);
    if (planted) {
      setPickerOpen(null);
      refresh();
    }
  };

  const handleHarvest = (slot: number) => {
    if (gardenService.harvest(slot)) refresh();
  };

  const summary = gardenService.getSummary();

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-sky-50 to-amber-50 dark:from-emerald-950/40 dark:via-slate-950 dark:to-amber-950/30 flex flex-col">
      <AppTopBar showBack />
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 dark:border-emerald-700/40 bg-white/70 dark:bg-emerald-900/20 px-4 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <Sprout size={14} /> Your Garden
          </div>
          <h1 className="mt-3 text-4xl font-bold text-gray-900 dark:text-white">
            Grow as you train
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Every rehab session waters all the plants in your garden. Earn plant cards from sessions and achievements, then plant them in an empty patch.
          </p>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <SummaryTile icon={<Leaf size={16} />} label="Plants growing" value={summary.activeCount} accent="text-emerald-600 dark:text-emerald-300" />
          <SummaryTile icon={<Droplet size={16} />} label="In bloom" value={summary.bloomedCount} accent="text-pink-600 dark:text-pink-300" />
          <SummaryTile icon={<Sprout size={16} />} label="Discovered" value={`${discovered.length}/${cardService.getDefinitions().length}`} accent="text-amber-600 dark:text-amber-300" />
        </div>

        {/* Garden plot */}
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Garden plot</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 rounded-3xl border border-emerald-200/60 dark:border-emerald-700/30 bg-white/60 dark:bg-emerald-900/10 p-3 shadow-inner">
            {slots.map((p, i) => (
              <GardenSlot
                key={i}
                slot={i}
                planted={p}
                onPlantClick={() => setPickerOpen(i)}
                onHarvest={() => handleHarvest(i)}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Tap an empty patch to plant a card. Bloomed plants can be harvested to make room.
          </p>
        </section>

        {/* Owned cards / collection */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Card album</h2>
            <Link href="/rewards" className="text-sm font-medium text-emerald-600 dark:text-emerald-300 hover:underline">
              View all rewards →
            </Link>
          </div>
          {owned.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/40 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Complete rehab sessions to earn your first plant card. Cards drop every 3 sessions.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {owned.map(({ card, owned }) => (
                <CardTile key={card.id} card={card} count={owned.count} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Plant picker modal */}
      {pickerOpen !== null && (
        <PlantPicker
          slot={pickerOpen}
          owned={owned}
          onClose={() => setPickerOpen(null)}
          onPlant={(cardId) => handlePlant(pickerOpen, cardId)}
        />
      )}
    </div>
  );
}

function rarityRank(r: PlantCardDefinition['rarity']): number {
  return r === 'legendary' ? 0 : r === 'rare' ? 1 : r === 'uncommon' ? 2 : 3;
}

function SummaryTile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-3 text-center">
      <div className={`mb-1 inline-flex items-center justify-center gap-1 ${accent}`}>{icon}<span className="text-[11px] uppercase tracking-wider">{label}</span></div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function GardenSlot({
  slot,
  planted,
  onPlantClick,
  onHarvest,
}: {
  slot: number;
  planted: PlantedSpeciesView | null;
  onPlantClick: () => void;
  onHarvest: () => void;
}) {
  if (!planted) {
    return (
      <button
        onClick={onPlantClick}
        className="aspect-square rounded-2xl border-2 border-dashed border-emerald-300/60 dark:border-emerald-700/40 bg-amber-100/40 dark:bg-amber-900/10 flex flex-col items-center justify-center text-emerald-600/70 dark:text-emerald-400/60 hover:bg-amber-200/40 dark:hover:bg-amber-900/20 transition"
        aria-label={`Plant in slot ${slot + 1}`}
      >
        <Sprout size={28} />
        <span className="mt-1 text-[11px] font-medium">plant here</span>
      </button>
    );
  }
  const inBloom = planted.growthStage === 'bloom';
  const stageEmoji = inBloom ? planted.card.emoji : growthEmoji(planted.growthStage);
  return (
    <div
      className={`relative aspect-square rounded-2xl border-2 p-2 flex flex-col items-center justify-center text-center transition ${
        inBloom
          ? 'border-pink-300 dark:border-pink-700/50 bg-gradient-to-b from-pink-100 to-pink-50 dark:from-pink-900/30 dark:to-pink-950/20 shadow-sm'
          : 'border-emerald-200 dark:border-emerald-700/40 bg-gradient-to-b from-emerald-50 to-amber-50 dark:from-emerald-900/20 dark:to-amber-900/10'
      }`}
    >
      <div className="text-5xl leading-none">{stageEmoji}</div>
      <div className="mt-1 text-[11px] font-semibold text-gray-800 dark:text-gray-100 truncate w-full">
        {planted.card.name}
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/70 dark:bg-black/30">
        <div
          className={`h-full ${inBloom ? 'bg-pink-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.round(planted.progress01 * 100)}%` }}
        />
      </div>
      <div className="mt-0.5 text-[9px] text-gray-500 dark:text-gray-400">
        {planted.waterReceived}/{planted.waterToBloom} waters
      </div>
      {inBloom && (
        <button
          onClick={onHarvest}
          className="absolute -top-2 -right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-pink-500 text-white shadow hover:bg-pink-400"
          title="Harvest"
          aria-label="Harvest"
        >
          <Scissors size={14} />
        </button>
      )}
    </div>
  );
}

function growthEmoji(stage: PlantedSpeciesView['growthStage']): string {
  switch (stage) {
    case 'seed': return '🌱';
    case 'sprout': return '🌱';
    case 'sapling': return '🌿';
    case 'budding': return '🌾';
    case 'bloom': return '🌸';
  }
}

function CardTile({ card, count }: { card: PlantCardDefinition; count: number }) {
  const rarityClass =
    card.rarity === 'legendary' ? 'from-amber-200 to-pink-200 ring-amber-300 dark:from-amber-700/30 dark:to-pink-700/30 dark:ring-amber-500/50' :
    card.rarity === 'rare' ? 'from-purple-100 to-indigo-100 ring-purple-200 dark:from-purple-800/30 dark:to-indigo-800/30 dark:ring-purple-500/40' :
    card.rarity === 'uncommon' ? 'from-emerald-100 to-cyan-100 ring-emerald-200 dark:from-emerald-800/30 dark:to-cyan-800/30 dark:ring-emerald-500/40' :
    'from-white to-gray-50 ring-gray-200 dark:from-neutral-900 dark:to-neutral-800 dark:ring-neutral-700';
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${rarityClass} p-3 ring-1 text-center`}>
      <div className="text-4xl">{card.emoji}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white truncate">{card.name}</div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {card.rarity}
      </div>
      {count > 1 && (
        <div className="mt-1 inline-block rounded-full bg-black/10 dark:bg-white/10 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:text-gray-200">
          ×{count}
        </div>
      )}
    </div>
  );
}

function PlantPicker({
  slot,
  owned,
  onClose,
  onPlant,
}: {
  slot: number;
  owned: OwnedCardEntry[];
  onClose: () => void;
  onPlant: (cardId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Plant in slot {slot + 1}</h3>
          <button onClick={onClose} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            Cancel
          </button>
        </div>
        {owned.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You don't have any plant cards yet. Earn them by completing rehab sessions.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto">
            {owned.map(({ card, owned }) => (
              <button
                key={card.id}
                onClick={() => onPlant(card.id)}
                className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 p-2 text-center hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-600 transition"
              >
                <div className="text-3xl">{card.emoji}</div>
                <div className="text-[11px] font-semibold text-gray-900 dark:text-white truncate">{card.name}</div>
                <div className="text-[9px] uppercase text-gray-500 dark:text-gray-400">×{owned.count}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
