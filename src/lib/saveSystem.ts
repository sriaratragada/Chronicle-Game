import { useGameStore } from './gameStore';
import { serializeEntities, deserializeEntities } from './worldEntities';
import { serializeGraph, deserializeGraph } from './relationshipGraph';

const SAVE_KEY_PREFIX = 'chronicle_save_slot_';
const MAX_SLOTS = 4;
/** Bumped when new persisted fields require defaults on load (e.g. simEventLog). */
export const SAVE_DATA_VERSION = 2;

export interface SaveSlotInfo {
  slot: number;
  exists: boolean;
  playerTitle: string;
  season: string;
  tick: number;
  timestamp: number;
  location: string;
}

export function listSlots(): SaveSlotInfo[] {
  const slots: SaveSlotInfo[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const raw = localStorage.getItem(SAVE_KEY_PREFIX + i);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        slots.push({
          slot: i, exists: true,
          playerTitle: data.state?.playerTitle ?? 'Unknown',
          season: data.state?.season ?? 'thaw',
          tick: data.state?.tick ?? 0,
          timestamp: data.timestamp ?? 0,
          location: data.state?.currentLocation ?? 'unknown',
        });
      } catch {
        slots.push({ slot: i, exists: false, playerTitle: '', season: '', tick: 0, timestamp: 0, location: '' });
      }
    } else {
      slots.push({ slot: i, exists: false, playerTitle: '', season: '', tick: 0, timestamp: 0, location: '' });
    }
  }
  return slots;
}

export function saveToSlot(slot: number) {
  if (slot < 0 || slot >= MAX_SLOTS) return;
  const state = useGameStore.getState();
  const entityJson = serializeEntities();
  const data = {
    version: SAVE_DATA_VERSION,
    timestamp: Date.now(),
    state: {
      ...state,
      // Strip functions
      startGame: undefined, setActiveSlot: undefined, useItem: undefined,
      travel: undefined, movePlayer: undefined, makeChoice: undefined,
      dismissResult: undefined, viewChronicle: undefined, backToGame: undefined,
      advanceTick: undefined, setOverlay: undefined, advanceTutorial: undefined,
      performEnvironmentAction: undefined, interactEntity: undefined,
      battleStrikeAction: undefined, battleGuardAction: undefined, battleFleeAction: undefined,
      clearBootError: undefined, giftNpc: undefined, castSpellAction: undefined,
    },
    entities: entityJson,
    relationshipGraph: serializeGraph(),
  };
  localStorage.setItem(SAVE_KEY_PREFIX + slot, JSON.stringify(data));
}

export function loadFromSlot(slot: number): boolean {
  if (slot < 0 || slot >= MAX_SLOTS) return false;
  const raw = localStorage.getItem(SAVE_KEY_PREFIX + slot);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    const saved = data.state;
    if (!saved) return false;

    // Restore entities
    if (data.entities) deserializeEntities(data.entities);
    if (data.relationshipGraph) deserializeGraph(data.relationshipGraph);

    // Restore store state (strip undefined function keys)
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined && typeof v !== 'function') clean[k] = v;
    }
    clean.bootError = null;
    if (!Array.isArray(clean.simEventLog)) clean.simEventLog = [];
    if (clean.progressionVersion === undefined) clean.progressionVersion = 0;
    if (!Array.isArray(clean.milestonesUnlocked)) clean.milestonesUnlocked = [];
    if (!clean.milestoneCounters || typeof clean.milestoneCounters !== 'object') {
      clean.milestoneCounters = { totalKills: 0, totalGoldEarned: 0, totalItemsCrafted: 0, totalTradeTransactions: 0, totalDungeonsCleared: 0 };
    }
    if (typeof clean.mana !== 'number') clean.mana = 30;
    if (typeof clean.maxMana !== 'number') clean.maxMana = 30;
    if (!Array.isArray(clean.knownSpells)) clean.knownSpells = [];
    if (!clean.spellCooldowns || typeof clean.spellCooldowns !== 'object') clean.spellCooldowns = {};
    if (!clean.synthesisCooldowns || typeof clean.synthesisCooldowns !== 'object') clean.synthesisCooldowns = {};
    if (!Array.isArray(clean.marketSnapshots)) clean.marketSnapshots = [];
    if (typeof clean.lastArcTick !== 'number') clean.lastArcTick = 0;
    useGameStore.setState(clean as any);
    return true;
  } catch {
    return false;
  }
}

export function deleteSlot(slot: number) {
  localStorage.removeItem(SAVE_KEY_PREFIX + slot);
}
