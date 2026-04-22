import { useGameStore } from './gameStore';
import { serializeEntities, deserializeEntities } from './worldEntities';

const SAVE_KEY_PREFIX = 'chronicle_save_slot_';
const MAX_SLOTS = 4;

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
    version: 1,
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
      clearBootError: undefined,
    },
    entities: entityJson,
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

    // Restore store state (strip undefined function keys)
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined && typeof v !== 'function') clean[k] = v;
    }
    clean.bootError = null;
    useGameStore.setState(clean as any);
    return true;
  } catch {
    return false;
  }
}

export function deleteSlot(slot: number) {
  localStorage.removeItem(SAVE_KEY_PREFIX + slot);
}
