import type { ChronicleEntry, GameState, Season, SimDelta, SimDeltaDomain, SimEvent } from './gameTypes';
import type { RegionalModifiers } from './regionalState';
import type { Market } from './economySystem';
import { getPrice } from './economySystem';
import type { FactionState } from './factionSystem';
import { ITEMS } from './items';

export const SIM_EVENT_CAP = 400;
export const SIM_SCHEMA_VERSION = 1;

const REG_EPS = 0.014;
const FACTION_INT_EPS = 1;
const MARKET_TOP_N = 10;
const MARKET_PRICE_EPS = 1;
const MARKET_STOCK_EPS = 2;

export function makeSimEventId(worldTime: number, gameTick: number, index: number): string {
  return `sim_${worldTime}_${gameTick}_${index}`;
}

/** Stable id for caravan escort payouts (avoids colliding with tick diff id sequence). */
export function makeEscortSimEventId(worldTime: number, gameTick: number, caravanId: string): string {
  let h = 0;
  for (let i = 0; i < caravanId.length; i++) h = ((h * 31 + caravanId.charCodeAt(i)) >>> 0) % 2147483647;
  return `sim_${worldTime}_${gameTick}_esc_${h}`;
}

export function appendSimEvents(prevLog: SimEvent[], events: SimEvent[], cap = SIM_EVENT_CAP): SimEvent[] {
  if (events.length === 0) return prevLog;
  const merged = [...prevLog, ...events];
  return merged.length > cap ? merged.slice(-cap) : merged;
}

export function formatDeltasPreview(deltas: SimDelta[], maxLen = 220): string {
  const parts = deltas.slice(0, 12).map(d => {
    const loc = d.locationId ? `${d.locationId}:` : '';
    const fid = d.factionId ? `${d.factionId}:` : '';
    const it = d.itemId ? `${d.itemId}:` : '';
    const b = d.before !== undefined ? String(d.before) : '?';
    const a = d.after !== undefined ? String(d.after) : '?';
    return `${loc}${fid}${it}${d.key} ${b}→${a}`;
  });
  const s = parts.join(' · ');
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

export function simEventsToChronicleEntries(events: SimEvent[]): ChronicleEntry[] {
  return events
    .filter(e => e.visibility === 'chronicle')
    .map(e => ({
      tick: e.gameTick,
      season: e.season,
      text: e.summary,
      type: 'sim' as const,
      eventId: e.id,
      payload: e.deltas.length ? { deltasPreview: formatDeltasPreview(e.deltas) } : undefined,
    }));
}

function pushRegionalDeltas(prev: RegionalModifiers, next: RegionalModifiers, out: SimDelta[]): void {
  const keys: (keyof RegionalModifiers)[] = ['warTension', 'drought', 'banditPressure', 'stormSeverity'];
  for (const k of keys) {
    if (k === 'lastChronicleBand') continue;
    const a = prev[k] as number;
    const b = next[k] as number;
    if (Math.abs(b - a) >= REG_EPS) {
      out.push({ domain: 'regional', key: String(k), before: a, after: b });
    }
  }
}

export function diffRegionalToEvent(
  prev: RegionalModifiers,
  next: RegionalModifiers,
  ctx: { worldTime: number; gameTick: number; season: Season; idIndex: { n: number } },
): SimEvent | null {
  const deltas: SimDelta[] = [];
  pushRegionalDeltas(prev, next, deltas);
  if (deltas.length === 0) return null;
  const id = makeSimEventId(ctx.worldTime, ctx.gameTick, ctx.idIndex.n++);
  const arrows = deltas
    .map(d => `${d.key.replace(/([A-Z])/g, ' $1').trim()} ${(d.after ?? 0) > (d.before ?? 0) ? 'rose' : 'fell'}`)
    .join('; ');
  return {
    schemaVersion: SIM_SCHEMA_VERSION,
    id,
    worldTime: ctx.worldTime,
    gameTick: ctx.gameTick,
    season: ctx.season,
    source: 'world_tick',
    category: 'regional',
    summary: `The realm's pressures shift (${arrows}).`,
    deltas,
    visibility: 'hud',
  };
}

export interface MarketDiffOptions {
  visitedLocations: string[];
  currentLocation: string;
  maxRows?: number;
}

export function diffMarketsToEvent(
  prev: Record<string, Market>,
  next: Record<string, Market>,
  ctx: { worldTime: number; gameTick: number; season: Season; idIndex: { n: number } },
  opts: MarketDiffOptions,
): SimEvent | null {
  const allow = new Set([...opts.visitedLocations, opts.currentLocation]);
  type Row = { score: number; locId: string; itemId: string; pa: number; pb: number; sa: number; sb: number };
  const rows: Row[] = [];

  for (const locId of allow) {
    const pm = prev[locId];
    const nm = next[locId];
    if (!pm || !nm) continue;
    for (let i = 0; i < pm.items.length; i++) {
      const a = pm.items[i];
      const b = nm.items.find(x => x.itemId === a.itemId);
      if (!b) continue;
      const pa = getPrice(a);
      const pb = getPrice(b);
      const dPrice = Math.abs(pb - pa);
      const dStock = Math.abs(b.stock - a.stock);
      if (dPrice < MARKET_PRICE_EPS && dStock < MARKET_STOCK_EPS) continue;
      const score = dPrice + dStock * 0.5;
      rows.push({ score, locId, itemId: a.itemId, pa, pb, sa: a.stock, sb: b.stock });
    }
  }

  rows.sort((x, y) => y.score - x.score);
  const top = rows.slice(0, opts.maxRows ?? MARKET_TOP_N);
  if (top.length === 0) return null;

  const deltas: SimDelta[] = [];
  const maxPairs = 8;
  for (let i = 0; i < Math.min(top.length, maxPairs); i++) {
    const r = top[i]!;
    if (Math.abs(r.pb - r.pa) >= MARKET_PRICE_EPS) {
      deltas.push({
        domain: 'market',
        key: 'price',
        before: r.pa,
        after: r.pb,
        locationId: r.locId,
        itemId: r.itemId,
      });
    }
    if (Math.abs(r.sb - r.sa) >= MARKET_STOCK_EPS) {
      deltas.push({
        domain: 'market',
        key: 'stock',
        before: r.sa,
        after: r.sb,
        locationId: r.locId,
        itemId: r.itemId,
      });
    }
  }
  if (deltas.length === 0) return null;

  const id = makeSimEventId(ctx.worldTime, ctx.gameTick, ctx.idIndex.n++);
  const sample = top
    .slice(0, 3)
    .map(r => `${r.itemId}@${r.locId}`)
    .join(', ');
  return {
    schemaVersion: SIM_SCHEMA_VERSION,
    id,
    worldTime: ctx.worldTime,
    gameTick: ctx.gameTick,
    season: ctx.season,
    source: 'world_tick',
    category: 'economy',
    summary: `Markets adjust in places you know (${sample}${top.length > 3 ? '…' : ''}).`,
    deltas,
    visibility: 'hud',
  };
}

export function diffFactionsToEvent(
  prev: Record<string, FactionState>,
  next: Record<string, FactionState>,
  ctx: { worldTime: number; gameTick: number; season: Season; idIndex: { n: number } },
): SimEvent | null {
  const deltas: SimDelta[] = [];
  for (const fid of Object.keys(next)) {
    const a = prev[fid];
    const b = next[fid];
    if (!a || !b) continue;
    if (Math.abs(b.treasury - a.treasury) >= FACTION_INT_EPS) {
      deltas.push({
        domain: 'faction',
        key: 'treasury',
        before: a.treasury,
        after: b.treasury,
        factionId: fid,
      });
    }
    if (Math.abs(b.armySize - a.armySize) >= FACTION_INT_EPS) {
      deltas.push({
        domain: 'faction',
        key: 'armySize',
        before: a.armySize,
        after: b.armySize,
        factionId: fid,
      });
    }
    if (Math.abs(b.morale - a.morale) >= FACTION_INT_EPS) {
      deltas.push({
        domain: 'faction',
        key: 'morale',
        before: a.morale,
        after: b.morale,
        factionId: fid,
      });
    }
  }
  if (deltas.length === 0) return null;
  const id = makeSimEventId(ctx.worldTime, ctx.gameTick, ctx.idIndex.n++);
  return {
    schemaVersion: SIM_SCHEMA_VERSION,
    id,
    worldTime: ctx.worldTime,
    gameTick: ctx.gameTick,
    season: ctx.season,
    source: 'world_tick',
    category: 'faction',
    summary: 'Across the kingdoms, treasuries and musters shift with the day.',
    deltas,
    visibility: 'chronicle',
  };
}

export interface WorldTickSimInput {
  prev: GameState;
  newWorldTime: number;
  newSeason: Season;
  newRegional: RegionalModifiers;
  newMarkets: Record<string, Market>;
  newFactionStates: Record<string, FactionState>;
  idIndex: { n: number };
}

/** Diff-based sim events for one world tick (no caravan escort gold; add separately). */
export function buildWorldTickSimEvents(input: WorldTickSimInput): SimEvent[] {
  const { prev, newWorldTime, newSeason, newRegional, newMarkets, newFactionStates, idIndex } = input;
  const ctxBase = { worldTime: newWorldTime, gameTick: prev.tick, season: newSeason, idIndex };
  const out: SimEvent[] = [];

  if (newRegional !== prev.regionalModifiers) {
    const e = diffRegionalToEvent(prev.regionalModifiers, newRegional, ctxBase);
    if (e) out.push(e);
  }

  if (newMarkets !== prev.markets) {
    const e = diffMarketsToEvent(prev.markets, newMarkets, ctxBase, {
      visitedLocations: prev.visitedLocations,
      currentLocation: prev.currentLocation,
    });
    if (e) out.push(e);
  }

  if (newFactionStates !== prev.factionStates) {
    const e = diffFactionsToEvent(prev.factionStates, newFactionStates, ctxBase);
    if (e) out.push(e);
  }

  return out;
}

export function createEscortPaySimEvent(args: {
  worldTime: number;
  gameTick: number;
  season: Season;
  goldBefore: number;
  goldAfter: number;
  caravanId: string;
}): SimEvent {
  const id = makeEscortSimEventId(args.worldTime, args.gameTick, args.caravanId);
  const delta = args.goldAfter - args.goldBefore;
  return {
    schemaVersion: SIM_SCHEMA_VERSION,
    id,
    worldTime: args.worldTime,
    gameTick: args.gameTick,
    season: args.season,
    source: 'world_tick',
    category: 'caravan',
    summary: 'The caravan master pays escort coin as wagons roll into the yard.',
    deltas: [{ domain: 'player_gold', key: 'gold', before: args.goldBefore, after: args.goldAfter }],
    links: [
      {
        fromKind: 'caravan',
        fromId: args.caravanId,
        toKind: 'player',
        toId: 'player',
        relation: 'paid_escort',
      },
    ],
    visibility: 'silent',
  };
}

export function createFactionWarEvent(args: {
  worldTime: number; gameTick: number; season: Season;
  attackerId: string; attackerName: string; targetId: string; targetName: string;
  idIndex: { n: number };
}): SimEvent {
  const id = makeSimEventId(args.worldTime, args.gameTick, args.idIndex.n++);
  return {
    schemaVersion: SIM_SCHEMA_VERSION,
    id,
    worldTime: args.worldTime,
    gameTick: args.gameTick,
    season: args.season,
    source: 'world_tick',
    category: 'faction',
    summary: `${args.attackerName} has declared war on ${args.targetName}. The realm trembles.`,
    deltas: [{ domain: 'faction', key: 'atWar', factionId: args.attackerId }],
    visibility: 'chronicle',
  };
}

export function createFactionPeaceEvent(args: {
  worldTime: number; gameTick: number; season: Season;
  seekerId: string; seekerName: string; targetName: string;
  idIndex: { n: number };
}): SimEvent {
  const id = makeSimEventId(args.worldTime, args.gameTick, args.idIndex.n++);
  return {
    schemaVersion: SIM_SCHEMA_VERSION,
    id,
    worldTime: args.worldTime,
    gameTick: args.gameTick,
    season: args.season,
    source: 'world_tick',
    category: 'faction',
    summary: `${args.seekerName} has brokered peace with ${args.targetName}. The drums of war grow quiet.`,
    deltas: [{ domain: 'faction', key: 'atPeace', factionId: args.seekerId }],
    visibility: 'chronicle',
  };
}

export function createFactionConquestEvent(args: {
  worldTime: number; gameTick: number; season: Season;
  winnerId: string; winnerName: string; loserId: string; loserName: string; locationId: string;
  idIndex: { n: number };
}): SimEvent {
  const id = makeSimEventId(args.worldTime, args.gameTick, args.idIndex.n++);
  return {
    schemaVersion: SIM_SCHEMA_VERSION,
    id,
    worldTime: args.worldTime,
    gameTick: args.gameTick,
    season: args.season,
    source: 'world_tick',
    category: 'faction',
    summary: `${args.winnerName} has seized ${args.locationId} from ${args.loserName}. The banner changes over the gate.`,
    deltas: [{ domain: 'faction', key: 'territory', factionId: args.winnerId, locationId: args.locationId }],
    visibility: 'chronicle',
  };
}

export function recordPlayerShopBuy(args: {
  worldTime: number;
  gameTick: number;
  season: Season;
  marketKey: string;
  itemId: string;
  qty: number;
  goldBefore: number;
  goldAfter: number;
  stockBefore: number;
  stockAfter: number;
  seq: number;
}): SimEvent {
  const id = makeSimEventId(args.worldTime, args.gameTick, args.seq);
  const def = ITEMS[args.itemId];
  const name = def?.name ?? args.itemId;
  return {
    schemaVersion: SIM_SCHEMA_VERSION,
    id,
    worldTime: args.worldTime,
    gameTick: args.gameTick,
    season: args.season,
    source: 'player',
    category: 'trade',
    summary: `Bought ${args.qty}× ${name} at ${args.marketKey.replace(/_/g, ' ')}.`,
    deltas: [
      { domain: 'player_gold', key: 'gold', before: args.goldBefore, after: args.goldAfter },
      {
        domain: 'market',
        key: 'stock',
        before: args.stockBefore,
        after: args.stockAfter,
        locationId: args.marketKey,
        itemId: args.itemId,
      },
    ],
    visibility: 'chronicle',
  };
}

export function recordPlayerShopSell(args: {
  worldTime: number;
  gameTick: number;
  season: Season;
  itemId: string;
  qty: number;
  goldBefore: number;
  goldAfter: number;
  seq: number;
}): SimEvent {
  const id = makeSimEventId(args.worldTime, args.gameTick, args.seq);
  const def = ITEMS[args.itemId];
  const name = def?.name ?? args.itemId;
  return {
    schemaVersion: SIM_SCHEMA_VERSION,
    id,
    worldTime: args.worldTime,
    gameTick: args.gameTick,
    season: args.season,
    source: 'player',
    category: 'trade',
    summary: `Sold ${args.qty}× ${name} on the road.`,
    deltas: [{ domain: 'player_gold', key: 'gold', before: args.goldBefore, after: args.goldAfter }],
    visibility: 'chronicle',
  };
}
