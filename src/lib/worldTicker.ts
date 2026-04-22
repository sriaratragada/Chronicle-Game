import { useGameStore } from './gameStore';
import { tickWeather } from './weatherSystem';
import { getDayNightPhase, TICKS_PER_DAY } from './timeSystem';
import { tickMarket, applyCaravanDelivery } from './economySystem';
import { tickFaction } from './factionSystem';
import { refreshBountyBoard } from './bountyBoard';
import {
  getEntitiesNear,
  spawnEntity,
  moveEntity,
  respawnWildlifeFarFrom,
  tickCaravanMovement,
  tickWorldNpcSchedules,
  getEntitiesByKind,
  removeEntity,
  getEntityById,
} from './worldEntities';
import { enemyAttackDamage, getAggroRadius } from './combatSystem';
import { getTotalArmor } from './craftingSystem';
import { MAP_W, MAP_H } from './mapGenerator';
import { tickRegionalModifiers } from './regionalState';
import type { ChronicleEntry, GameState, DayNightPhase, Season, SimEvent } from './gameTypes';
import {
  appendSimEvents,
  buildWorldTickSimEvents,
  createEscortPaySimEvent,
  simEventsToChronicleEntries,
  SIM_EVENT_CAP,
} from './simulationEvents';

const CHRONICLE_CAP = 400;

const DEFAULT_TICK_MS = 1500;
let tickInterval: ReturnType<typeof setInterval> | null = null;

// #region agent log
function dbgWorld(hypothesisId: string, location: string, message: string, data: Record<string, unknown>): void {
  fetch('http://127.0.0.1:7891/ingest/68e880b8-e871-43be-946d-757508d96764', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a7e92f' },
    body: JSON.stringify({
      sessionId: 'a7e92f',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

function computeFactionStress(factions: Record<string, { treasury: number; atWarWith: string[] }>): number {
  let s = 0;
  for (const f of Object.values(factions)) {
    if (f.atWarWith.length > 0) s += 0.1;
    if (f.treasury < 800) s += 0.07;
  }
  return Math.min(1, s);
}

function worldTickBlocked(state: GameState): boolean {
  return (
    !!state.currentEvent ||
    !!state.lastResult ||
    state.phase === 'dead' ||
    state.phase === 'title' ||
    state.phase === 'booting' ||
    state.phase === 'dungeon' ||
    state.phase === 'battle' ||
    state.overlay !== 'none'
  );
}

interface WorldTickScratch {
  state: GameState;
  newWorldTime: number;
  newDayNight: DayNightPhase;
  newSeason: Season;
  newWeather: GameState['weather'];
  newHunger: number;
  newHealth: number;
  newPhase: GameState['phase'];
  newRegional: GameState['regionalModifiers'];
  extraChronicle: ChronicleEntry[];
  newMarkets: GameState['markets'];
  newFactionStates: GameState['factionStates'];
  newBountyBoards: GameState['bountyBoards'];
  newQuests: GameState['quests'];
  escortId: string | null;
  newGold: number;
  /** Player / caravan sim events emitted during phase B (e.g. escort pay). */
  extraSimEvents: SimEvent[];
  simIdIndex: { n: number };
}

function computeWorldTickPhaseA(state: GameState): WorldTickScratch {
  // #region agent log
  const _tPhaseA0 = performance.now();
  // #endregion
  const newWorldTime = state.worldTime + 1;
  const newDayNight = getDayNightPhase(newWorldTime);

  const SEASON_ORDER = ['thaw', 'summer', 'harvest', 'dark'] as const;
  const dayNum = Math.floor(newWorldTime / TICKS_PER_DAY);
  const seasonIdx = Math.floor(dayNum / 12) % 4;
  const newSeason = SEASON_ORDER[seasonIdx];

  const newWeather = tickWeather(state.weather as any, newWorldTime);

  let newHunger = Math.max(0, state.hunger - 0.02);
  let newHealth = state.health;
  let newPhase = state.phase;
  if (newHunger === 0) newHealth = Math.max(0, newHealth - 0.1);
  else if (newHunger < 20) newHealth = Math.max(0, newHealth - 0.02);
  if (newHealth <= 0) newPhase = 'dead';

  let newRegional = state.regionalModifiers;
  const extraChronicle: ChronicleEntry[] = [];
  if (newWorldTime % 12 === 0) {
    const stress = computeFactionStress(state.factionStates);
    const { next, chronicleLine } = tickRegionalModifiers(state.regionalModifiers, newWorldTime, state.weather as any, stress);
    newRegional = next;
    if (chronicleLine) {
      extraChronicle.push({ tick: state.tick, season: state.season, text: chronicleLine, type: 'world' });
    }
  }

  let newMarkets = state.markets;
  if (newWorldTime % 10 === 0) {
    newMarkets = { ...newMarkets };
    for (const [locId, market] of Object.entries(newMarkets)) {
      newMarkets[locId] = tickMarket(market, newRegional);
    }
  }

  let newFactionStates = state.factionStates;
  if (newWorldTime % TICKS_PER_DAY === 0) {
    newFactionStates = { ...newFactionStates };
    for (const [id, faction] of Object.entries(newFactionStates)) {
      newFactionStates[id] = tickFaction(faction);
    }
  }

  let newBountyBoards = state.bountyBoards;
  if (newWorldTime % 50 === 0) {
    newBountyBoards = { ...newBountyBoards };
    for (const [locId, board] of Object.entries(newBountyBoards)) {
      newBountyBoards[locId] = refreshBountyBoard(board, newWorldTime, newRegional);
    }
  }

  const newQuestsMapped = state.quests.map(q => {
    if (q.state !== 'active') return q;
    let changed = false;
    const steps = q.steps.map(s => {
      if (s.completed) return s;
      if (s.type === 'goto' && s.targetLocation === state.currentLocation) {
        changed = true;
        return { ...s, completed: true };
      }
      return s;
    });
    if (!changed) return q;
    const allDone = steps.every(s => s.completed);
    return { ...q, steps, state: allDone ? ('completed' as const) : q.state };
  });
  let newQuests = state.quests;
  for (let i = 0; i < newQuestsMapped.length; i++) {
    if (newQuestsMapped[i] !== state.quests[i]) {
      newQuests = newQuestsMapped;
      break;
    }
  }

  let escortId = state.escortCaravanId;
  if (escortId && !getEntityById(escortId)) escortId = null;

  // #region agent log
  dbgWorld('A', 'worldTicker.ts:phaseA', 'computeWorldTickPhaseA_ms', {
    ms: Math.round((performance.now() - _tPhaseA0) * 100) / 100,
    wt: newWorldTime,
    m10: newWorldTime % 10 === 0,
    m12: newWorldTime % 12 === 0,
    m50: newWorldTime % 50 === 0,
    mDay: newWorldTime % TICKS_PER_DAY === 0,
  });
  // #endregion

  return {
    state,
    newWorldTime,
    newDayNight,
    newSeason,
    newWeather: newWeather as GameState['weather'],
    newHunger,
    newHealth,
    newPhase,
    newRegional,
    extraChronicle,
    newMarkets,
    newFactionStates,
    newBountyBoards,
    newQuests,
    escortId,
    newGold: state.gold,
    extraSimEvents: [],
    simIdIndex: { n: 0 },
  };
}

function runWorldTickPhaseB(scratch: WorldTickScratch, latest: GameState): void {
  // #region agent log
  const _tB0 = performance.now();
  // #endregion
  const { state, newWorldTime, newDayNight } = scratch;
  let newHealth = scratch.newHealth;
  let newPhase = scratch.newPhase;
  let newMarkets = scratch.newMarkets;
  let newGold = scratch.newGold;
  const { extraChronicle } = scratch;

  if (newWorldTime % 2 === 0) {
    tickCaravanMovement();
  }
  tickWorldNpcSchedules(newDayNight, newWorldTime);

  for (const e of getEntitiesByKind('cooking_fire')) {
    if (Number(e.data.expiresAt ?? 0) < newWorldTime) {
      if (latest.activeCampFireId === e.id) {
        useGameStore.setState({ activeCampFireId: null });
      }
      removeEntity(e.id);
    }
  }

  const caravans = getEntitiesByKind('caravan');
  if (caravans.some(c => c.data.pendingDelivery)) {
    if (newMarkets === state.markets) newMarkets = { ...state.markets };
  }
  for (const c of caravans) {
    const p = c.data.pendingDelivery as { locationId: string; cargo: string } | undefined;
    if (!p?.locationId || !newMarkets[p.locationId]) continue;
    newMarkets[p.locationId] = applyCaravanDelivery(newMarkets[p.locationId]!, p.cargo);
    delete c.data.pendingDelivery;
    const dist = Math.hypot(c.x - latest.playerX, c.y - latest.playerY);
    if (latest.escortCaravanId === c.id && dist < 14 && !c.data.escortPaid) {
      c.data.escortPaid = true;
      const pay = 35 + Math.floor(Math.random() * 40);
      const goldBefore = newGold;
      newGold += pay;
      const escEv = createEscortPaySimEvent({
        worldTime: newWorldTime,
        gameTick: state.tick,
        season: state.season,
        goldBefore,
        goldAfter: newGold,
        caravanId: c.id,
      });
      scratch.extraSimEvents.push(escEv);
      extraChronicle.push({
        tick: state.tick,
        season: state.season,
        text: 'The caravan master pays escort coin as wagons roll into the yard.',
        type: 'world',
        eventId: escEv.id,
      });
    }
  }

  const px = latest.playerX;
  const py = latest.playerY;
  const aggroEnemies = getEntitiesNear(px, py, 15);
  for (const enemy of aggroEnemies) {
    if (!['wolf', 'bandit', 'warband', 'bear'].includes(enemy.kind)) continue;
    const dist = Math.sqrt((enemy.x - px) ** 2 + (enemy.y - py) ** 2);
    const aggroR = getAggroRadius(enemy);
    if (dist > aggroR) continue;

    const dx = Math.sign(px - enemy.x);
    const dy = Math.sign(py - enemy.y);
    moveEntity(enemy.id, enemy.x + dx, enemy.y + dy);

    if (dist < 2) {
      const armor = getTotalArmor(latest.inventory);
      const dmg = enemyAttackDamage(enemy, armor);
      newHealth = Math.max(0, newHealth - dmg);
      if (newHealth <= 0) newPhase = 'dead';
    }
  }

  const nearbyAnimals = getEntitiesNear(px, py, 20);
  for (const animal of nearbyAnimals) {
    if (!['deer', 'sheep', 'rabbit'].includes(animal.kind)) continue;
    const dist = Math.sqrt((animal.x - px) ** 2 + (animal.y - py) ** 2);
    if (dist < 8) {
      const dx = Math.sign(animal.x - px);
      const dy = Math.sign(animal.y - py);
      moveEntity(animal.id, animal.x + dx, animal.y + dy);
    }
  }

  if (newWorldTime % 20 === 0) {
    const hashR = (a: number, b: number) => {
      let h = (a * 374761393 + b * 668265263 + newWorldTime) & 0xffffffff;
      return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
    };
    for (let i = 0; i < 5; i++) {
      const rx = px + Math.floor((hashR(i * 31, newWorldTime) - 0.5) * 200);
      const ry = py + Math.floor((hashR(i * 47, newWorldTime + 100) - 0.5) * 200);
      if (rx < 0 || rx >= MAP_W || ry < 0 || ry >= MAP_H) continue;
      const roll = hashR(rx, ry);
      const kind = roll < 0.3 ? ('resource_tree' as const) : roll < 0.5 ? ('resource_rock' as const) : roll < 0.7 ? ('resource_herb' as const) : ('resource_berry' as const);
      spawnEntity(kind, rx, ry, {}, 1);
    }
  }

  scratch.newHealth = newHealth;
  scratch.newPhase = newPhase;
  scratch.newMarkets = newMarkets;
  scratch.newGold = newGold;
  // #region agent log
  dbgWorld('A', 'worldTicker.ts:phaseB', 'runWorldTickPhaseB_ms', {
    ms: Math.round((performance.now() - _tB0) * 100) / 100,
    wt: scratch.newWorldTime,
  });
  // #endregion
}

function applyWorldTickPatch(scratch: WorldTickScratch): void {
  const {
    state,
    newWorldTime,
    newDayNight,
    newSeason,
    newWeather,
    newHunger,
    newHealth,
    newPhase,
    newRegional,
    extraChronicle,
    newMarkets,
    newFactionStates,
    newBountyBoards,
    newQuests,
    escortId,
    newGold,
    extraSimEvents,
    simIdIndex,
  } = scratch;

  const diffSim = buildWorldTickSimEvents({
    prev: state,
    newWorldTime,
    newSeason,
    newRegional,
    newMarkets,
    newFactionStates,
    idIndex: simIdIndex,
  });
  const allTickSim = [...diffSim, ...extraSimEvents];
  const nextSimLog =
    allTickSim.length > 0 ? appendSimEvents(state.simEventLog, allTickSim, SIM_EVENT_CAP) : state.simEventLog;
  const chronFromSim = simEventsToChronicleEntries(allTickSim);

  let nextChronicle = state.chronicle;
  if (extraChronicle.length > 0 || chronFromSim.length > 0) {
    const merged = [...state.chronicle, ...extraChronicle, ...chronFromSim];
    nextChronicle = merged.length > CHRONICLE_CAP ? merged.slice(-CHRONICLE_CAP) : merged;
  }

  const patch: Partial<GameState> = {
    worldTime: newWorldTime,
    dayNightPhase: newDayNight,
    season: newSeason,
    hunger: newHunger,
    health: newHealth,
    phase: newPhase,
    regionalModifiers: newRegional,
    gold: newGold,
    escortCaravanId: escortId,
  };
  if (newWeather !== state.weather) patch.weather = newWeather;
  if (newMarkets !== state.markets) patch.markets = newMarkets;
  if (newFactionStates !== state.factionStates) patch.factionStates = newFactionStates;
  if (newBountyBoards !== state.bountyBoards) patch.bountyBoards = newBountyBoards;
  if (newQuests !== state.quests) patch.quests = newQuests;
  if (nextChronicle !== state.chronicle) patch.chronicle = nextChronicle;
  if (nextSimLog !== state.simEventLog) patch.simEventLog = nextSimLog;

  // #region agent log
  const _tS0 = performance.now();
  // #endregion
  useGameStore.setState(patch);
  // #region agent log
  dbgWorld('C', 'worldTicker.ts:setState', 'useGameStore_setState_ms', {
    ms: Math.round((performance.now() - _tS0) * 100) / 100,
    wt: newWorldTime,
    keys: Object.keys(patch).length,
  });
  // #endregion
}

function runWorldTickPipeline(): void {
  // #region agent log
  const _tPipe0 = performance.now();
  dbgWorld('D', 'worldTicker.ts:pipeline', 'runWorldTickPipeline_start', {});
  // #endregion
  const state = useGameStore.getState();
  if (worldTickBlocked(state)) return;

  // Yield one frame before phase A so heavy economy/weather/quest work does not
  // share the same rAF callback as the interval → rAF handoff (reduces hitches).
  requestAnimationFrame(() => {
    const s = useGameStore.getState();
    if (worldTickBlocked(s)) return;

    const scratch = computeWorldTickPhaseA(s);

    requestAnimationFrame(() => {
      const latest = useGameStore.getState();
      if (worldTickBlocked(latest)) {
        applyWorldTickPatch(scratch);
        return;
      }
      runWorldTickPhaseB(scratch, latest);
      applyWorldTickPatch(scratch);
      // #region agent log
      dbgWorld('D', 'worldTicker.ts:pipeline', 'runWorldTickPipeline_inner_done_ms', {
        msSincePipeStart: Math.round((performance.now() - _tPipe0) * 100) / 100,
        wt: scratch.newWorldTime,
      });
      // #endregion

      if (scratch.newWorldTime % 100 === 0 && scratch.state.phase === 'playing') {
        const px = latest.playerX;
        const py = latest.playerY;
        const wt = scratch.newWorldTime;
        requestAnimationFrame(() => {
          const st = useGameStore.getState();
          if (st.phase !== 'playing' || st.overlay !== 'none' || st.currentEvent || st.lastResult) return;
          respawnWildlifeFarFrom(px, py, wt);
        });
      }
    });
  });
}

function onTick(): void {
  // #region agent log
  dbgWorld('D', 'worldTicker.ts:onTick', 'setInterval_onTick_fire', { t: Date.now() });
  // #endregion
  requestAnimationFrame(runWorldTickPipeline);
}

export function startTicker(rate = DEFAULT_TICK_MS) {
  stopTicker();
  tickInterval = setInterval(onTick, rate);
}

export function stopTicker() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

export function setTickRate(ms: number) {
  if (tickInterval) {
    stopTicker();
    startTicker(ms);
  }
}

export function isTickerRunning(): boolean {
  return tickInterval !== null;
}
