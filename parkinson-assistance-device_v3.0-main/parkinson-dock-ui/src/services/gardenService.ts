/**
 * Garden service.
 *
 * The garden is the patient's long-term visual progress.
 * - Each rehab session grants 1 "water unit" to all currently planted
 *   species (effort-based: showing up matters).
 * - A plant blooms once it has been watered `waterToBloom` times.
 * - Patients plant new species by spending one of their owned plant cards.
 *
 * The garden plot is fixed-size (12 slots). Planting requires an empty
 * slot. Mature plants can be harvested (cleared) to free a slot, but
 * the species remains "discovered" forever.
 */

import { rehabSessionService } from './rehabSessionService';
import { cardService, type PlantCardDefinition } from './cardService';

export interface PlantedSpecies {
  slot: number;          // 0..GARDEN_SLOTS-1
  cardId: string;
  plantedAtSessionCount: number;  // lifetime session count when planted
  plantedAt: string;     // ISO
  harvested: boolean;
  harvestedAt?: string;
}

export interface PlantedSpeciesView extends PlantedSpecies {
  card: PlantCardDefinition;
  waterReceived: number;
  waterToBloom: number;
  growthStage: GrowthStage;
  progress01: number;    // 0..1
}

export type GrowthStage = 'seed' | 'sprout' | 'sapling' | 'budding' | 'bloom';

export const GARDEN_SLOTS = 12;

interface StoredState {
  planted: PlantedSpecies[];
  // Plant species ever discovered (id list).
  discovered: string[];
}

const STORAGE_KEY = 'steadigrip_garden';

class GardenService {
  private read(): StoredState {
    if (typeof window === 'undefined' || !window.localStorage) return { planted: [], discovered: [] };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { planted: [], discovered: [] };
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object'
        ? { planted: Array.isArray(parsed.planted) ? parsed.planted : [], discovered: Array.isArray(parsed.discovered) ? parsed.discovered : [] }
        : { planted: [], discovered: [] };
    } catch {
      return { planted: [], discovered: [] };
    }
  }

  private write(state: StoredState): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      console.error('gardenService: write failed', e);
    }
  }

  /**
   * Plant a new species into the first available slot. Returns the
   * planted species or null if it failed (no slot, no card).
   */
  plant(cardId: string): PlantedSpecies | null {
    const state = this.read();
    const def = cardService.getDefinitionById(cardId);
    if (!def) return null;

    const occupiedSlots = new Set(state.planted.filter(p => !p.harvested).map(p => p.slot));
    let slot = -1;
    for (let i = 0; i < GARDEN_SLOTS; i++) {
      if (!occupiedSlots.has(i)) { slot = i; break; }
    }
    if (slot === -1) return null;

    if (!cardService.spendCard(cardId)) return null;

    const totalSessions = rehabSessionService.getAllSessions().length;
    const planted: PlantedSpecies = {
      slot,
      cardId,
      plantedAtSessionCount: totalSessions,
      plantedAt: new Date().toISOString(),
      harvested: false,
    };
    state.planted.push(planted);
    if (!state.discovered.includes(cardId)) state.discovered.push(cardId);
    this.write(state);
    return planted;
  }

  /**
   * Harvest (remove) a fully bloomed plant to free its slot.
   * Returns true on success.
   */
  harvest(slot: number): boolean {
    const state = this.read();
    const idx = state.planted.findIndex(p => p.slot === slot && !p.harvested);
    if (idx === -1) return false;
    const view = this.viewFor(state.planted[idx]);
    if (view.growthStage !== 'bloom') return false;
    state.planted[idx] = {
      ...state.planted[idx],
      harvested: true,
      harvestedAt: new Date().toISOString(),
    };
    this.write(state);
    return true;
  }

  /** All planted species (active + harvested), enriched with growth state. */
  getPlanted(): PlantedSpeciesView[] {
    const state = this.read();
    return state.planted.map(p => this.viewFor(p));
  }

  getActive(): PlantedSpeciesView[] {
    return this.getPlanted().filter(p => !p.harvested);
  }

  getDiscovered(): string[] {
    return [...this.read().discovered];
  }

  /** Stats for home page tile / summary card. */
  getSummary(): { activeCount: number; bloomedCount: number; discoveredCount: number; emptySlots: number } {
    const active = this.getActive();
    return {
      activeCount: active.length,
      bloomedCount: active.filter(p => p.growthStage === 'bloom').length,
      discoveredCount: this.getDiscovered().length,
      emptySlots: GARDEN_SLOTS - active.length,
    };
  }

  resetAll(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
  }

  // ------------------------------------------------------------------
  // View derivation
  // ------------------------------------------------------------------

  private viewFor(p: PlantedSpecies): PlantedSpeciesView {
    const def = cardService.getDefinitionById(p.cardId);
    // If the definition was removed, fall back to a stub.
    const card: PlantCardDefinition = def ?? {
      id: p.cardId,
      name: 'Unknown Plant',
      emoji: '🌱',
      description: 'A mystery species.',
      rarity: 'common',
      waterToBloom: 5,
    };
    const totalSessions = rehabSessionService.getAllSessions().length;
    const sessionsSincePlanted = Math.max(0, totalSessions - p.plantedAtSessionCount);
    const water = Math.min(card.waterToBloom, sessionsSincePlanted);
    const ratio = water / Math.max(1, card.waterToBloom);
    const growthStage: GrowthStage =
      ratio >= 1 ? 'bloom' :
      ratio >= 0.66 ? 'budding' :
      ratio >= 0.33 ? 'sapling' :
      ratio >= 0.1 ? 'sprout' : 'seed';
    return {
      ...p,
      card,
      waterReceived: water,
      waterToBloom: card.waterToBloom,
      progress01: ratio,
      growthStage,
    };
  }
}

export const GROWTH_STAGE_EMOJI: Record<GrowthStage, string> = {
  seed: '🌱',
  sprout: '🌱',
  sapling: '🌿',
  budding: '🌾',
  bloom: '', // use the card's own emoji at full bloom
};

export const gardenService = new GardenService();
