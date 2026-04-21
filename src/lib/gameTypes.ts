import type { Inventory } from './craftingSystem';
import type { RegionalModifiers } from './regionalState';
import type { SkillTree } from './skills';
import type { Market } from './economySystem';
import type { FactionState } from './factionSystem';
import type { Quest } from './questSystem';
import type { BountyBoard } from './bountyBoard';
import type { FogMap } from './fogOfWar';
import type { Housing } from './housing';
import type { DialogueTree } from './dialogue';

export type ReputationKey = 'conquest' | 'trade' | 'craft' | 'diplomacy' | 'exploration' | 'arcane';

export interface Reputation {
  conquest: number;
  trade: number;
  craft: number;
  diplomacy: number;
  exploration: number;
  arcane: number;
}

export type Season = 'thaw' | 'summer' | 'harvest' | 'dark';

export interface FactionStanding {
  amber: number;
  iron: number;
  green: number;
  scholar: number;
  ashen: number;
  tide: number;
}

export interface NpcMemory {
  event: string;
  tick: number;
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface Npc {
  id: string;
  name: string;
  title: string;
  location: string;
  faction: keyof FactionStanding | 'none';
  personality: string;
  memories: NpcMemory[];
  disposition: number;
}

export interface Location {
  id: string;
  name: string;
  type: 'village' | 'city' | 'fortress' | 'ruins' | 'wilderness' | 'port';
  description: string;
  biome: string;
  npcs: string[];
  connections: string[];
  icon: string;
  mapX?: number;
  mapY?: number;
}

export interface ChronicleEntry {
  tick: number;
  season: Season;
  text: string;
  type: 'action' | 'world' | 'npc' | 'faction' | 'discovery' | 'environment';
}

export interface GameChoice {
  id: string;
  text: string;
  repEffects: Partial<Reputation>;
  factionEffects?: Partial<FactionStanding>;
  npcEffects?: { npcId: string; disposition: number; memory: string }[];
  resultText: string;
  requiresRep?: Partial<Reputation>;
  chronicleText: string;
}

export interface GameEvent {
  id: string;
  title: string;
  narrative: string;
  location: string;
  choices: GameChoice[];
  season?: Season;
  minTick?: number;
  oneTime?: boolean;
  triggered?: boolean;
}

export interface EnvironmentAction {
  id: string;
  label: string;
  icon: string;
  terrain: string;
  repEffects: Partial<Reputation>;
  resultText: string;
  chronicleText: string;
  cooldownTicks: number;
  itemReward?: { id: string; name: string; icon: string; quantity: number; type: ItemType; description: string };
}

export type OverlayType =
  | 'none'
  | 'player'
  | 'chronicle'
  | 'map'
  | 'help'
  | 'inventory'
  | 'crafting'
  | 'skills'
  | 'quests'
  | 'faction'
  | 'shop'
  | 'build'
  | 'saveload'
  | 'fasttravel'
  | 'camp';

export type ItemType = 'tool' | 'weapon' | 'resource' | 'food' | 'armor' | 'misc' | 'potion' | 'trade_good';

export interface HotbarItem {
  id: string;
  name: string;
  icon: string;
  quantity: number;
  type: ItemType;
  description: string;
}

export type TutorialStep = 'cinematic' | 'movement' | 'hotkeys' | 'landmark' | 'done';

export type DayNightPhase = 'dawn' | 'day' | 'dusk' | 'night';
export type WeatherState = 'clear' | 'cloudy' | 'rain' | 'storm';
export type MountState = 'none' | 'horse' | 'boat';

export interface MinorNpcState {
  memories: string[];
  disposition: number;
  lastSeenTick: number;
}

export interface WildPoiProgress {
  looted?: boolean;
  lastFishTick?: number;
  spoken?: boolean;
}

export interface BattleState {
  foeKind: 'bandit' | 'warband' | 'knight';
  foeHp: number;
  foeMaxHp: number;
  label: string;
  /** When true, next foe strike is weakened */
  playerGuarded: boolean;
  log: string[];
}

export interface GameState {
  phase: 'title' | 'booting' | 'playing' | 'chronicle' | 'dead' | 'sailing' | 'dungeon' | 'battle';
  health: number;
  maxHealth: number;
  hunger: number;
  isMoving: boolean;
  tick: number;
  worldTime: number;
  dayNightPhase: DayNightPhase;
  weather: Record<string, { state: WeatherState; duration: number }>;
  season: Season;
  seasonTick: number;
  seed: number;

  // Inventory & items
  inventory: Inventory;
  hotbar: HotbarItem[];
  activeSlot: number;
  gold: number;

  // Skills
  skills: SkillTree;

  // Economy
  markets: Record<string, Market>;

  // Factions (player standing = legacy 6-axis, kingdom simulation = factionStates)
  reputation: Reputation;
  factions: FactionStanding;
  factionStates: Record<string, FactionState>;

  // Quests
  quests: Quest[];
  bountyBoards: Record<string, BountyBoard>;

  // World
  currentLocation: string;
  nearestLocation: string | null;
  playerX: number;
  playerY: number;
  facingDir: { dx: number; dy: number };
  mounted: MountState;
  activeCaveId: number | null;

  /** Active overworld cave entity id when in dungeon (for rewards / clears). */
  activeCaveEntityId: string | null;
  /** Per-cave last cleared worldTime (limits spam farming). */
  clearedCaves: Record<number, number>;
  /** In-dungeon run flags (set on enter). */
  dungeonRun: { caveId: number; bossDefeated: boolean; depthTier: number } | null;

  regionalModifiers: RegionalModifiers;
  escortCaravanId: string | null;

  campStash: Inventory;
  activeCampFireId: string | null;

  // NPCs & dialogue
  npcs: Npc[];
  activeDialogue: DialogueTree | null;
  /** Hamlet residents + generic keyed dialogue memory */
  minorNpcState: Record<string, MinorNpcState>;
  /** 0–4 tutorial steps, 5 = complete */
  tutorialObjective: number;

  // Chronicle & events
  chronicle: ChronicleEntry[];
  currentEvent: GameEvent | null;
  lastResult: string | null;
  visitedLocations: string[];
  completedEvents: string[];
  playerTitle: string;

  // Fog of war
  fog: FogMap;

  // Housing
  housing: Housing;

  // UI
  overlay: OverlayType;
  tutorialStep: TutorialStep;
  environmentCooldowns: Record<string, number>;

  /** When `overlay === 'shop'`, optional market row id (e.g. `road_inn_*`). */
  shopMarketId: string | null;
  /** Wilderness / POI interaction progress (keyed by `poiId`). */
  wildPoiProgress: Record<string, WildPoiProgress>;
  /** Turn-based duel UI state (Pokémon-style encounter). */
  battleState: BattleState | null;
}
