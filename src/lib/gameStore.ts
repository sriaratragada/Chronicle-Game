import { create } from 'zustand';
import {
  GameState,
  Season,
  ChronicleEntry,
  Reputation,
  FactionStanding,
  OverlayType,
  TutorialStep,
  HotbarItem,
  DayNightPhase,
  MountState,
  BattleState,
} from './gameTypes';
import { createWeatherState } from './weatherSystem';
import { startTicker } from './worldTicker';
import { INITIAL_NPCS, generateEvents, getWorldEvent, getPlayerTitle, ENVIRONMENT_ACTIONS, FOOD_VALUES, LOCATIONS } from './gameData';
import { LOCATION_COORDS, isWalkableCode, getTileAt, MAP_W, MAP_H, TILE_NAMES, getContinentAt, getSettlementMeta, setSeed, ensureRoads, ensureRivers } from './mapGenerator';
import { getExtendedLocationCoords, getHamlets, isHamletId } from './hamlets';
import { warmSettlementRoadIndexes } from './settlementLayout';
import { initWorldEntities, getEntitiesNear, spawnEntity, removeEntity, getEntityById, type WorldEntity } from './worldEntities';
import { createInventory, addToInventory, removeFromInventory, equipItem, unequipItem, craft, canCraft, Inventory, getWeaponDamage, getTotalArmor, countItem } from './craftingSystem';
import { createSkillTree, addXp, selectPerk, SkillTree } from './skills';
import { ITEMS } from './items';
import { RECIPES } from './recipes';
import { createMarkets, buildRoadInnMarkets } from './economySystem';
import { createFactions, FactionState } from './factionSystem';
import { Quest } from './questSystem';
import { createBountyBoard, BountyBoard } from './bountyBoard';
import { createRegionalModifiers } from './regionalState';
import { createFogMap, revealAroundPlayer, revealLocation, FogMap } from './fogOfWar';
import { createHousing, purchasePlot, placeFurniture, Housing, PLOT_PRICES } from './housing';
import { playerAttack, computePlayerStrikeDamage, getKillLoot, enemyAttackDamage, getKillXp } from './combatSystem';
import { DialogueTree, getDialogueTree, genericDialogue, roadInnDialogue } from './dialogue';
import { generateNpcDialogue, isGeminiConfigured } from './geminiNpc';
import { findNearestWildernessPoi, getRoadInnSites } from './wildernessPoi';
import { rollFishingLoot } from './fishingLoot';
import { appendSimEvents, recordPlayerShopBuy, recordPlayerShopSell, simEventsToChronicleEntries, SIM_EVENT_CAP } from './simulationEvents';
import { evaluateMilestones, MILESTONES } from './progressionRegistry';
import { SPELLS } from './arcaneSystem';
import { updateEdge } from './relationshipGraph';
import { toast } from 'sonner';

const SEASON_ORDER: Season[] = ['thaw', 'summer', 'harvest', 'dark'];
const TICKS_PER_SEASON = 12;

function proximityForLocation(id: string): number {
  if (isHamletId(id)) return 15;
  const m = getSettlementMeta(id);
  if (!m) return 28;
  switch (m.type) {
    case 'capital': return 48;
    case 'city': return 40;
    case 'fortress': return 42;
    case 'port': return 38;
    case 'town': return 34;
    case 'wilderness': return 34;
    default: return 28;
  }
}

function findNearestLocation(px: number, py: number): string | null {
  const coords = getExtendedLocationCoords();
  let nearest: string | null = null;
  let minDist = Infinity;
  for (const [id, coord] of Object.entries(coords)) {
    const pr = proximityForLocation(id);
    const d = Math.sqrt((px - coord.x) ** 2 + (py - coord.y) ** 2);
    if (d < pr && d < minDist) {
      minDist = d;
      nearest = id;
    }
  }
  return nearest;
}

function runtimeDialogueFromGemini(npcKey: string, speaker: string, npcText: string, optionTexts: string[]): DialogueTree {
  const options = optionTexts.map((t, i) => ({
    id: `g_${i}`,
    text: t,
    exitText: 'You step away.',
  }));
  return {
    npcId: npcKey,
    startNodeId: 'g0',
    nodes: { g0: { id: 'g0', speaker, text: npcText, options } },
  };
}

function inventoryToHotbar(inv: Inventory): HotbarItem[] {
  const result: HotbarItem[] = [];
  for (let i = 0; i < 6; i++) {
    const slot = inv.slots[i];
    if (slot) {
      const def = ITEMS[slot.itemId];
      result.push({ id: slot.itemId, name: def?.name ?? slot.itemId, icon: def?.icon ?? '?', quantity: slot.qty, type: (def?.type ?? 'misc') as any, description: def?.description ?? '' });
    } else {
      result.push({ id: 'empty', name: '', icon: '', quantity: 0, type: 'misc', description: '' });
    }
  }
  return result;
}

function makeStarterInventory(): Inventory {
  let inv = createInventory();
  inv = addToInventory(inv, 'waterskin', 1);
  inv = addToInventory(inv, 'bare_hands', 1);
  inv = addToInventory(inv, 'tent_kit', 1);
  inv = addToInventory(inv, 'realm_map', 1);
  const bh = inv.slots.findIndex(s => s?.itemId === 'bare_hands');
  if (bh >= 0) inv = equipItem(inv, bh);
  return inv;
}

function playerNearCookingFire(px: number, py: number): boolean {
  return getEntitiesNear(px, py, 5).some(e => e.kind === 'cooking_fire');
}

function applyMilestoneCheck(candidateState: GameState): {
  milestonesUnlocked: string[];
  goldBonus: number;
  skills: SkillTree;
  reputation: Reputation;
  playerTitle: string;
  extraChronicle: ChronicleEntry[];
} {
  const newIds = evaluateMilestones(candidateState);
  if (newIds.length === 0) {
    return { milestonesUnlocked: candidateState.milestonesUnlocked, goldBonus: 0, skills: candidateState.skills, reputation: candidateState.reputation, playerTitle: candidateState.playerTitle, extraChronicle: [] };
  }
  let goldBonus = 0;
  let skills = candidateState.skills;
  const rep = { ...candidateState.reputation };
  const extraChronicle: ChronicleEntry[] = [];
  for (const id of newIds) {
    const m = MILESTONES[id];
    if (!m) continue;
    toast(`🏆 ${m.label}`, { description: m.reward.text, duration: 5000 });
    if (m.reward.gold) goldBonus += m.reward.gold;
    if (m.reward.skillXp) skills = addXp(skills, m.reward.skillXp.skill, m.reward.skillXp.amount);
    if (m.reward.repBoost) {
      for (const [k, v] of Object.entries(m.reward.repBoost)) {
        if (v) rep[k as keyof Reputation] = Math.min(100, (rep[k as keyof Reputation] ?? 0) + v);
      }
    }
    extraChronicle.push({ tick: candidateState.tick, season: candidateState.season, text: `Achievement unlocked: "${m.label}" — ${m.reward.text}`, type: 'action' });
  }
  return {
    milestonesUnlocked: [...candidateState.milestonesUnlocked, ...newIds],
    goldBonus,
    skills,
    reputation: rep,
    playerTitle: getPlayerTitle(rep as unknown as Record<string, number>),
    extraChronicle,
  };
}

function worldEventsFromRegional(st: GameState): string[] {
  const m = st.regionalModifiers;
  const out: string[] = [];
  if (m.warTension > 0.48) out.push('Border musters and mercenary traffic are up.');
  if (m.drought > 0.48) out.push('Dry weather pinches grain and well-water.');
  if (m.banditPressure > 0.48) out.push('Bandits are thick on the trade roads.');
  if (m.stormSeverity > 0.42) out.push('Storms have slowed coastwise shipping.');
  if (out.length === 0) out.push('The roads are quiet—too quiet, some say.');
  return out;
}

function initBountyBoards(): Record<string, BountyBoard> {
  const boards: Record<string, BountyBoard> = {};
  for (const locId of ['highmarch', 'graygate', 'saltmoor', 'ironhold', 'korrath_citadel', 'vell_harbor', 'sarnak_hold']) {
    boards[locId] = createBountyBoard(locId, 0);
  }
  return boards;
}

/** Lets the booting UI paint before synchronous world init blocks the main thread. */
function scheduleAfterPaint(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(fn);
    });
  } else {
    setTimeout(fn, 0);
  }
}

/** Seed, global roads, rivers, settlement-road union, hamlet list — run in first boot rAF slice. */
function bootstrapWorldGeometry(): void {
  setSeed(42);
  ensureRoads();
  ensureRivers();
  warmSettlementRoadIndexes();
  void getHamlets();
}

/** Heavy path after geometry caches: entities, markets, fog — second boot rAF slice. */
function buildFreshPlayingStatePayload(): Partial<GameState> & { phase: 'playing' } {
  initWorldEntities();
  const npcs = JSON.parse(JSON.stringify(INITIAL_NPCS)) as GameState['npcs'];
  const inv = makeStarterInventory();
  const fog = revealAroundPlayer(createFogMap(), LOCATION_COORDS.ashenford.x, LOCATION_COORDS.ashenford.y, 120);
  const initialChronicle: ChronicleEntry = {
    tick: 0,
    season: 'thaw',
    text: 'A traveler arrived in Ashenford at the start of the Thaw. No one knew their name. No one asked. The world does not care about you. Not yet.',
    type: 'world',
  };
  const baseMarkets = createMarkets();
  const innMarkets = buildRoadInnMarkets(getRoadInnSites());
  return {
    phase: 'playing',
    isMoving: false,
    health: 100,
    maxHealth: 100,
    hunger: 100,
    tick: 0,
    worldTime: 14 * 2,
    dayNightPhase: 'day',
    weather: createWeatherState(),
    season: 'thaw',
    seasonTick: 0,
    seed: 42,
    inventory: inv,
    hotbar: inventoryToHotbar(inv),
    activeSlot: 0,
    gold: 10,
    skills: createSkillTree(),
    markets: { ...baseMarkets, ...innMarkets },
    reputation: { conquest: 0, trade: 0, craft: 0, diplomacy: 0, exploration: 0, arcane: 0 },
    factions: { amber: 0, iron: 0, green: 0, scholar: 0, ashen: 0, tide: 0 },
    factionStates: createFactions(),
    quests: [],
    bountyBoards: initBountyBoards(),
    currentLocation: 'ashenford',
    nearestLocation: 'ashenford',
    playerX: LOCATION_COORDS.ashenford.x,
    playerY: LOCATION_COORDS.ashenford.y,
    facingDir: { dx: 0, dy: 1 },
    mounted: 'none',
    activeCaveId: null,
    activeDungeonContinent: null,
    activeCaveEntityId: null,
    clearedCaves: {},
    dungeonRun: null,
    regionalModifiers: createRegionalModifiers(),
    escortCaravanId: null,
    campStash: createInventory(),
    activeCampFireId: null,
    npcs,
    activeDialogue: null,
    minorNpcState: {},
    tutorialObjective: 0,
    chronicle: [initialChronicle],
    simEventLog: [],
    progressionVersion: 0,
    milestonesUnlocked: [],
    milestoneCounters: { totalKills: 0, totalGoldEarned: 0, totalItemsCrafted: 0, totalTradeTransactions: 0, totalDungeonsCleared: 0 },
    currentEvent: null,
    lastResult: null,
    visitedLocations: ['ashenford'],
    completedEvents: [],
    playerTitle: 'Unknown Traveler',
    fog,
    housing: createHousing(),
    overlay: 'none',
    tutorialStep: 'movement',
    environmentCooldowns: {},
    shopMarketId: null,
    wildPoiProgress: {},
    battleState: null,
    mana: 30,
    maxMana: 30,
    knownSpells: [],
    spellCooldowns: {},
    synthesisCooldowns: {},
    marketSnapshots: [],
    lastArcTick: 0,
  };
}

interface GameStore extends GameState {
  startGame: () => void;
  setActiveSlot: (slot: number) => void;
  useItem: () => void;
  travel: (locationId: string) => void;
  movePlayer: (dx: number, dy: number) => void;
  makeChoice: (choiceId: string) => void;
  dismissResult: () => void;
  viewChronicle: () => void;
  backToGame: () => void;
  advanceTick: () => void;
  setOverlay: (o: OverlayType) => void;
  advanceTutorial: () => void;
  performEnvironmentAction: (actionId: string) => void;
  interactEntity: () => boolean;
  attackAction: () => void;
  addItemToInventory: (itemId: string, qty: number) => void;
  removeItemFromInventory: (itemId: string, qty: number) => void;
  equipItemAction: (slotIndex: number) => void;
  unequipItemAction: (equipSlot: string) => void;
  craftItemAction: (recipeId: string) => void;
  selectPerkAction: (perkId: string) => void;
  buyItemAction: (itemId: string, qty: number) => void;
  sellItemAction: (itemId: string, qty: number) => void;
  acceptQuest: (quest: Quest) => void;
  purchasePlotAction: (locationId: string) => void;
  setActiveDialogue: (tree: DialogueTree | null) => void;
  finalizeDungeonExit: () => void;
  moveFromCampToBackpack: (campSlotIndex: number) => void;
  moveFromBackpackToCamp: (invSlotIndex: number) => void;
  setEscortCaravan: (entityId: string | null) => void;
  battleStrikeAction: () => void;
  battleGuardAction: () => void;
  battleFleeAction: () => void;
  clearBootError: () => void;
  giftNpc: (npcId: string, itemId: string) => void;
  castSpellAction: (spellId: string) => void;
}

const starterInv = makeStarterInventory();

export const useGameStore = create<GameStore>((set, get) => ({
  phase: 'title',
  isMoving: false,
  health: 100,
  maxHealth: 100,
  hunger: 100,
  tick: 0,
  worldTime: 0,
  dayNightPhase: 'day' as DayNightPhase,
  weather: createWeatherState(),
  season: 'thaw',
  seasonTick: 0,
  seed: 42,
  inventory: starterInv,
  hotbar: inventoryToHotbar(starterInv),
  activeSlot: 0,
  gold: 10,
  skills: createSkillTree(),
  markets: {},
  reputation: { conquest: 0, trade: 0, craft: 0, diplomacy: 0, exploration: 0, arcane: 0 },
  factions: { amber: 0, iron: 0, green: 0, scholar: 0, ashen: 0, tide: 0 },
  factionStates: createFactions(),
  quests: [],
  bountyBoards: {},
  currentLocation: 'ashenford',
  nearestLocation: 'ashenford',
  playerX: LOCATION_COORDS.ashenford.x,
  playerY: LOCATION_COORDS.ashenford.y,
  facingDir: { dx: 0, dy: 1 },
  mounted: 'none' as MountState,
  activeCaveId: null,
  activeDungeonContinent: null,
  activeCaveEntityId: null,
  clearedCaves: {},
  dungeonRun: null,
  regionalModifiers: createRegionalModifiers(),
  escortCaravanId: null,
  campStash: createInventory(),
  activeCampFireId: null,
  npcs: [],
  activeDialogue: null,
  minorNpcState: {},
  tutorialObjective: 0,
  chronicle: [],
  simEventLog: [],
  progressionVersion: 0,
  milestonesUnlocked: [],
  milestoneCounters: { totalKills: 0, totalGoldEarned: 0, totalItemsCrafted: 0, totalTradeTransactions: 0, totalDungeonsCleared: 0 },
  currentEvent: null,
  lastResult: null,
  visitedLocations: [],
  completedEvents: [],
  playerTitle: 'Unknown Traveler',
  fog: createFogMap(),
  housing: createHousing(),
  overlay: 'none',
  tutorialStep: 'cinematic',
  environmentCooldowns: {},
  shopMarketId: null,
  wildPoiProgress: {},
  battleState: null,
  mana: 30,
  maxMana: 30,
  knownSpells: [],
  spellCooldowns: {},
  bootError: null,

  startGame: () => {
    const st = get();
    if (st.phase === 'booting') return;
    if (st.phase !== 'title') return;
    set({ phase: 'booting', bootError: null });
    scheduleAfterPaint(() => {
      try {
        const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
        bootstrapWorldGeometry();
        if (import.meta.env.DEV) {
          console.debug(`[boot] slice1 seed+roads+union+hamlets ${(performance.now() - t0).toFixed(1)}ms`);
        }
        scheduleAfterPaint(() => {
          try {
            const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
            set(buildFreshPlayingStatePayload());
            if (import.meta.env.DEV) {
              console.debug(`[boot] slice2 entities+state ${(performance.now() - t1).toFixed(1)}ms`);
            }
            startTicker();
          } catch (e) {
            console.error('startGame failed', e);
            const msg = e instanceof Error ? e.message : String(e);
            if (import.meta.env.DEV && e instanceof Error && e.stack) console.error(e.stack);
            set({ phase: 'title', bootError: msg });
          }
        });
      } catch (e) {
        console.error('startGame failed', e);
        const msg = e instanceof Error ? e.message : String(e);
        if (import.meta.env.DEV && e instanceof Error && e.stack) console.error(e.stack);
        set({ phase: 'title', bootError: msg });
      }
    });
  },

  clearBootError: () => set({ bootError: null }),

  setActiveSlot: (slot: number) => set({ activeSlot: slot }),

  useItem: () => {
    const state = get();
    if (state.phase === 'battle') return;
    if (state.phase !== 'playing' && state.phase !== 'sailing') return;
    const slot = state.inventory.slots[state.activeSlot];
    if (!slot) return;
    const def = ITEMS[slot.itemId];
    if (!def) return;

    if (def.type === 'food' && def.foodValue) {
      const newHunger = Math.min(100, state.hunger + def.foodValue);
      const newInv = removeFromInventory(state.inventory, slot.itemId, 1);
      const entry: ChronicleEntry = { tick: state.tick, season: state.season, text: `The traveler ate ${def.name}. Hunger abates somewhat.`, type: 'action' };
      set({ hunger: newHunger, inventory: newInv, hotbar: inventoryToHotbar(newInv), chronicle: [...state.chronicle, entry] });
    } else if (def.type === 'potion') {
      let newHealth = state.health;
      let newHunger = state.hunger;
      let newMana = state.mana;
      if (slot.itemId === 'health_potion') newHealth = Math.min(state.maxHealth, newHealth + 30);
      if (slot.itemId === 'stamina_potion') newHunger = Math.min(100, newHunger + 30);
      if (slot.itemId === 'mana_potion') newMana = Math.min(state.maxMana, newMana + 30);
      const newInv = removeFromInventory(state.inventory, slot.itemId, 1);
      const entry: ChronicleEntry = { tick: state.tick, season: state.season, text: `The traveler drank a ${def.name}.`, type: 'action' };
      set({ health: newHealth, hunger: newHunger, mana: newMana, inventory: newInv, hotbar: inventoryToHotbar(newInv), chronicle: [...state.chronicle, entry] });
    } else if (slot.itemId === 'crystal') {
      const manaGain = 15;
      const newMana = Math.min(state.maxMana, state.mana + manaGain);
      const newInv = removeFromInventory(state.inventory, 'crystal', 1);
      const entry: ChronicleEntry = { tick: state.tick, season: state.season, text: `The traveler crushed a Crystal Shard, absorbing its arcane energy (+${manaGain} mana).`, type: 'action' };
      set({ mana: newMana, inventory: newInv, hotbar: inventoryToHotbar(newInv), chronicle: [...state.chronicle, entry] });
    } else if (slot.itemId.startsWith('scroll_')) {
      const spellEntry = Object.values(SPELLS).find(s => s.scrollId === slot.itemId);
      if (!spellEntry) return;
      if (state.knownSpells.includes(spellEntry.id)) {
        set({ lastResult: `You already know ${spellEntry.name}.` });
        return;
      }
      const newInv = removeFromInventory(state.inventory, slot.itemId, 1);
      const newKnown = [...state.knownSpells, spellEntry.id];
      const repGain = 3;
      const newRep = { ...state.reputation, arcane: Math.min(100, state.reputation.arcane + repGain) };
      const entry: ChronicleEntry = { tick: state.tick, season: state.season, text: `The traveler studied the scroll and learned the spell: ${spellEntry.name}.`, type: 'action' };
      toast(`✨ Spell Learned: ${spellEntry.name}`, { description: spellEntry.description, duration: 5000 });
      set({ knownSpells: newKnown, reputation: newRep, inventory: newInv, hotbar: inventoryToHotbar(newInv), chronicle: [...state.chronicle, entry] });
    } else if (slot.itemId === 'realm_map') {
      if (state.phase !== 'playing' && state.phase !== 'sailing') return;
      set({ overlay: state.overlay === 'map' ? 'none' : 'map', lastResult: null });
    } else if (slot.itemId === 'tent_kit') {
      if (state.activeCampFireId && getEntityById(state.activeCampFireId)) {
        set({ lastResult: 'You already have a camp pitched.' });
        return;
      }
      const newInv = removeFromInventory(state.inventory, 'tent_kit', 1);
      const ent = spawnEntity('cooking_fire', state.playerX, state.playerY, { expiresAt: state.worldTime + 900 }, 1);
      const entry: ChronicleEntry = {
        tick: state.tick,
        season: state.season,
        text: 'A small fire is lit; the camp is ready. Press E on the fire to open your field stash.',
        type: 'environment',
      };
      set({
        inventory: newInv,
        hotbar: inventoryToHotbar(newInv),
        activeCampFireId: ent.id,
        chronicle: [...state.chronicle, entry],
        lastResult: null,
      });
    }
  },

  movePlayer: (dx: number, dy: number) => {
    // #region agent log
    const _moveT0 = performance.now();
    // #endregion
    const state = get();
    if (state.currentEvent || state.lastResult || state.phase === 'dead' || state.phase === 'dungeon' || state.phase === 'battle') return;

    const speed = state.mounted === 'horse' ? 2 : 1;
    const nx = state.playerX + dx * speed;
    const ny = state.playerY + dy * speed;

    if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return;
    const tileCode = getTileAt(nx, ny);
    const tileName = TILE_NAMES[tileCode] ?? 'grass';
    if (state.phase === 'sailing') {
      if (tileName !== 'deep_water' && tileName !== 'water' && tileName !== 'river' && tileName !== 'sand') return;
    } else {
      if (!isWalkableCode(tileCode)) return;
    }

    const newFacing = { dx, dy };
    const nearest = findNearestLocation(nx, ny);
    const newChronicle: ChronicleEntry[] = [];
    let newEvent = state.currentEvent;
    let newVisited = state.visitedLocations;
    let currentLoc = state.currentLocation;
    let newTick = state.tick;
    let newSeasonTick = state.seasonTick;
    let newSeason = state.season;

    if (nearest && nearest !== state.nearestLocation) {
      // Hamlets update proximity label but not "current settlement" (markets keyed by major locations)
      currentLoc = isHamletId(nearest) ? state.currentLocation : nearest;
      newTick++;
      newSeasonTick++;
      if (newSeasonTick >= TICKS_PER_SEASON) {
        const idx = SEASON_ORDER.indexOf(state.season);
        newSeason = SEASON_ORDER[(idx + 1) % 4];
        newSeasonTick = 0;
        newChronicle.push({ tick: newTick, season: newSeason, text: `The season turned. ${newSeason === 'thaw' ? 'The ice breaks.' : newSeason === 'summer' ? 'The sun reaches its peak.' : newSeason === 'harvest' ? 'The harvest begins.' : 'Winter falls.'}`, type: 'world' });
      }
      const worldEvent = getWorldEvent(newTick, newSeason);
      if (worldEvent) newChronicle.push({ tick: newTick, season: newSeason, text: worldEvent, type: 'world' });
      if (!state.visitedLocations.includes(nearest)) {
        newVisited = [...state.visitedLocations, nearest];
        newChronicle.push({ tick: newTick, season: newSeason, text: `The traveler arrived in ${nearest.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} for the first time.`, type: 'discovery' });
      }
      const events = generateEvents(nearest, newSeason, newTick, state.completedEvents);
      if (events.length > 0) newEvent = events[0];
    }

    let newHunger = state.hunger;
    let newHealth = state.health;
    let newPhase: GameState['phase'] = state.phase;
    if (newTick > state.tick) {
      const decay = newSeason === 'dark' ? 0.75 : 0.5;
      newHunger = Math.max(0, newHunger - decay);
      if (newHunger === 0) newHealth = Math.max(0, newHealth - 2);
      else if (newHunger < 20) newHealth = Math.max(0, newHealth - 0.5);
      if (newHealth <= 0) newPhase = 'dead';
    }

    // Update fog
    const newFog = revealAroundPlayer(state.fog, nx, ny, 120);

    let tutorialObjective = state.tutorialObjective;
    const newChronicleForMove = [...newChronicle];
    if (
      tutorialObjective === 4 &&
      nearest &&
      nearest !== 'ashenford' &&
      !isHamletId(nearest) &&
      LOCATIONS.some(l => l.id === nearest)
    ) {
      tutorialObjective = 5;
      newChronicleForMove.push({
        tick: newTick,
        season: newSeason,
        text: 'The first journey beyond home soil — the wide world opens.',
        type: 'discovery',
      });
    }

    set({
      playerX: nx, playerY: ny, facingDir: newFacing,
      nearestLocation: nearest, currentLocation: currentLoc,
      tick: newTick, season: newSeason, seasonTick: newSeasonTick,
      visitedLocations: newVisited,
      chronicle: [...state.chronicle, ...newChronicleForMove],
      currentEvent: newEvent,
      hunger: newHunger, health: newHealth, phase: newPhase,
      fog: newFog,
      playerTitle: getPlayerTitle(state.reputation as unknown as Record<string, number>),
      tutorialObjective,
    });
    // #region agent log
    const _moveMs = performance.now() - _moveT0;
    if (_moveMs > 10) {
      fetch('http://127.0.0.1:7891/ingest/68e880b8-e871-43be-946d-757508d96764', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a7e92f' },
        body: JSON.stringify({
          sessionId: 'a7e92f',
          hypothesisId: 'E',
          location: 'gameStore.ts:movePlayer',
          message: 'movePlayer_slow_ms',
          data: { ms: Math.round(_moveMs * 100) / 100, nx, ny, nearest },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
    // #endregion
  },

  travel: (locationId: string) => {
    const state = get();
    const coord = getExtendedLocationCoords()[locationId];
    if (!coord) return;
    const newTick = state.tick + 1;
    const newSeasonTick = state.seasonTick + 1;
    let newSeason = state.season;
    if (newSeasonTick >= TICKS_PER_SEASON) {
      const idx = SEASON_ORDER.indexOf(state.season);
      newSeason = SEASON_ORDER[(idx + 1) % 4];
    }
    const events = generateEvents(locationId, newSeason, newTick, state.completedEvents);
    const worldEvent = getWorldEvent(newTick, newSeason);
    const newChronicle: ChronicleEntry[] = [];
    if (worldEvent) newChronicle.push({ tick: newTick, season: newSeason, text: worldEvent, type: 'world' });
    if (newSeasonTick >= TICKS_PER_SEASON) newChronicle.push({ tick: newTick, season: newSeason, text: `The season turned.`, type: 'world' });
    const visited = state.visitedLocations.includes(locationId);
    if (!visited) newChronicle.push({ tick: newTick, season: newSeason, text: `Arrived in ${locationId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} for the first time.`, type: 'discovery' });
    const decay = newSeason === 'dark' ? 0.75 : 0.5;
    const travelHunger = Math.max(0, state.hunger - decay);
    let travelHealth = state.health;
    let travelPhase: GameState['phase'] = state.phase;
    if (travelHunger === 0) travelHealth = Math.max(0, travelHealth - 2);
    else if (travelHunger < 20) travelHealth = Math.max(0, travelHealth - 0.5);
    if (travelHealth <= 0) travelPhase = 'dead';
    const newFog = revealAroundPlayer(revealLocation(state.fog, coord.x, coord.y), coord.x, coord.y, 120);
    let travelTut = state.tutorialObjective;
    const chronTravel = [...newChronicle];
    if (
      travelTut === 4 &&
      locationId !== 'ashenford' &&
      !isHamletId(locationId) &&
      LOCATIONS.some(l => l.id === locationId)
    ) {
      travelTut = 5;
      chronTravel.push({
        tick: newTick,
        season: newSeason,
        text: 'The first journey beyond home soil — the wide world opens.',
        type: 'discovery',
      });
    }
    set({
      currentLocation: locationId, nearestLocation: locationId,
      playerX: coord.x, playerY: coord.y,
      tick: newTick, season: newSeason,
      seasonTick: newSeasonTick >= TICKS_PER_SEASON ? 0 : newSeasonTick,
      currentEvent: events.length > 0 ? events[0] : null, lastResult: null,
      visitedLocations: visited ? state.visitedLocations : [...state.visitedLocations, locationId],
      chronicle: [...state.chronicle, ...chronTravel],
      hunger: travelHunger, health: travelHealth, phase: travelPhase,
      fog: newFog, mounted: 'none',
      playerTitle: getPlayerTitle(state.reputation as unknown as Record<string, number>),
      tutorialObjective: travelTut,
    });
  },

  makeChoice: (choiceId: string) => {
    const state = get();
    if (!state.currentEvent) return;
    const choice = state.currentEvent.choices.find(c => c.id === choiceId);
    if (!choice) return;
    if (choice.requiresRep) {
      const meetsReqs = Object.entries(choice.requiresRep).every(([key, val]) => state.reputation[key as keyof Reputation] >= (val || 0));
      if (!meetsReqs) return;
    }
    const newRep = { ...state.reputation };
    Object.entries(choice.repEffects).forEach(([key, val]) => { newRep[key as keyof Reputation] = Math.min(100, Math.max(0, newRep[key as keyof Reputation] + (val || 0))); });
    const newFactions = { ...state.factions };
    if (choice.factionEffects) Object.entries(choice.factionEffects).forEach(([key, val]) => { newFactions[key as keyof FactionStanding] = Math.min(100, Math.max(-100, newFactions[key as keyof FactionStanding] + (val || 0))); });
    const newNpcs = [...state.npcs];
    if (choice.npcEffects) choice.npcEffects.forEach(effect => {
      const npc = newNpcs.find(n => n.id === effect.npcId);
      if (npc) { npc.disposition = Math.min(100, Math.max(-100, npc.disposition + effect.disposition)); npc.memories.push({ event: effect.memory, tick: state.tick, sentiment: effect.disposition > 0 ? 'positive' : effect.disposition < 0 ? 'negative' : 'neutral' }); }
      updateEdge('player', effect.npcId, effect.disposition, effect.memory, state.worldTime);
    });
    set({
      reputation: newRep, factions: newFactions, npcs: newNpcs,
      chronicle: [...state.chronicle, { tick: state.tick, season: state.season, text: choice.chronicleText, type: 'action' }],
      lastResult: choice.resultText, currentEvent: null,
      completedEvents: [...state.completedEvents, state.currentEvent.id],
      playerTitle: getPlayerTitle(newRep as unknown as Record<string, number>),
    });
  },

  dismissResult: () => set({ lastResult: null }),
  viewChronicle: () => set({ overlay: 'chronicle' }),
  backToGame: () => set({ overlay: 'none', phase: 'playing' }),
  advanceTick: () => {
    const state = get();
    const newTick = state.tick + 1;
    const worldEvent = getWorldEvent(newTick, state.season);
    const newChronicle: ChronicleEntry[] = [];
    if (worldEvent) newChronicle.push({ tick: newTick, season: state.season, text: worldEvent, type: 'world' });
    set({ tick: newTick, chronicle: [...state.chronicle, ...newChronicle] });
  },
  setOverlay: (o: OverlayType) =>
    set(s => ({
      overlay: o,
      shopMarketId: o === 'shop' ? s.shopMarketId : null,
    })),
  advanceTutorial: () => {
    const state = get();
    const steps: TutorialStep[] = ['cinematic', 'movement', 'hotkeys', 'landmark', 'done'];
    const idx = steps.indexOf(state.tutorialStep);
    if (idx < steps.length - 1) set({ tutorialStep: steps[idx + 1] });
  },

  performEnvironmentAction: (actionId: string) => {
    const state = get();
    const action = ENVIRONMENT_ACTIONS.find(a => a.id === actionId);
    if (!action) return;
    if (state.environmentCooldowns[actionId] && state.tick < state.environmentCooldowns[actionId]) return;
    const newRep = { ...state.reputation };
    Object.entries(action.repEffects).forEach(([key, val]) => { newRep[key as keyof Reputation] = Math.min(100, Math.max(0, newRep[key as keyof Reputation] + (val || 0))); });
    let newInv = state.inventory;
    if (action.itemReward) newInv = addToInventory(newInv, action.itemReward.id, action.itemReward.quantity);
    const newSkills = addXp(state.skills, 'crafting', 5);
    const entry: ChronicleEntry = { tick: state.tick, season: state.season, text: action.chronicleText, type: 'environment' };
    let tut = state.tutorialObjective;
    if (tut === 0 && countItem(newInv, 'wood') >= 3) tut = 1;
    set({
      reputation: newRep, inventory: newInv, hotbar: inventoryToHotbar(newInv),
      skills: newSkills,
      lastResult: action.resultText,
      chronicle: [...state.chronicle, entry],
      environmentCooldowns: { ...state.environmentCooldowns, [actionId]: state.tick + action.cooldownTicks },
      playerTitle: getPlayerTitle(newRep as unknown as Record<string, number>),
      tutorialObjective: tut,
    });
  },

  // Returns true if an entity interaction was handled (A13 fix)
  interactEntity: () => {
    const state = get();
    if (state.phase === 'battle') return false;
    const nearby = getEntitiesNear(state.playerX, state.playerY, 3);

    // Dismount horse
    if (state.mounted === 'horse') {
      spawnEntity('horse', state.playerX, state.playerY, {});
      set({ mounted: 'none' });
      return true;
    }

    // Dismount boat
    if (state.phase === 'sailing') {
      const tileCode = getTileAt(state.playerX, state.playerY);
      const tileName = TILE_NAMES[tileCode] ?? '';
      if (tileName === 'sand' || tileName === 'water') {
        spawnEntity('boat', state.playerX, state.playerY, { docked: false });
        const entry: ChronicleEntry = { tick: state.tick, season: state.season, text: 'The traveler stepped ashore.', type: 'action' };
        set({ phase: 'playing', mounted: 'none', chronicle: [...state.chronicle, entry] });
        return true;
      }
      return false;
    }

    // Mount horse
    const horse = nearby.find(e => e.kind === 'horse');
    if (horse) {
      removeEntity(horse.id);
      set({ mounted: 'horse' });
      return true;
    }

    // Mount boat
    const boat = nearby.find(e => e.kind === 'boat');
    if (boat) {
      removeEntity(boat.id);
      const entry: ChronicleEntry = { tick: state.tick, season: state.season, text: 'The traveler boarded a boat and set sail.', type: 'action' };
      set({ phase: 'sailing', mounted: 'boat', chronicle: [...state.chronicle, entry] });
      return true;
    }

    const wildPoi = findNearestWildernessPoi(state.playerX, state.playerY, 5);
    if (wildPoi && state.phase === 'playing') {
      const o = wildPoi.obj;
      const poiKey = o.poiId ?? `w_${o.x}_${o.y}_${o.type}`;
      const prog = state.wildPoiProgress[poiKey] ?? {};
      const w0 = Object.values(state.weather)[0];
      const weatherStr = (w0?.state ?? 'clear') as import('./gameTypes').WeatherState;

      if (o.type === 'poi_lakeshore') {
        if (countItem(state.inventory, 'fishing_rod') < 1) {
          set({ lastResult: 'You need a fishing rod to fish here.' });
          return true;
        }
        if (state.tick - (prog.lastFishTick ?? -999) < 5) {
          set({ lastResult: 'The line needs time to settle.' });
          return true;
        }
        const loot = rollFishingLoot({
          continent: getContinentAt(state.playerX, state.playerY),
          season: state.season,
          weather: weatherStr,
          regional: state.regionalModifiers,
          craftingLevel: state.skills.crafting.level,
          seedSalt: o.x * 10007 + o.y + state.tick,
        });
        let inv = state.inventory;
        const lines: string[] = [];
        for (const row of loot) {
          inv = addToInventory(inv, row.itemId, row.qty);
          lines.push(`${row.qty}× ${ITEMS[row.itemId]?.name ?? row.itemId}`);
        }
        const newSkills = loot.length ? addXp(state.skills, 'crafting', 4) : state.skills;
        set({
          inventory: inv,
          hotbar: inventoryToHotbar(inv),
          skills: newSkills,
          wildPoiProgress: { ...state.wildPoiProgress, [poiKey]: { ...prog, lastFishTick: state.tick } },
          lastResult: loot.length ? `You haul up: ${lines.join(', ')}.` : 'Nothing bites this time.',
          chronicle: loot.length
            ? [...state.chronicle, { tick: state.tick, season: state.season, text: `Fished at a lakeshore (${lines.join(', ')}).`, type: 'environment' }]
            : state.chronicle,
        });
        return true;
      }

      if (o.type === 'poi_wrecked_cart') {
        if (prog.looted) {
          set({ lastResult: 'The cart has already been picked clean.' });
          return true;
        }
        const loot = getKillLoot('bandit', o.x * 1000 + o.y);
        let inv = state.inventory;
        let gold = state.gold + loot.gold;
        for (const row of loot.items) inv = addToInventory(inv, row.itemId, row.qty);
        set({
          inventory: inv,
          hotbar: inventoryToHotbar(inv),
          gold,
          wildPoiProgress: { ...state.wildPoiProgress, [poiKey]: { ...prog, looted: true } },
          lastResult: 'You salvage what you can from the wreckage.',
          chronicle: [
            ...state.chronicle,
            { tick: state.tick, season: state.season, text: 'The traveler searched a wrecked cart by the road.', type: 'action' },
          ],
        });
        return true;
      }

      if (o.type === 'poi_chapel') {
        const heal = Math.min(state.maxHealth, state.health + 8);
        set({
          health: heal,
          wildPoiProgress: { ...state.wildPoiProgress, [poiKey]: { ...prog, spoken: true } },
          lastResult: 'A quiet moment beneath the stones. You feel steadier.',
          chronicle: [
            ...state.chronicle,
            { tick: state.tick, season: state.season, text: 'The traveler rested in a roadside chapel.', type: 'environment' },
          ],
        });
        return true;
      }

      if (o.type === 'poi_standing_stone') {
        set({
          wildPoiProgress: { ...state.wildPoiProgress, [poiKey]: { ...prog, spoken: true } },
          lastResult: 'Old marks circle the stone. Whatever they meant, the wind has kept the secret.',
          chronicle: [
            ...state.chronicle,
            { tick: state.tick, season: state.season, text: 'The traveler studied a circle of standing stones.', type: 'discovery' },
          ],
        });
        return true;
      }

      if (o.type === 'poi_knight_camp') {
        const bs: BattleState = {
          foeKind: 'knight',
          foeHp: 55,
          foeMaxHp: 55,
          label: 'Knight-errant',
          playerGuarded: false,
          log: ['An armored figure rises to meet you.'],
        };
        set({
          phase: 'battle',
          battleState: bs,
          lastResult: null,
          chronicle: [
            ...state.chronicle,
            { tick: state.tick, season: state.season, text: 'A duel begins at a knight’s camp.', type: 'action' },
          ],
        });
        return true;
      }

      if (o.type === 'poi_monster_lair') {
        const bs: BattleState = {
          foeKind: 'warband',
          foeHp: 70,
          foeMaxHp: 70,
          label: 'Lair raiders',
          playerGuarded: false,
          log: ['Something hungry stirs in the dark.'],
        };
        set({
          phase: 'battle',
          battleState: bs,
          lastResult: null,
          chronicle: [
            ...state.chronicle,
            { tick: state.tick, season: state.season, text: 'The traveler challenged a monster lair.', type: 'action' },
          ],
        });
        return true;
      }

      if (o.type === 'poi_road_inn') {
        const innId = o.poiId ?? poiKey;
        const minorKey = innId;
        const prevMinor = state.minorNpcState[minorKey] ?? { memories: [], disposition: 0, lastSeenTick: 0 };
        const memLine = 'Stopped at a roadside inn along the trade way.';
        const nextMinor = {
          ...state.minorNpcState,
          [minorKey]: {
            memories: [...prevMinor.memories.filter(m => !m.startsWith('Spoke at tick')), memLine].slice(-12),
            disposition: prevMinor.disposition,
            lastSeenTick: state.tick,
          },
        };
        const tree = roadInnDialogue(innId);
        const continent = getContinentAt(state.playerX, state.playerY) ?? 'auredia';
        const wx = Object.values(state.weather)[0];
        const weatherStr = wx?.state ?? 'clear';
        if (isGeminiConfigured()) {
          void (async () => {
            const st = get();
            const minor = st.minorNpcState[minorKey] ?? { memories: [], disposition: 0, lastSeenTick: 0 };
            const res = await generateNpcDialogue({
              npcName: 'Innkeeper',
              npcJob: 'innkeeper',
              npcPersonality: 'Warm, watchful, remembers regulars and prices.',
              location: 'a roadside inn on the trade way',
              continent,
              season: st.season,
              weather: weatherStr,
              dayPhase: st.dayNightPhase,
              playerReputation: st.reputation as unknown as Record<string, number>,
              npcDisposition: minor.disposition,
              npcMemories: minor.memories,
              recentChronicle: st.chronicle.slice(-5).map(c => c.text),
              worldEvents: worldEventsFromRegional(st),
              tileSummary: `Road inn (${Math.round(st.playerX)}, ${Math.round(st.playerY)})`,
            });
            if (res) {
              const opts = res.options.map(o2 => o2.text);
              set({ activeDialogue: runtimeDialogueFromGemini(minorKey, 'Innkeeper', res.npcText, opts) });
            }
          })();
        }
        set({ minorNpcState: nextMinor, activeDialogue: tree });
        return true;
      }
    }

    // Enter cave/dungeon
    const cave = nearby.find(e => e.kind === 'cave_entrance');
    if (cave) {
      const caveId = parseInt(cave.id.split('_').pop() ?? '1') || 1;
      const entry: ChronicleEntry = { tick: state.tick, season: state.season, text: 'The traveler descended into the darkness...', type: 'discovery' };
      const activeDungeonContinent = getContinentAt(state.playerX, state.playerY) ?? 'auredia';
      set({
        phase: 'dungeon',
        activeCaveId: caveId,
        activeDungeonContinent,
        activeCaveEntityId: cave.id,
        dungeonRun: { caveId, bossDefeated: false, depthTier: 1 + (caveId % 4) },
        chronicle: [...state.chronicle, entry],
      });
      return true;
    }

    const caravan = nearby.find(e => e.kind === 'caravan');
    if (caravan) {
      if (state.escortCaravanId === caravan.id) {
        set({ lastResult: 'You are already escorting this caravan. Stay close when it reaches a yard.' });
        return true;
      }
      set({
        escortCaravanId: caravan.id,
        lastResult: 'You fall in with the wagons. Keep within a dozen paces when they reach a market for your fee.',
        chronicle: [
          ...state.chronicle,
          { tick: state.tick, season: state.season, text: 'The traveler offered escort to a merchant train.', type: 'action' },
        ],
      });
      return true;
    }

    const fire = nearby.find(e => e.kind === 'cooking_fire');
    if (fire) {
      if (state.overlay === 'camp') set({ overlay: 'none' });
      else set({ overlay: 'camp' });
      return true;
    }

    // Talk to settlement or hamlet NPC (nearest wins)
    let talkNpc: (typeof nearby)[number] | undefined;
    let talkBest = Infinity;
    for (const e of nearby) {
      if (e.kind !== 'settlement_npc' && e.kind !== 'hamlet_npc') continue;
      const d = Math.hypot(e.x - state.playerX, e.y - state.playerY);
      if (d < talkBest) {
        talkBest = d;
        talkNpc = e;
      }
    }
    if (talkNpc) {
      const data = talkNpc.data as Record<string, unknown>;
      const npcId = data.npcId as string | undefined;
      const minorKey = (data.minorKey as string) ?? npcId ?? talkNpc.id;
      const name = (data.name as string) ?? 'Stranger';
      const job = (data.job as string) ?? 'commoner';
      const hamletName = (data.hamletName as string) ?? 'the road';
      const continent = getContinentAt(state.playerX, state.playerY) ?? 'auredia';
      const wx = Object.values(state.weather)[0];
      const weatherStr = wx?.state ?? 'clear';
      let tree: DialogueTree | undefined;
      if (npcId) tree = getDialogueTree(npcId);
      if (!tree) tree = genericDialogue(minorKey, name, job);

      const prevMinor = state.minorNpcState[minorKey] ?? { memories: [], disposition: 0, lastSeenTick: 0 };
      const memAppend = minorKey.startsWith('road_inn_')
        ? 'Heard rumors at a roadside inn.'
        : `Spoke at tick ${state.tick}`;
      const nextMinor = {
        ...state.minorNpcState,
        [minorKey]: {
          memories: [...prevMinor.memories, memAppend].slice(-12),
          disposition: prevMinor.disposition,
          lastSeenTick: state.tick,
        },
      };
      let newNpcs = state.npcs;
      if (npcId) {
        newNpcs = state.npcs.map(n =>
          n.id === npcId
            ? { ...n, memories: [...n.memories, { event: 'Conversation', tick: state.tick, sentiment: 'neutral' as const }].slice(-10) }
            : n,
        );
      }

      if (talkNpc.kind === 'hamlet_npc' && isGeminiConfigured()) {
        void (async () => {
          const st = get();
          const minor = st.minorNpcState[minorKey] ?? { memories: [], disposition: 0, lastSeenTick: 0 };
          const res = await generateNpcDialogue({
            npcName: name,
            npcJob: job,
            npcPersonality: 'a local who has lived along this road for years',
            location: hamletName,
            continent,
            season: st.season,
            weather: weatherStr,
            dayPhase: st.dayNightPhase,
            playerReputation: st.reputation as unknown as Record<string, number>,
            npcDisposition: minor.disposition,
            npcMemories: minor.memories,
            recentChronicle: st.chronicle.slice(-5).map(c => c.text),
            worldEvents: worldEventsFromRegional(st),
            tileSummary: `Overworld tile (${Math.round(st.playerX)}, ${Math.round(st.playerY)}), ${st.dayNightPhase}`,
          });
          if (res) {
            const opts = res.options.map(o => o.text);
            set({ activeDialogue: runtimeDialogueFromGemini(minorKey, name, res.npcText, opts) });
          }
        })();
      }
      set({ minorNpcState: nextMinor, npcs: newNpcs, activeDialogue: tree });
      return true;
    }

    // Gather resources
    const resource = nearby.find(e => e.kind.startsWith('resource_'));
    if (resource) {
      const itemMap: Record<string, string> = { resource_tree: 'wood', resource_rock: 'stone', resource_iron: 'iron_ore', resource_herb: 'herb', resource_berry: 'berries' };
      const itemId = itemMap[resource.kind] ?? 'wood';
      const qty = state.skills.crafting.perks.includes('double_yield') ? 2 : 1;
      removeEntity(resource.id);
      const newInv = addToInventory(state.inventory, itemId, qty);
      const newSkills = addXp(state.skills, 'crafting', 3);
      const entry: ChronicleEntry = { tick: state.tick, season: state.season, text: `Gathered ${ITEMS[itemId]?.name ?? itemId}.`, type: 'environment' };
      let tut = state.tutorialObjective;
      if (tut === 0 && countItem(newInv, 'wood') >= 3) tut = 1;
      set({ inventory: newInv, hotbar: inventoryToHotbar(newInv), skills: newSkills, chronicle: [...state.chronicle, entry], tutorialObjective: tut });
      return true;
    }

    return false;
  },

  attackAction: () => {
    const state = get();
    if (state.phase === 'battle') return;
    if (state.phase !== 'playing') return;
    const result = playerAttack(state.playerX, state.playerY, state.facingDir.dx, state.facingDir.dy, state.inventory, state.skills);
    if (!result) return;
    const newSkills = addXp(state.skills, 'combat', result.xpGain);
    const newChronicle: ChronicleEntry[] = [];
    let inv = state.inventory;
    let gold = state.gold;
    if (result.killed && result.loot) {
      for (const row of result.loot.items) {
        inv = addToInventory(inv, row.itemId, row.qty);
      }
      gold += result.loot.gold;
      const kindLabel = result.targetKind ?? 'foe';
      newChronicle.push({
        tick: state.tick,
        season: state.season,
        text: `The traveler felled a ${kindLabel}. (+${result.xpGain} combat XP)`,
        type: 'action',
      });
    } else if (result.killed) {
      newChronicle.push({ tick: state.tick, season: state.season, text: `The traveler slew an enemy. (+${result.xpGain} combat XP)`, type: 'action' });
    }

    // Check if killed enemies advance any kill quests
    const newQuests = state.quests.map(q => {
      if (q.state !== 'active') return q;
      const step = q.steps.find(s => !s.completed && s.type === 'kill');
      if (step && result.killed) return { ...q, steps: q.steps.map(s => s === step ? { ...s, completed: true } : s) };
      return q;
    });

    let tut = state.tutorialObjective;
    if (result.killed && ['deer', 'sheep', 'rabbit'].includes(String(result.targetKind)) && tut === 2) tut = 3;

    const newCounters = result.killed
      ? { ...state.milestoneCounters, totalKills: state.milestoneCounters.totalKills + 1, totalGoldEarned: state.milestoneCounters.totalGoldEarned + (result.loot?.gold ?? 0) }
      : state.milestoneCounters;
    const ms = applyMilestoneCheck({ ...state, skills: newSkills, inventory: inv, gold, milestoneCounters: newCounters });

    set({
      skills: ms.skills,
      reputation: ms.reputation,
      playerTitle: ms.playerTitle,
      quests: newQuests,
      inventory: inv,
      hotbar: inventoryToHotbar(inv),
      gold: gold + ms.goldBonus,
      milestoneCounters: newCounters,
      milestonesUnlocked: ms.milestonesUnlocked,
      chronicle: [...state.chronicle, ...newChronicle, ...ms.extraChronicle],
      tutorialObjective: tut,
    });
  },

  addItemToInventory: (itemId: string, qty: number) => {
    const state = get();
    const newInv = addToInventory(state.inventory, itemId, qty);
    set({ inventory: newInv, hotbar: inventoryToHotbar(newInv) });
  },

  removeItemFromInventory: (itemId: string, qty: number) => {
    const state = get();
    const newInv = removeFromInventory(state.inventory, itemId, qty);
    set({ inventory: newInv, hotbar: inventoryToHotbar(newInv) });
  },

  equipItemAction: (slotIndex: number) => {
    const state = get();
    const newInv = equipItem(state.inventory, slotIndex);
    set({ inventory: newInv, hotbar: inventoryToHotbar(newInv) });
  },

  unequipItemAction: (equipSlot: string) => {
    const state = get();
    const newInv = unequipItem(state.inventory, equipSlot);
    set({ inventory: newInv, hotbar: inventoryToHotbar(newInv) });
  },

  craftItemAction: (recipeId: string) => {
    const state = get();
    const recipe = RECIPES.find(r => r.id === recipeId);
    const nearFire = playerNearCookingFire(state.playerX, state.playerY);
    if (!recipe || !canCraft(state.inventory, recipe, state.skills as any, { nearCookingFire: nearFire })) {
      if (recipe?.requiresCookingFire && countItem(state.inventory, 'portable_stove') < 1 && !nearFire) {
        set({ lastResult: 'You need a campfire nearby or a portable stove to cook meat.' });
      }
      return;
    }
    const newInv = craft(state.inventory, recipe);
    const newSkills = addXp(state.skills, 'crafting', 10);
    const entry: ChronicleEntry = { tick: state.tick, season: state.season, text: `Crafted ${recipe.name}.`, type: 'action' };
    let tut = state.tutorialObjective;
    if (recipe.id === 'craft_wooden_club' && tut === 1) tut = 2;
    if (recipe.id === 'cook_meat' && tut === 3) tut = 4;
    const newCounters = { ...state.milestoneCounters, totalItemsCrafted: state.milestoneCounters.totalItemsCrafted + 1 };
    const ms = applyMilestoneCheck({ ...state, skills: newSkills, inventory: newInv, milestoneCounters: newCounters });
    set({
      inventory: newInv,
      hotbar: inventoryToHotbar(newInv),
      skills: ms.skills,
      reputation: ms.reputation,
      playerTitle: ms.playerTitle,
      gold: state.gold + ms.goldBonus,
      milestoneCounters: newCounters,
      milestonesUnlocked: ms.milestonesUnlocked,
      chronicle: [...state.chronicle, entry, ...ms.extraChronicle],
      tutorialObjective: tut,
    });
  },

  selectPerkAction: (perkId: string) => {
    const state = get();
    set({ skills: selectPerk(state.skills, perkId) });
  },

  buyItemAction: (itemId: string, qty: number) => {
    const state = get();
    const mkey = state.shopMarketId ?? state.currentLocation;
    const market = state.markets[mkey];
    if (!market) return;
    const mItem = market.items.find(i => i.itemId === itemId);
    if (!mItem || mItem.stock < qty) return;
    const scarcity = mItem.stock < 3 ? 2.0 : mItem.stock < 8 ? 1.3 : mItem.stock > 20 ? 0.7 : 1.0;
    let price = Math.max(1, Math.round(mItem.basePrice * mItem.priceMultiplier * scarcity));
    const locals = state.npcs.filter(n => n.location === state.currentLocation || n.location === mkey);
    const bestDisp = locals.length ? Math.max(...locals.map(n => n.disposition)) : 0;
    const discount = Math.min(0.12, Math.max(0, bestDisp) / 120);
    price = Math.max(1, Math.round(price * (1 - discount)));
    const totalCost = price * qty;
    if (state.gold < totalCost) return;
    const newInv = addToInventory(state.inventory, itemId, qty);
    const newMarket = { ...market, items: market.items.map(i => i.itemId === itemId ? { ...i, stock: i.stock - qty } : i) };
    const minorKey = state.shopMarketId;
    let minorPatch = state.minorNpcState;
    if (minorKey?.startsWith('road_inn_')) {
      const prev = state.minorNpcState[minorKey] ?? { memories: [], disposition: 0, lastSeenTick: 0 };
      minorPatch = {
        ...state.minorNpcState,
        [minorKey]: {
          ...prev,
          memories: [...prev.memories, `Purchased ${itemId} at the inn`].slice(-12),
          lastSeenTick: state.tick,
        },
      };
    }
    const seq = state.simEventLog.length;
    const tradeEv = recordPlayerShopBuy({
      worldTime: state.worldTime,
      gameTick: state.tick,
      season: state.season,
      marketKey: mkey,
      itemId,
      qty,
      goldBefore: state.gold,
      goldAfter: state.gold - totalCost,
      stockBefore: mItem.stock,
      stockAfter: mItem.stock - qty,
      seq,
    });
    const simLog = appendSimEvents(state.simEventLog, [tradeEv], SIM_EVENT_CAP);
    const chronSim = simEventsToChronicleEntries([tradeEv]);
    const newCounters = { ...state.milestoneCounters, totalTradeTransactions: state.milestoneCounters.totalTradeTransactions + 1 };
    const ms = applyMilestoneCheck({ ...state, gold: state.gold - totalCost, inventory: newInv, milestoneCounters: newCounters });
    set({
      gold: state.gold - totalCost + ms.goldBonus,
      inventory: newInv,
      hotbar: inventoryToHotbar(newInv),
      markets: { ...state.markets, [mkey]: newMarket },
      minorNpcState: minorPatch,
      simEventLog: simLog,
      milestoneCounters: newCounters,
      milestonesUnlocked: ms.milestonesUnlocked,
      reputation: ms.reputation,
      playerTitle: ms.playerTitle,
      chronicle: [...state.chronicle, ...chronSim, ...ms.extraChronicle],
    });
  },

  battleStrikeAction: () => {
    const state = get();
    if (state.phase !== 'battle' || !state.battleState) return;
    const bs = state.battleState;
    const dmg = computePlayerStrikeDamage(state.inventory, state.skills, bs.playerGuarded ? 0.88 : 1);
    let foeHp = Math.max(0, bs.foeHp - dmg);
    const log = [...bs.log, `You strike for ${dmg}.`];
    let nextBattle: BattleState | null = { ...bs, foeHp, playerGuarded: false, log };
    let phase = state.phase;
    let inv = state.inventory;
    let gold = state.gold;
    let skills = addXp(state.skills, 'combat', Math.max(1, Math.floor(dmg * 0.35)));
    let health = state.health;
    let chron = state.chronicle;
    if (foeHp <= 0) {
      const loot = getKillLoot(bs.foeKind, state.tick + dmg);
      for (const row of loot.items) inv = addToInventory(inv, row.itemId, row.qty);
      gold += loot.gold;
      skills = addXp(skills, 'combat', getKillXp(bs.foeKind));
      chron = [
        ...state.chronicle,
        {
          tick: state.tick,
          season: state.season,
          text: `The traveler won a duel against ${bs.label}.`,
          type: 'action' as const,
        },
      ];
      phase = 'playing';
      nextBattle = null;
    } else {
      const foeEnt = { id: 'battle_foe', kind: bs.foeKind, x: 0, y: 0, hp: 1, maxHp: 1, data: {} } as WorldEntity;
      let hit = enemyAttackDamage(foeEnt, getTotalArmor(state.inventory));
      if (bs.playerGuarded) hit = Math.max(1, Math.floor(hit * 0.55));
      health = Math.max(0, health - hit);
      nextBattle.log = [...nextBattle.log, `${bs.label} strikes for ${hit}.`];
      if (health <= 0) {
        phase = 'dead';
        nextBattle = null;
        chron = [...state.chronicle, { tick: state.tick, season: state.season, text: 'The traveler fell in single combat.', type: 'action' as const }];
      }
    }
    const killed = foeHp <= 0;
    const killLootGold = killed ? getKillLoot(bs.foeKind, state.tick).gold : 0;
    const newCounters = killed
      ? { ...state.milestoneCounters, totalKills: state.milestoneCounters.totalKills + 1, totalGoldEarned: state.milestoneCounters.totalGoldEarned + killLootGold }
      : state.milestoneCounters;
    const ms = killed ? applyMilestoneCheck({ ...state, skills, inventory: inv, gold, milestoneCounters: newCounters }) : null;
    set({
      phase,
      battleState: nextBattle,
      inventory: inv,
      hotbar: inventoryToHotbar(inv),
      gold: gold + (ms?.goldBonus ?? 0),
      skills: ms?.skills ?? skills,
      health,
      chronicle: [...chron, ...(ms?.extraChronicle ?? [])],
      ...(killed ? { milestoneCounters: newCounters, milestonesUnlocked: ms!.milestonesUnlocked, reputation: ms!.reputation, playerTitle: ms!.playerTitle } : {}),
    });
  },

  battleGuardAction: () => {
    const state = get();
    if (state.phase !== 'battle' || !state.battleState) return;
    const bs = { ...state.battleState, playerGuarded: true, log: [...state.battleState.log, 'You raise your guard.'] };
    const foeEnt = { id: 'battle_foe', kind: bs.foeKind, x: 0, y: 0, hp: 1, maxHp: 1, data: {} } as WorldEntity;
    let hit = enemyAttackDamage(foeEnt, getTotalArmor(state.inventory));
    hit = Math.max(1, Math.floor(hit * 0.55));
    const health = Math.max(0, state.health - hit);
    bs.log = [...bs.log, `${bs.label} strikes for ${hit} (guarded).`];
    let phase: typeof state.phase = 'battle';
    let nextBattle: BattleState | null = bs;
    let chron = state.chronicle;
    if (health <= 0) {
      phase = 'dead';
      nextBattle = null;
      chron = [...state.chronicle, { tick: state.tick, season: state.season, text: 'The traveler fell in single combat.', type: 'action' as const }];
    }
    set({ phase, battleState: nextBattle, health, chronicle: chron });
  },

  battleFleeAction: () => {
    const state = get();
    if (state.phase !== 'battle' || !state.battleState) return;
    const ok = Math.random() < 0.58;
    if (ok) {
      set({
        phase: 'playing',
        battleState: null,
        lastResult: 'You break away from the duel.',
        chronicle: [
          ...state.chronicle,
          { tick: state.tick, season: state.season, text: 'The traveler fled from a duel.', type: 'action' },
        ],
      });
      return;
    }
    const bs = state.battleState;
    const foeEnt = { id: 'battle_foe', kind: bs.foeKind, x: 0, y: 0, hp: 1, maxHp: 1, data: {} } as WorldEntity;
    const hit = enemyAttackDamage(foeEnt, getTotalArmor(state.inventory));
    const health = Math.max(0, state.health - hit);
    const log = [...bs.log, `You stumble—${bs.label} strikes for ${hit}.`];
    let phase: typeof state.phase = 'battle';
    let nextBattle: BattleState | null = { ...bs, log, playerGuarded: false };
    let chron = state.chronicle;
    if (health <= 0) {
      phase = 'dead';
      nextBattle = null;
      chron = [...state.chronicle, { tick: state.tick, season: state.season, text: 'The traveler fell trying to flee.', type: 'action' as const }];
    }
    set({ phase, battleState: nextBattle, health, chronicle: chron });
  },

  sellItemAction: (itemId: string, qty: number) => {
    const state = get();
    const def = ITEMS[itemId];
    if (!def) return;
    const inv = state.inventory;
    let count = 0;
    for (const s of inv.slots) if (s && s.itemId === itemId) count += s.qty;
    if (count < qty) return;
    const sellPrice = Math.max(1, Math.floor((def.value ?? 1) * 0.6));
    const revenue = sellPrice * qty;
    const newInv = removeFromInventory(state.inventory, itemId, qty);
    const seq = state.simEventLog.length;
    const tradeEv = recordPlayerShopSell({
      worldTime: state.worldTime,
      gameTick: state.tick,
      season: state.season,
      itemId,
      qty,
      goldBefore: state.gold,
      goldAfter: state.gold + revenue,
      seq,
    });
    const simLog = appendSimEvents(state.simEventLog, [tradeEv], SIM_EVENT_CAP);
    const chronSim = simEventsToChronicleEntries([tradeEv]);
    const newCounters = { ...state.milestoneCounters, totalTradeTransactions: state.milestoneCounters.totalTradeTransactions + 1, totalGoldEarned: state.milestoneCounters.totalGoldEarned + revenue };
    const ms = applyMilestoneCheck({ ...state, gold: state.gold + revenue, inventory: newInv, milestoneCounters: newCounters });
    set({
      gold: state.gold + revenue + ms.goldBonus,
      inventory: newInv,
      hotbar: inventoryToHotbar(newInv),
      simEventLog: simLog,
      milestoneCounters: newCounters,
      milestonesUnlocked: ms.milestonesUnlocked,
      reputation: ms.reputation,
      playerTitle: ms.playerTitle,
      chronicle: [...state.chronicle, ...chronSim, ...ms.extraChronicle],
    });
  },

  acceptQuest: (quest: Quest) => {
    const state = get();
    if (state.quests.some(q => q.id === quest.id)) return;
    set({ quests: [...state.quests, quest] });
  },

  purchasePlotAction: (locationId: string) => {
    const state = get();
    const price = PLOT_PRICES[locationId];
    if (!price || state.gold < price) return;
    const plot = state.housing.plots[locationId];
    if (!plot || plot.purchased) return;
    set({ gold: state.gold - price, housing: purchasePlot(state.housing, locationId) });
  },

  setActiveDialogue: (tree: DialogueTree | null) => set({ activeDialogue: tree }),

  setEscortCaravan: (entityId: string | null) => set({ escortCaravanId: entityId }),

  moveFromCampToBackpack: (campSlotIndex: number) => {
    const state = get();
    const slot = state.campStash.slots[campSlotIndex];
    if (!slot) return;
    let inv = addToInventory(state.inventory, slot.itemId, slot.qty);
    const camp = { ...state.campStash, slots: state.campStash.slots.map((s, i) => (i === campSlotIndex ? null : s)) };
    set({ inventory: inv, hotbar: inventoryToHotbar(inv), campStash: camp });
  },

  moveFromBackpackToCamp: (invSlotIndex: number) => {
    const state = get();
    const slot = state.inventory.slots[invSlotIndex];
    if (!slot) return;
    const empty = state.campStash.slots.findIndex(s => s === null);
    if (empty === -1) {
      set({ lastResult: 'Camp stash is full.' });
      return;
    }
    const invSlots = state.inventory.slots.map((s, i) => (i === invSlotIndex ? null : s));
    const inv = { ...state.inventory, slots: invSlots };
    const campSlots = state.campStash.slots.map(s => (s ? { ...s } : null));
    campSlots[empty] = { itemId: slot.itemId, qty: slot.qty };
    set({ inventory: inv, hotbar: inventoryToHotbar(inv), campStash: { ...state.campStash, slots: campSlots } });
  },

  finalizeDungeonExit: () => {
    const state = get();
    if (state.phase !== 'dungeon') return;
    const run = state.dungeonRun;
    let inv = state.inventory;
    const clears = { ...state.clearedCaves };
    const entries: ChronicleEntry[] = [];
    if (run) {
      const last = clears[run.caveId] ?? 0;
      const cooldownOk = state.worldTime - last > 360;
      if (cooldownOk) {
        clears[run.caveId] = state.worldTime;
        const tier = run.depthTier;
        inv = addToInventory(inv, 'gold_coin', Math.min(4, 1 + (tier % 4)));
        if (tier >= 4) inv = addToInventory(inv, 'crystal', 1);
        if (tier > 3) inv = addToInventory(inv, 'void_sigil', 1);
        entries.push({
          tick: state.tick,
          season: state.season,
          text: 'You surface from the cave — a few coins jingle from the expedition purse.',
          type: 'discovery',
        });
      } else {
        entries.push({
          tick: state.tick,
          season: state.season,
          text: 'The cave yielded little this soon after your last delve.',
          type: 'environment',
        });
      }
    }
    const wasCooldownOk = run ? (state.worldTime - (state.clearedCaves[run.caveId] ?? 0)) > 360 : false;
    const newCounters = (run && wasCooldownOk)
      ? { ...state.milestoneCounters, totalDungeonsCleared: state.milestoneCounters.totalDungeonsCleared + 1 }
      : state.milestoneCounters;
    const ms = (run && wasCooldownOk) ? applyMilestoneCheck({ ...state, inventory: inv, milestoneCounters: newCounters }) : null;
    set({
      phase: 'playing',
      activeCaveId: null,
      activeDungeonContinent: null,
      activeCaveEntityId: null,
      dungeonRun: null,
      inventory: inv,
      hotbar: inventoryToHotbar(inv),
      clearedCaves: clears,
      gold: state.gold + (ms?.goldBonus ?? 0),
      milestoneCounters: newCounters,
      ...(ms ? { milestonesUnlocked: ms.milestonesUnlocked, skills: ms.skills, reputation: ms.reputation, playerTitle: ms.playerTitle } : {}),
      chronicle: [...state.chronicle, ...entries, ...(ms?.extraChronicle ?? [])],
    });
  },

  giftNpc: (npcId: string, itemId: string) => {
    const state = get();
    const def = ITEMS[itemId];
    if (!def || !def.value || countItem(state.inventory, itemId) < 1) return;
    const newInv = removeFromInventory(state.inventory, itemId, 1);
    const dispGain = Math.max(2, Math.min(15, Math.floor(def.value * 0.4)));

    // Update named NPC
    let newNpcs = state.npcs;
    const npcIdx = state.npcs.findIndex(n => n.id === npcId);
    if (npcIdx >= 0) {
      newNpcs = [...state.npcs];
      const npc = { ...newNpcs[npcIdx] };
      npc.disposition = Math.min(100, npc.disposition + dispGain);
      npc.memories = [...npc.memories, { event: `Received ${def.name} as a gift.`, tick: state.tick, sentiment: 'positive' as const }].slice(-10);
      newNpcs[npcIdx] = npc;
    }

    // Update minor NPC
    let newMinor = state.minorNpcState;
    if (npcIdx < 0) {
      const prev = state.minorNpcState[npcId] ?? { memories: [], disposition: 0, lastSeenTick: 0 };
      newMinor = { ...state.minorNpcState, [npcId]: { ...prev, disposition: Math.min(100, prev.disposition + dispGain), memories: [...prev.memories, `Received ${def.name}.`].slice(-12) } };
    }

    // Faction standing ripple (1 point per gift for affiliated named NPCs)
    let newFactions = state.factions;
    const npc = state.npcs[npcIdx];
    if (npc && npc.faction !== 'none' && npc.faction in state.factions) {
      newFactions = { ...state.factions, [npc.faction]: Math.min(100, (state.factions[npc.faction as keyof FactionStanding] ?? 0) + 1) };
    }

    updateEdge('player', npcId, dispGain, `Received ${def.name} as a gift from the traveler.`, state.worldTime);

    const entry: ChronicleEntry = { tick: state.tick, season: state.season, text: `The traveler gifted ${def.name} to ${npc?.name ?? 'a stranger'}. (+${dispGain} disposition)`, type: 'npc' };
    const ms = applyMilestoneCheck({ ...state, inventory: newInv, npcs: newNpcs, factions: newFactions, minorNpcState: newMinor });
    set({
      inventory: newInv,
      hotbar: inventoryToHotbar(newInv),
      npcs: newNpcs,
      minorNpcState: newMinor,
      factions: newFactions,
      reputation: ms.reputation,
      playerTitle: ms.playerTitle,
      gold: state.gold + ms.goldBonus,
      milestonesUnlocked: ms.milestonesUnlocked,
      chronicle: [...state.chronicle, entry, ...ms.extraChronicle],
      lastResult: `You give ${def.name}. Their eyes soften. (+${dispGain} disposition)`,
    });
  },

  castSpellAction: (spellId: string) => {
    const state = get();
    if (state.phase !== 'playing' && state.phase !== 'battle') return;
    const spell = SPELLS[spellId];
    if (!spell) return;
    if (!state.knownSpells.includes(spellId)) return;
    if (state.mana < spell.manaCost) {
      set({ lastResult: `Not enough mana. Need ${spell.manaCost}, have ${state.mana}.` });
      return;
    }
    const cooldownUntil = state.spellCooldowns[spellId] ?? 0;
    if (state.tick < cooldownUntil) {
      set({ lastResult: `${spell.name} is still cooling down.` });
      return;
    }

    const newMana = state.mana - spell.manaCost;
    const newCooldowns = { ...state.spellCooldowns, [spellId]: state.tick + spell.cooldownTicks };
    const chronicle: ChronicleEntry[] = [];
    let health = state.health;
    let battleState = state.battleState;
    let fog = state.fog;
    const newRep = { ...state.reputation, arcane: Math.min(100, state.reputation.arcane + 1) };

    switch (spellId) {
      case 'flame_bolt':
        if (state.phase !== 'battle' || !battleState) {
          set({ lastResult: 'Flame Bolt requires a battle target.' });
          return;
        }
        battleState = { ...battleState, foeHp: Math.max(0, battleState.foeHp - 20), log: [...battleState.log, '🔥 Flame Bolt strikes for 20!'] };
        chronicle.push({ tick: state.tick, season: state.season, text: 'Cast Flame Bolt, dealing 20 arcane damage.', type: 'action' });
        break;
      case 'mend': {
        const healed = Math.min(25, state.maxHealth - state.health);
        health = state.health + healed;
        chronicle.push({ tick: state.tick, season: state.season, text: `Mend closed wounds — +${healed} health.`, type: 'action' });
        break;
      }
      case 'shadow_step':
        if (state.phase === 'battle') {
          chronicle.push({ tick: state.tick, season: state.season, text: 'Shadow Step — the traveler dissolved into darkness, escaping the fight.', type: 'action' });
          set({ phase: 'playing', battleState: null, mana: newMana, spellCooldowns: newCooldowns, reputation: newRep, chronicle: [...state.chronicle, ...chronicle] });
          return;
        }
        chronicle.push({ tick: state.tick, season: state.season, text: 'Shadow Step — a blink through shadow.', type: 'action' });
        break;
      case 'reveal':
        fog = revealAroundPlayer(state.fog, state.playerX, state.playerY, 280);
        chronicle.push({ tick: state.tick, season: state.season, text: 'Reveal — the arcane eye illuminated the land.', type: 'action' });
        break;
      case 'tremor':
        if (state.phase !== 'battle' || !battleState) {
          set({ lastResult: 'Tremor requires a battle target.' });
          return;
        }
        battleState = { ...battleState, playerGuarded: true, log: [...battleState.log, '💫 Tremor stuns the foe! Their next strike is halved.'] };
        chronicle.push({ tick: state.tick, season: state.season, text: 'Tremor shook the battlefield, stunning the foe.', type: 'action' });
        break;
    }

    set({
      mana: newMana,
      spellCooldowns: newCooldowns,
      health,
      battleState,
      fog,
      reputation: newRep,
      chronicle: [...state.chronicle, ...chronicle],
    });
  },
}));
