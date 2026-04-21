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
import type { ChronicleEntry } from './gameTypes';

const DEFAULT_TICK_MS = 1500;
let tickInterval: ReturnType<typeof setInterval> | null = null;

function computeFactionStress(factions: Record<string, { treasury: number; atWarWith: string[] }>): number {
  let s = 0;
  for (const f of Object.values(factions)) {
    if (f.atWarWith.length > 0) s += 0.1;
    if (f.treasury < 800) s += 0.07;
  }
  return Math.min(1, s);
}

function onTick() {
  const state = useGameStore.getState();
  if (state.currentEvent || state.lastResult || state.phase === 'dead' || state.phase === 'title' || state.phase === 'booting' || state.phase === 'dungeon' || state.phase === 'battle') return;
  if (state.overlay !== 'none') return;

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

  if (newWorldTime % 2 === 0) {
    tickCaravanMovement();
  }
  tickWorldNpcSchedules(newDayNight, newWorldTime);

  for (const e of getEntitiesByKind('cooking_fire')) {
    if (Number(e.data.expiresAt ?? 0) < newWorldTime) {
      if (state.activeCampFireId === e.id) {
        useGameStore.setState({ activeCampFireId: null });
      }
      removeEntity(e.id);
    }
  }

  let newGold = state.gold;
  const caravans = getEntitiesByKind('caravan');
  if (caravans.some(c => c.data.pendingDelivery)) {
    if (newMarkets === state.markets) newMarkets = { ...state.markets };
  }
  for (const c of caravans) {
    const p = c.data.pendingDelivery as { locationId: string; cargo: string } | undefined;
    if (!p?.locationId || !newMarkets[p.locationId]) continue;
    newMarkets[p.locationId] = applyCaravanDelivery(newMarkets[p.locationId]!, p.cargo);
    delete c.data.pendingDelivery;
    const dist = Math.hypot(c.x - state.playerX, c.y - state.playerY);
    if (state.escortCaravanId === c.id && dist < 14 && !c.data.escortPaid) {
      c.data.escortPaid = true;
      newGold += 35 + Math.floor(Math.random() * 40);
      extraChronicle.push({
        tick: state.tick,
        season: state.season,
        text: 'The caravan master pays escort coin as wagons roll into the yard.',
        type: 'world',
      });
    }
  }

  const aggroEnemies = getEntitiesNear(state.playerX, state.playerY, 15);
  for (const enemy of aggroEnemies) {
    if (!['wolf', 'bandit', 'warband', 'bear'].includes(enemy.kind)) continue;
    const dist = Math.sqrt((enemy.x - state.playerX) ** 2 + (enemy.y - state.playerY) ** 2);
    const aggroR = getAggroRadius(enemy);
    if (dist > aggroR) continue;

    const dx = Math.sign(state.playerX - enemy.x);
    const dy = Math.sign(state.playerY - enemy.y);
    moveEntity(enemy.id, enemy.x + dx, enemy.y + dy);

    if (dist < 2) {
      const armor = getTotalArmor(state.inventory);
      const dmg = enemyAttackDamage(enemy, armor);
      newHealth = Math.max(0, newHealth - dmg);
      if (newHealth <= 0) newPhase = 'dead';
    }
  }

  const nearbyAnimals = getEntitiesNear(state.playerX, state.playerY, 20);
  for (const animal of nearbyAnimals) {
    if (!['deer', 'sheep', 'rabbit'].includes(animal.kind)) continue;
    const dist = Math.sqrt((animal.x - state.playerX) ** 2 + (animal.y - state.playerY) ** 2);
    if (dist < 8) {
      const dx = Math.sign(animal.x - state.playerX);
      const dy = Math.sign(animal.y - state.playerY);
      moveEntity(animal.id, animal.x + dx, animal.y + dy);
    }
  }

  if (newWorldTime % 100 === 0 && state.phase === 'playing') {
    respawnWildlifeFarFrom(state.playerX, state.playerY, newWorldTime);
  }

  if (newWorldTime % 20 === 0) {
    const hashR = (a: number, b: number) => {
      let h = (a * 374761393 + b * 668265263 + newWorldTime) & 0xffffffff;
      return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
    };
    for (let i = 0; i < 5; i++) {
      const rx = state.playerX + Math.floor((hashR(i * 31, newWorldTime) - 0.5) * 200);
      const ry = state.playerY + Math.floor((hashR(i * 47, newWorldTime + 100) - 0.5) * 200);
      if (rx < 0 || rx >= MAP_W || ry < 0 || ry >= MAP_H) continue;
      const roll = hashR(rx, ry);
      const kind = roll < 0.3 ? ('resource_tree' as const) : roll < 0.5 ? ('resource_rock' as const) : roll < 0.7 ? ('resource_herb' as const) : ('resource_berry' as const);
      spawnEntity(kind, rx, ry, {}, 1);
    }
  }

  const newQuests = state.quests.map(q => {
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

  let escortId = state.escortCaravanId;
  if (escortId && !getEntityById(escortId)) escortId = null;

  useGameStore.setState({
    worldTime: newWorldTime,
    dayNightPhase: newDayNight,
    weather: newWeather,
    season: newSeason,
    hunger: newHunger,
    health: newHealth,
    phase: newPhase,
    markets: newMarkets,
    factionStates: newFactionStates,
    bountyBoards: newBountyBoards,
    quests: newQuests,
    regionalModifiers: newRegional,
    gold: newGold,
    escortCaravanId: escortId,
    chronicle: extraChronicle.length ? [...state.chronicle, ...extraChronicle] : state.chronicle,
  });
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
