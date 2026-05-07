/**
 * Card service — collectible plant species cards.
 *
 * Cards are the long-term collectible reward layer. Earning a card grants
 * the right to plant that species in the garden. Drops are deterministic
 * with a small wild-card variable-reward pool, never gacha-only.
 *
 * Drop rules:
 *   - 1 guaranteed card every 3 completed sessions (uses lifetime session
 *     count to pick deterministically from the un-owned common pool).
 *   - +1 bonus card per achievement unlocked (handled by callers calling
 *     awardOne with a seed string).
 *   - 5% wild-card chance per session for a rarer pull from the rare pool.
 */

import { rehabSessionService, type RehabSession } from './rehabSessionService';

export type CardRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface PlantCardDefinition {
  id: string;
  name: string;
  scientific?: string;
  emoji: string;             // single-emoji art (no asset pipeline needed)
  description: string;
  rarity: CardRarity;
  /** Sessions of "watering" needed for the planted species to fully bloom. */
  waterToBloom: number;
}

export interface OwnedCard {
  cardId: string;
  count: number;             // copies (duplicate drops are common)
  firstAcquiredAt: string;   // ISO
}

export interface CardDropResult {
  awarded: PlantCardDefinition[];
  duplicates: PlantCardDefinition[]; // already-owned cards re-rolled into duplicates
}

const STORAGE_KEY = 'steadigrip_cards';
const SESSIONS_PER_GUARANTEED_DROP = 3;
const WILD_CARD_CHANCE = 0.05;

interface StoredState {
  owned: Record<string, OwnedCard>;
  // Lifetime drops awarded so far (used to advance the deterministic pointer).
  guaranteedDropsAwarded: number;
}

class CardService {
  private read(): StoredState {
    if (typeof window === 'undefined' || !window.localStorage) return defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object'
        ? { owned: parsed.owned ?? {}, guaranteedDropsAwarded: parsed.guaranteedDropsAwarded ?? 0 }
        : defaultState();
    } catch {
      return defaultState();
    }
  }

  private write(state: StoredState): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      console.error('cardService: write failed', e);
    }
  }

  /**
   * Evaluate drops for the just-completed session.
   * Returns any newly awarded cards so the UI can celebrate.
   */
  evaluateForSession(session: RehabSession): CardDropResult {
    const state = this.read();
    const totalSessions = rehabSessionService.getAllSessions().length;
    const expectedDrops = Math.floor(totalSessions / SESSIONS_PER_GUARANTEED_DROP);
    const owedDrops = Math.max(0, expectedDrops - state.guaranteedDropsAwarded);

    const result: CardDropResult = { awarded: [], duplicates: [] };

    // Guaranteed common pulls.
    for (let i = 0; i < owedDrops; i++) {
      const card = pickByRotation(state.guaranteedDropsAwarded + i, ['common', 'uncommon']);
      acquireCard(state, card, result);
    }
    state.guaranteedDropsAwarded = expectedDrops;

    // Wild-card variable pull (deterministic per-session via session id hash).
    if (rngFromString(session.id) < WILD_CARD_CHANCE) {
      const card = pickByRotation(hashString(session.id), ['rare', 'legendary']);
      acquireCard(state, card, result);
    }

    if (result.awarded.length > 0 || result.duplicates.length > 0) {
      this.write(state);
    }
    return result;
  }

  /**
   * Award one card by deterministic seed (used when an achievement unlocks).
   * Picks from an "uncommon"-and-up pool so achievements feel meaningful.
   */
  awardOneFromSeed(seed: string): CardDropResult {
    const state = this.read();
    const result: CardDropResult = { awarded: [], duplicates: [] };
    const card = pickByRotation(hashString(seed), ['uncommon', 'rare']);
    acquireCard(state, card, result);
    this.write(state);
    return result;
  }

  getOwned(): Record<string, OwnedCard> {
    return this.read().owned;
  }

  getOwnedSummary(): { total: number; unique: number; byRarity: Record<CardRarity, number> } {
    const owned = this.read().owned;
    const byRarity: Record<CardRarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
    let total = 0;
    let unique = 0;
    for (const id of Object.keys(owned)) {
      const def = CARD_DEFS_BY_ID[id];
      if (!def) continue;
      total += owned[id].count;
      unique += 1;
      byRarity[def.rarity] += 1;
    }
    return { total, unique, byRarity };
  }

  getDefinitions(): PlantCardDefinition[] {
    return PLANT_CARDS;
  }

  getDefinitionById(id: string): PlantCardDefinition | undefined {
    return CARD_DEFS_BY_ID[id];
  }

  /** Spend a card duplicate (not the last copy) for the garden. */
  spendCard(cardId: string): boolean {
    const state = this.read();
    const owned = state.owned[cardId];
    if (!owned || owned.count < 1) return false;
    owned.count -= 1;
    if (owned.count <= 0) delete state.owned[cardId];
    this.write(state);
    return true;
  }

  resetAll(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
  }
}

function defaultState(): StoredState {
  return { owned: {}, guaranteedDropsAwarded: 0 };
}

function acquireCard(state: StoredState, def: PlantCardDefinition, result: CardDropResult): void {
  const existing = state.owned[def.id];
  if (existing) {
    existing.count += 1;
    result.duplicates.push(def);
  } else {
    state.owned[def.id] = {
      cardId: def.id,
      count: 1,
      firstAcquiredAt: new Date().toISOString(),
    };
    result.awarded.push(def);
  }
}

function pickByRotation(rotationSeed: number, allowedRarities: CardRarity[]): PlantCardDefinition {
  const pool = PLANT_CARDS.filter(c => allowedRarities.includes(c.rarity));
  return pool[rotationSeed % pool.length];
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFromString(s: string): number {
  return (hashString(s) % 10000) / 10000;
}

// ---------------------------------------------------------------------
// Card catalog (universal flora — no culture-specific imagery)
// ---------------------------------------------------------------------

export const PLANT_CARDS: PlantCardDefinition[] = [
  // Commons (15)
  { id: 'sunflower', name: 'Sunflower', scientific: 'Helianthus', emoji: '🌻', description: 'Tall, bright and unmissable.', rarity: 'common', waterToBloom: 6 },
  { id: 'tulip', name: 'Tulip', scientific: 'Tulipa', emoji: '🌷', description: 'A classic spring bulb.', rarity: 'common', waterToBloom: 5 },
  { id: 'rose', name: 'Rose', scientific: 'Rosa', emoji: '🌹', description: 'Gentle and timeless.', rarity: 'common', waterToBloom: 7 },
  { id: 'hibiscus', name: 'Hibiscus', emoji: '🌺', description: 'Bold tropical bloom.', rarity: 'common', waterToBloom: 6 },
  { id: 'cherry-blossom', name: 'Cherry Blossom', emoji: '🌸', description: 'Pink petals on the breeze.', rarity: 'common', waterToBloom: 6 },
  { id: 'daisy', name: 'Daisy', emoji: '🌼', description: 'Cheerful little face.', rarity: 'common', waterToBloom: 4 },
  { id: 'cactus', name: 'Cactus', emoji: '🌵', description: 'Drought-loving stalwart.', rarity: 'common', waterToBloom: 5 },
  { id: 'fern', name: 'Fern', emoji: '🌿', description: 'Quiet, layered green.', rarity: 'common', waterToBloom: 5 },
  { id: 'four-leaf', name: 'Four-Leaf Clover', emoji: '🍀', description: 'A small bit of luck.', rarity: 'common', waterToBloom: 4 },
  { id: 'shamrock', name: 'Shamrock', emoji: '☘️', description: 'Lush undergrowth.', rarity: 'common', waterToBloom: 4 },
  { id: 'leafy-bush', name: 'Leafy Bush', emoji: '🍃', description: 'Soft swaying greens.', rarity: 'common', waterToBloom: 5 },
  { id: 'tomato', name: 'Tomato', emoji: '🍅', description: 'Sweet vegetable garden staple.', rarity: 'common', waterToBloom: 6 },
  { id: 'corn', name: 'Sweet Corn', emoji: '🌽', description: 'Tall yellow rows.', rarity: 'common', waterToBloom: 7 },
  { id: 'wheat', name: 'Wheat', emoji: '🌾', description: 'Golden field staple.', rarity: 'common', waterToBloom: 7 },
  { id: 'mushroom', name: 'Mushroom', emoji: '🍄', description: 'Quiet forest companion.', rarity: 'common', waterToBloom: 4 },

  // Uncommons (8)
  { id: 'lotus', name: 'Lotus', emoji: '🪷', description: 'Floats serenely above the water.', rarity: 'uncommon', waterToBloom: 10 },
  { id: 'maple', name: 'Maple Sapling', emoji: '🍁', description: 'Will one day blaze in autumn.', rarity: 'uncommon', waterToBloom: 12 },
  { id: 'evergreen', name: 'Evergreen', emoji: '🌲', description: 'Steady through every season.', rarity: 'uncommon', waterToBloom: 12 },
  { id: 'palm', name: 'Palm Tree', emoji: '🌴', description: 'Sun-loving giant.', rarity: 'uncommon', waterToBloom: 14 },
  { id: 'olive', name: 'Olive Tree', emoji: '🫒', description: 'Slow growing, long lasting.', rarity: 'uncommon', waterToBloom: 14 },
  { id: 'pumpkin', name: 'Pumpkin Vine', emoji: '🎃', description: 'A harvest waiting to happen.', rarity: 'uncommon', waterToBloom: 10 },
  { id: 'grapes', name: 'Grape Vine', emoji: '🍇', description: 'Patiently ripening clusters.', rarity: 'uncommon', waterToBloom: 12 },
  { id: 'lemon', name: 'Lemon Tree', emoji: '🍋', description: 'Sunshine on a branch.', rarity: 'uncommon', waterToBloom: 11 },

  // Rares (5)
  { id: 'oak', name: 'Mighty Oak', emoji: '🌳', description: 'Centuries in the making.', rarity: 'rare', waterToBloom: 20 },
  { id: 'pine-grove', name: 'Pine Grove', emoji: '🎄', description: 'A small forest in the making.', rarity: 'rare', waterToBloom: 22 },
  { id: 'apple', name: 'Apple Tree', emoji: '🍎', description: 'Fruit that returns every year.', rarity: 'rare', waterToBloom: 18 },
  { id: 'pear', name: 'Pear Tree', emoji: '🍐', description: 'Patient, hardy, generous.', rarity: 'rare', waterToBloom: 18 },
  { id: 'peach', name: 'Peach Tree', emoji: '🍑', description: 'Soft blossoms before fruit.', rarity: 'rare', waterToBloom: 18 },

  // Legendaries (2)
  { id: 'rainbow-rose', name: 'Rainbow Rose', emoji: '🌈', description: 'A perfect bloom in every colour.', rarity: 'legendary', waterToBloom: 30 },
  { id: 'world-tree', name: 'World Tree', emoji: '🌍', description: 'A garden\'s crown jewel.', rarity: 'legendary', waterToBloom: 40 },
];

const CARD_DEFS_BY_ID: Record<string, PlantCardDefinition> =
  PLANT_CARDS.reduce((acc, c) => { acc[c.id] = c; return acc; }, {} as Record<string, PlantCardDefinition>);

export const cardService = new CardService();
