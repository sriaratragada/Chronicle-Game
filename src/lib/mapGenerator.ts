import { Season } from './gameTypes';
import {
  invalidateSettlementRoadCache,
  mergeSettlementLocalRoadsIntoChunk,
  mergeHamletSpurRoadsIntoChunk,
  getSettlementLayoutCenter,
  isSettlementLocalRoad,
  getSettlementSidewalkPositions,
} from './settlementLayout';
import { mergeHamletChunkRoads, mergeHamletStructuresIntoChunk, invalidateHamletCache } from './hamlets';
import { mergeWildernessPoisIntoChunk, invalidateWildernessCaches } from './wildernessPoi';

// ── Value noise ────────────────────────────────────────────────────────────
let SEED = 42;
export function getWorldSeed(): number {
  return SEED;
}

export function setSeed(s: number) {
  SEED = s;
  chunkCache.clear();
  _roadSet = null;
  _riverSet = null;
  invalidateSettlementRoadCache();
  invalidateWildernessCaches();
  invalidateHamletCache();
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263 + SEED) & 0xffffffff;
  h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff;
  h = ((h ^ (h >> 16)) * 1911520717) & 0xffffffff;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n00 = hash(ix, iy), n10 = hash(ix + 1, iy);
  const n01 = hash(ix, iy + 1), n11 = hash(ix + 1, iy + 1);
  return n00 + sx * (n10 - n00) + sy * ((n01 + sx * (n11 - n01)) - (n00 + sx * (n10 - n00)));
}

function fbm(x: number, y: number, octaves = 5): number {
  let val = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x * freq, y * freq) * amp;
    max += amp; amp *= 0.5; freq *= 2;
  }
  return val / max;
}

// ── Tile types ─────────────────────────────────────────────────────────────
export type TileType =
  | 'deep_water' | 'water' | 'sand' | 'grass' | 'forest'
  | 'dense_forest' | 'hill' | 'mountain' | 'snow' | 'swamp'
  | 'ruins' | 'road' | 'river' | 'clearing' | 'farm_field';

const T = {
  DEEP_WATER: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4,
  DENSE_FOREST: 5, HILL: 6, MOUNTAIN: 7, SNOW: 8, SWAMP: 9,
  RUINS: 10, ROAD: 11, RIVER: 12, CLEARING: 13, FARM_FIELD: 14,
} as const;

export const TILE_NAMES: TileType[] = [
  'deep_water', 'water', 'sand', 'grass', 'forest',
  'dense_forest', 'hill', 'mountain', 'snow', 'swamp',
  'ruins', 'road', 'river', 'clearing', 'farm_field',
];

// ── Map constants ──────────────────────────────────────────────────────────
export const MAP_W = 10000;
export const MAP_H = 10000;
export const TILE_SIZE = 5;
export const CHUNK_SIZE = 64;
export const NUM_CHUNKS_X = Math.ceil(MAP_W / CHUNK_SIZE);
export const NUM_CHUNKS_Y = Math.ceil(MAP_H / CHUNK_SIZE);

// ── Continents ─────────────────────────────────────────────────────────────
export type ContinentId = 'auredia' | 'trivalen' | 'uloren';

interface ContinentDef {
  id: ContinentId;
  cx: number; cy: number;
  rx: number; ry: number;
}

const CONTINENTS: ContinentDef[] = [
  { id: 'auredia',  cx: 2100, cy: 4800, rx: 1650, ry: 3600 },
  { id: 'trivalen', cx: 6000, cy: 4800, rx: 1500, ry: 3600 },
  { id: 'uloren',   cx: 9000, cy: 5000, rx: 850,  ry: 4200 },
];

function continentStrength(x: number, y: number, c: ContinentDef): number {
  const dx = (x - c.cx) / c.rx;
  const dy = (y - c.cy) / c.ry;
  const ellipse = dx * dx + dy * dy;
  const coast = fbm(x * 0.003 + c.cx * 0.17, y * 0.003 + c.cy * 0.17, 4) * 0.35;
  return 1 - ellipse + coast;
}

export function getContinentAt(x: number, y: number): ContinentId | null {
  for (const c of CONTINENTS) {
    if (continentStrength(x, y, c) > 0.02) return c.id;
  }
  return null;
}

// ── Settlements ────────────────────────────────────────────────────────────
export interface SettlementMeta {
  continent: ContinentId;
  kingdom: string;
  type: 'village' | 'town' | 'city' | 'fortress' | 'ruins' | 'port' | 'capital' | 'wilderness' | 'inn';
  biomeCode: number;
  biomeRadius: number;
}

/** biomeRadius = half-width of settlement influence (capital 100 → ~200 tile footprint). */
const SETTLEMENTS: Record<string, { x: number; y: number } & SettlementMeta> = {
  // ── Auredia (Grand Kingdom) ── (~2.2× biome radius vs original plan)
  highmarch:     { x: 2200, y: 4500, continent: 'auredia', kingdom: 'auredia_crown', type: 'capital',  biomeCode: T.GRASS, biomeRadius: 220 },
  ashenford:     { x: 1200, y: 3500, continent: 'auredia', kingdom: 'auredia_crown', type: 'village',  biomeCode: T.GRASS, biomeRadius: 88 },
  saltmoor:      { x: 700,  y: 5500, continent: 'auredia', kingdom: 'auredia_crown', type: 'port',     biomeCode: T.SAND,  biomeRadius: 154 },
  ironhold:      { x: 1800, y: 2000, continent: 'auredia', kingdom: 'auredia_crown', type: 'fortress', biomeCode: T.MOUNTAIN, biomeRadius: 198 },
  thornwick:     { x: 2800, y: 5800, continent: 'auredia', kingdom: 'auredia_crown', type: 'village',  biomeCode: T.DENSE_FOREST, biomeRadius: 88 },
  graygate:      { x: 1600, y: 6200, continent: 'auredia', kingdom: 'auredia_crown', type: 'city',     biomeCode: T.GRASS, biomeRadius: 165 },
  crossroads:    { x: 2000, y: 3000, continent: 'auredia', kingdom: 'auredia_crown', type: 'inn',      biomeCode: T.GRASS, biomeRadius: 66 },
  coldpeak:      { x: 1000, y: 1500, continent: 'auredia', kingdom: 'auredia_crown', type: 'fortress', biomeCode: T.SNOW,  biomeRadius: 198 },
  millhaven:     { x: 2600, y: 4000, continent: 'auredia', kingdom: 'auredia_crown', type: 'village',  biomeCode: T.GRASS, biomeRadius: 88 },
  brightwater:   { x: 3200, y: 3200, continent: 'auredia', kingdom: 'auredia_crown', type: 'town',     biomeCode: T.GRASS, biomeRadius: 121 },
  oakshire:      { x: 1400, y: 7500, continent: 'auredia', kingdom: 'auredia_crown', type: 'village',  biomeCode: T.FOREST, biomeRadius: 88 },
  goldcrest:     { x: 3000, y: 6800, continent: 'auredia', kingdom: 'auredia_crown', type: 'fortress', biomeCode: T.HILL, biomeRadius: 198 },

  // ── Trivalen — Korrath (north mountains) ──
  korrath_citadel: { x: 5500, y: 2200, continent: 'trivalen', kingdom: 'korrath', type: 'capital',  biomeCode: T.MOUNTAIN, biomeRadius: 220 },
  frostmarch:      { x: 5000, y: 1500, continent: 'trivalen', kingdom: 'korrath', type: 'fortress', biomeCode: T.SNOW, biomeRadius: 198 },
  deepmine:        { x: 6200, y: 1800, continent: 'trivalen', kingdom: 'korrath', type: 'village',  biomeCode: T.HILL, biomeRadius: 88 },

  // ── Trivalen — Vell (south coast) ──
  vell_harbor:  { x: 5200, y: 7500, continent: 'trivalen', kingdom: 'vell', type: 'capital', biomeCode: T.SAND, biomeRadius: 220 },
  sunfield:     { x: 5800, y: 7000, continent: 'trivalen', kingdom: 'vell', type: 'village', biomeCode: T.GRASS, biomeRadius: 88 },
  coral_cove:   { x: 4800, y: 8000, continent: 'trivalen', kingdom: 'vell', type: 'port',    biomeCode: T.SAND, biomeRadius: 154 },

  // ── Trivalen — Sarnak (east steppe) ──
  sarnak_hold:  { x: 7000, y: 4500, continent: 'trivalen', kingdom: 'sarnak', type: 'capital',  biomeCode: T.GRASS, biomeRadius: 220 },
  windridge:    { x: 7200, y: 3000, continent: 'trivalen', kingdom: 'sarnak', type: 'fortress', biomeCode: T.HILL, biomeRadius: 198 },
  dustplain:    { x: 6800, y: 5500, continent: 'trivalen', kingdom: 'sarnak', type: 'village',  biomeCode: T.GRASS, biomeRadius: 88 },

  // ── Trivalen — contested ──
  dustfall:  { x: 6000, y: 4800, continent: 'trivalen', kingdom: 'contested', type: 'ruins',      biomeCode: T.RUINS, biomeRadius: 99 },
  marshend:  { x: 5200, y: 5200, continent: 'trivalen', kingdom: 'contested', type: 'village',    biomeCode: T.SWAMP, biomeRadius: 88 },
  badlands:  { x: 6500, y: 6000, continent: 'trivalen', kingdom: 'contested', type: 'wilderness', biomeCode: T.HILL, biomeRadius: 121 },

  // ── Uloren (unexplored) ──
  mistwood:       { x: 8600, y: 4000, continent: 'uloren', kingdom: 'unknown', type: 'village',  biomeCode: T.DENSE_FOREST, biomeRadius: 88 },
  ruins_of_aether:{ x: 9200, y: 5500, continent: 'uloren', kingdom: 'unknown', type: 'ruins',    biomeCode: T.RUINS, biomeRadius: 99 },
  shadowfen:      { x: 8400, y: 7000, continent: 'uloren', kingdom: 'unknown', type: 'village',  biomeCode: T.SWAMP, biomeRadius: 88 },
  whisper_stones: { x: 9000, y: 3000, continent: 'uloren', kingdom: 'unknown', type: 'ruins',    biomeCode: T.RUINS, biomeRadius: 99 },
  hollowpeak:     { x: 9500, y: 6500, continent: 'uloren', kingdom: 'unknown', type: 'village',  biomeCode: T.MOUNTAIN, biomeRadius: 88 },
};

export const LOCATION_COORDS: Record<string, { x: number; y: number }> =
  Object.fromEntries(Object.entries(SETTLEMENTS).map(([id, s]) => [id, { x: s.x, y: s.y }]));

export function getSettlementMeta(id: string): SettlementMeta | undefined {
  const s = SETTLEMENTS[id];
  return s ? { continent: s.continent, kingdom: s.kingdom, type: s.type, biomeCode: s.biomeCode, biomeRadius: s.biomeRadius } : undefined;
}

// ── Road connections (also trade / caravan graph) ─────────────────────────
export const TRADE_CONNECTIONS: [string, string][] = [
  // Auredia (dense network)
  ['highmarch','ashenford'], ['highmarch','millhaven'], ['highmarch','graygate'], ['highmarch','brightwater'],
  ['ashenford','crossroads'], ['ashenford','saltmoor'],
  ['saltmoor','graygate'], ['saltmoor','oakshire'],
  ['ironhold','crossroads'], ['ironhold','coldpeak'], ['ironhold','brightwater'],
  ['thornwick','graygate'], ['thornwick','goldcrest'],
  ['graygate','oakshire'], ['graygate','goldcrest'],
  ['crossroads','millhaven'], ['brightwater','millhaven'],
  // Trivalen — Korrath
  ['korrath_citadel','frostmarch'], ['korrath_citadel','deepmine'], ['korrath_citadel','dustfall'],
  // Trivalen — Vell
  ['vell_harbor','sunfield'], ['vell_harbor','coral_cove'], ['sunfield','badlands'],
  // Trivalen — Sarnak
  ['sarnak_hold','windridge'], ['sarnak_hold','dustplain'], ['dustplain','dustfall'],
  // Trivalen — contested
  ['dustfall','marshend'], ['marshend','badlands'], ['marshend','sunfield'],
  // Uloren has NO roads
];

// ── Colour palettes ────────────────────────────────────────────────────────
const HEX_PALETTES: Record<Season, string[]> = {
  thaw: [
    '#1a3a5c','#2a5a7c','#c4a86c','#5a7a4a',
    '#3a5a2a','#2a4a1a','#6a6a5a','#5a5a5a',
    '#d0d8e0','#3a4a3a','#5a4a3a','#8a7a5a',
    '#3a6a8c','#7a9a5a','#b8a060',
  ],
  summer: [
    '#1a3060','#2a5585','#d4b87c','#4a8a3a',
    '#2a6a1a','#1a5a0a','#7a7a5a','#6a6a6a',
    '#e8e8f0','#2a5a2a','#6a5a4a','#9a8a5a',
    '#2a5a90','#6aaa4a','#c8b070',
  ],
  harvest: [
    '#1a3050','#2a4a6a','#c4a05a','#8a7a3a',
    '#6a5a1a','#5a4a0a','#7a6a4a','#5a5050',
    '#d0c8c0','#4a4a2a','#5a4030','#8a7040',
    '#2a4a70','#9a8a3a','#a08030',
  ],
  dark: [
    '#0a1a30','#1a3050','#8a7a5a','#3a4a3a',
    '#2a3a2a','#1a2a1a','#4a4a4a','#3a3a3a',
    '#c0c8d8','#2a2a2a','#3a3028','#5a5040',
    '#1a3a60','#4a5a3a','#6a5830',
  ],
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export const PARSED_PALETTES: Record<Season, [number, number, number][]> =
  (Object.keys(HEX_PALETTES) as Season[]).reduce((acc, s) => {
    acc[s] = HEX_PALETTES[s].map(hexToRgb);
    return acc;
  }, {} as Record<Season, [number, number, number][]>);

export function getTileColor(tile: TileType, season: Season): string {
  return HEX_PALETTES[season][TILE_NAMES.indexOf(tile)] ?? '#333';
}

// ── World objects ──────────────────────────────────────────────────────────
export type WorldObjectType =
  | 'farm' | 'barn' | 'windmill' | 'watchtower' | 'dock' | 'bridge'
  | 'campfire' | 'market_stall' | 'ruins_pillar' | 'stone_wall'
  | 'stone_circle' | 'hut' | 'well' | 'shrine' | 'gate' | 'fence'
  | 'poi_lakeshore' | 'poi_chapel' | 'poi_knight_camp' | 'poi_wrecked_cart' | 'poi_standing_stone' | 'poi_monster_lair'
  | 'poi_road_inn' | 'poi_farmstead' | 'poi_watchtower' | 'poi_stockade_ruins';

export interface WorldObject {
  x: number; y: number;
  type: WorldObjectType;
  variant: number;
  /** Stable id for wilderness POI progress / fishing cooldown */
  poiId?: string;
}

export type AmbientEntityType =
  | 'deer' | 'sheep' | 'wolf' | 'eagle' | 'rabbit' | 'fish'
  | 'villager' | 'fisherman' | 'guard' | 'merchant' | 'traveler' | 'crow';

export interface AmbientEntity {
  x: number; y: number;
  type: AmbientEntityType;
  speed: number;
  phase: number;
  radius: number;
}

// ── Chunk data ─────────────────────────────────────────────────────────────
export interface ChunkData {
  tiles: Uint8Array;
  roads: Uint8Array;
  objects: WorldObject[];
  entities: AmbientEntity[];
}

// ── LRU Cache ──────────────────────────────────────────────────────────────
class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private max: number) {}
  get(key: K): V | undefined { const v = this.map.get(key); if (v !== undefined) { this.map.delete(key); this.map.set(key, v); } return v; }
  set(key: K, val: V) { this.map.delete(key); this.map.set(key, val); if (this.map.size > this.max) { const first = this.map.keys().next().value; if (first !== undefined) this.map.delete(first); } }
  clear() { this.map.clear(); }
}

const chunkCache = new LRUCache<number, ChunkData>(1024);

// ── Road precomputation ────────────────────────────────────────────────────
let _roadSet: Set<number> | null = null;

function bresenhamLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx)  { err += dx; y0 += sy; }
  }
  return pts;
}

export function ensureRoads(): Set<number> {
  if (_roadSet) return _roadSet;
  _roadSet = new Set<number>();
  for (const [a, b] of TRADE_CONNECTIONS) {
    const ca = LOCATION_COORDS[a], cb = LOCATION_COORDS[b];
    if (!ca || !cb) continue;
    for (const [px, py] of bresenhamLine(ca.x, ca.y, cb.x, cb.y)) {
      if (px < 0 || px >= MAP_W || py < 0 || py >= MAP_H) continue;
      _roadSet.add(py * MAP_W + px);
      if (hash(px, py) > 0.3 && py + 1 < MAP_H) _roadSet.add((py + 1) * MAP_W + px);
      if (hash(px + 1, py) > 0.5 && px + 1 < MAP_W) _roadSet.add(py * MAP_W + (px + 1));
    }
  }
  return _roadSet;
}

// ── Tile computation ───────────────────────────────────────────────────────
function computeTile(x: number, y: number): number {
  let bestStr = -Infinity;
  let bestContinent: ContinentId | null = null;
  for (const c of CONTINENTS) {
    const s = continentStrength(x, y, c);
    if (s > bestStr) { bestStr = s; bestContinent = c.id; }
  }

  // Ocean
  if (bestStr < -0.08) return T.DEEP_WATER;
  if (bestStr < 0.02) return T.WATER;
  if (bestStr < 0.06) return T.SAND;

  // Land biome via noise
  const e = fbm(x * 0.004, y * 0.004, 5);
  const m = fbm(x * 0.005 + 500, y * 0.005 + 500, 4);
  const r = fbm(x * 0.015 + 200, y * 0.015 + 900, 3);

  let landCode: number;

  // Continent-specific biome weighting
  if (bestContinent === 'auredia') {
    if (e < 0.30) landCode = T.GRASS;
    else if (e < 0.48) landCode = m > 0.62 ? T.FOREST : T.GRASS;
    else if (e < 0.58) landCode = m > 0.55 ? T.DENSE_FOREST : (r > 0.55 ? T.HILL : T.FOREST);
    else if (e < 0.68) landCode = T.HILL;
    else if (e < 0.78) landCode = T.MOUNTAIN;
    else landCode = T.SNOW;
  } else if (bestContinent === 'trivalen') {
    const relY = (y - 1000) / 7500;
    if (relY < 0.35) {
      if (e < 0.32) landCode = m > 0.55 ? T.FOREST : T.GRASS;
      else if (e < 0.50) landCode = T.HILL;
      else if (e < 0.65) landCode = T.MOUNTAIN;
      else landCode = T.SNOW;
    } else if (relY > 0.75) {
      if (e < 0.35) landCode = T.GRASS;
      else if (e < 0.50) landCode = m > 0.60 ? T.FOREST : T.GRASS;
      else if (e < 0.62) landCode = r > 0.55 ? T.HILL : T.FOREST;
      else landCode = T.HILL;
    } else {
      if (m > 0.68 && r > 0.52) landCode = T.SWAMP;
      else if (e < 0.35) landCode = T.GRASS;
      else if (e < 0.52) landCode = m > 0.58 ? T.FOREST : T.GRASS;
      else if (e < 0.65) landCode = r > 0.56 ? T.HILL : T.FOREST;
      else landCode = T.MOUNTAIN;
    }
  } else if (bestContinent === 'uloren') {
    if (m > 0.65 && r > 0.50) landCode = T.SWAMP;
    else if (e < 0.32) landCode = T.DENSE_FOREST;
    else if (e < 0.50) landCode = m > 0.45 ? T.DENSE_FOREST : T.FOREST;
    else if (e < 0.65) landCode = T.HILL;
    else if (e < 0.78) landCode = T.MOUNTAIN;
    else landCode = T.SNOW;
  } else {
    if (e < 0.40) landCode = m > 0.55 ? T.FOREST : T.GRASS;
    else if (e < 0.55) landCode = T.HILL;
    else landCode = T.MOUNTAIN;
  }

  return applyInteriorLake(x, y, bestStr, bestContinent, landCode);
}

/** Inland lake bowls (deterministic); shores use sand for walkable fishing access. */
function applyInteriorLake(
  x: number,
  y: number,
  bestStr: number,
  continent: ContinentId | null,
  code: number,
): number {
  if (bestStr < 0.06 || continent === null) return code;
  if (code === T.MOUNTAIN || code === T.SNOW || code === T.RUINS || code === T.SWAMP) return code;
  if (isRiver(x, y)) return code;

  const bowl = fbm(x * 0.00165 + 2111 + continent.charCodeAt(0), y * 0.00165 + 3777, 5);
  const spot = fbm(x * 0.018 + 900, y * 0.018 + 1200, 3);
  const thresh = continent === 'uloren' ? 0.175 : 0.188;
  if (bowl > thresh) return code;
  if (spot > 0.34) return code;

  const depth = (thresh - bowl) / thresh;
  if (depth > 0.58) return T.DEEP_WATER;
  if (depth > 0.22) return T.WATER;
  return T.SAND;
}

/** Base terrain without settlement biome override (for layout / walkability probes). */
export function sampleBaseTerrainCode(x: number, y: number): number {
  return computeTile(x, y);
}

// ── Settlement biome influence ─────────────────────────────────────────────
function applySettlementInfluence(x: number, y: number, base: number, nearSettlements: [string, typeof SETTLEMENTS[string]][]): number {
  for (const [, s] of nearSettlements) {
    const dx = x - s.x, dy = y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > s.biomeRadius) continue;
    const strength = 1 - dist / s.biomeRadius;
    if (hash(x * 7 + y * 13, 999) < strength * 0.88) return s.biomeCode;
  }
  return base;
}

// ── River check (deterministic per-tile) ───────────────────────────────────
// Pre-baked Set of all river tile keys (y * MAP_W + x). Built once; O(1) lookup.
let _riverSet: Set<number> | null = null;

export function ensureRivers(): Set<number> {
  if (_riverSet) return _riverSet;
  _riverSet = new Set<number>();
  for (const c of CONTINENTS) {
    const numRivers = c.id === 'uloren' ? 3 : 5;
    for (let i = 0; i < numRivers; i++) {
      const seedX = hash(i * 7 + c.cx, c.cy) * c.rx * 2 + (c.cx - c.rx);
      const seedY = hash(i * 13, c.cy + i) * c.ry * 2 + (c.cy - c.ry);
      let rx = seedX, ry = seedY;
      for (let step = 0; step < 2000; step++) {
        // Mark ±2 footprint to match original abs < 2 check
        const bx = Math.floor(rx), by = Math.floor(ry);
        for (let dy = -1; dy <= 2; dy++) {
          for (let dx = -1; dx <= 2; dx++) {
            const tx = bx + dx, ty = by + dy;
            if (tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H)
              _riverSet.add(ty * MAP_W + tx);
          }
        }
        const drift = hash(Math.floor(rx) + step * 29, Math.floor(ry) + step * 19);
        rx += (drift < 0.4 ? -1 : drift > 0.6 ? 1 : 0);
        ry += 1;
        if (ry > c.cy + c.ry) break;
      }
    }
  }
  return _riverSet;
}

function isRiver(x: number, y: number): boolean {
  return ensureRivers().has(y * MAP_W + x);
}

// ── Farm field check ───────────────────────────────────────────────────────
function isFarmField(x: number, y: number, nearSettlements: [string, typeof SETTLEMENTS[string]][]): boolean {
  for (const [id, s] of nearSettlements) {
    if (s.type !== 'village' && s.type !== 'capital' && s.type !== 'inn' && s.type !== 'town') continue;
    const dx = x - s.x, dy = y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const R = s.biomeRadius;
    const inner = Math.max(18, R * 0.22);
    const outer = R * 1.12;
    if (dist < inner || dist > outer) continue;
    // Farm patches are hash-determined
    if (hash(Math.floor(x / 8) * 31 + id.charCodeAt(0), Math.floor(y / 8) * 37) < 0.12) return true;
  }
  return false;
}

// ── Chunk generation ───────────────────────────────────────────────────────
function generateChunk(cx: number, cy: number): ChunkData {
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  const roads = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  const objects: WorldObject[] = [];
  const entities: AmbientEntity[] = [];

  const ox = cx * CHUNK_SIZE, oy = cy * CHUNK_SIZE;
  const roadSet = ensureRoads();

  // Find nearby settlements (within biome influence radius + CHUNK_SIZE)
  const nearby: [string, typeof SETTLEMENTS[string]][] = [];
  for (const [id, s] of Object.entries(SETTLEMENTS)) {
    if (Math.abs(s.x - (ox + 32)) < s.biomeRadius + CHUNK_SIZE &&
        Math.abs(s.y - (oy + 32)) < s.biomeRadius + CHUNK_SIZE) {
      nearby.push([id, s]);
    }
  }

  // ── Tiles ──
  for (let ty = 0; ty < CHUNK_SIZE; ty++) {
    for (let tx = 0; tx < CHUNK_SIZE; tx++) {
      const wx = ox + tx, wy = oy + ty;
      if (wx >= MAP_W || wy >= MAP_H) continue;

      let code = computeTile(wx, wy);
      code = applySettlementInfluence(wx, wy, code, nearby);

      // Farm fields near agricultural settlements
      if ((code === T.GRASS || code === T.CLEARING) && isFarmField(wx, wy, nearby)) {
        code = T.FARM_FIELD;
      }

      // Clearings in forests
      if ((code === T.FOREST || code === T.DENSE_FOREST) && hash(Math.floor(wx / 12), Math.floor(wy / 12) + 5555) < 0.03) {
        code = T.CLEARING;
      }

      tiles[ty * CHUNK_SIZE + tx] = code;
    }
  }

  // ── Roads ──
  for (let ty = 0; ty < CHUNK_SIZE; ty++) {
    for (let tx = 0; tx < CHUNK_SIZE; tx++) {
      const wx = ox + tx, wy = oy + ty;
      if (roadSet.has(wy * MAP_W + wx)) roads[ty * CHUNK_SIZE + tx] = 1;
    }
  }
  mergeSettlementLocalRoadsIntoChunk(cx, cy, roads);
  mergeHamletChunkRoads(cx, cy, roads);

  // ── Objects ──
  generateChunkObjects(cx, cy, tiles, roads, nearby, objects);
  mergeWildernessPoisIntoChunk(cx, cy, tiles, roads, objects);
  mergeHamletStructuresIntoChunk(cx, cy, objects);

  // ── Entities ──
  generateChunkEntities(cx, cy, tiles, roads, nearby, entities);

  return { tiles, roads, objects, entities };
}

// ── Object generation per chunk ────────────────────────────────────────────
function generateChunkObjects(
  cx: number, cy: number,
  tiles: Uint8Array, roads: Uint8Array,
  nearby: [string, typeof SETTLEMENTS[string]][],
  out: WorldObject[],
) {
  const ox = cx * CHUNK_SIZE, oy = cy * CHUNK_SIZE;
  const inChunk = (x: number, y: number) => x >= ox && x < ox + CHUNK_SIZE && y >= oy && y < oy + CHUNK_SIZE;

  for (const [id, s] of nearby) {
    const R = s.biomeRadius;
    const sc = getSettlementLayoutCenter(id);
    const sidewalks = getSettlementSidewalkPositions(id, Math.min(160, Math.max(24, Math.round(12 + R * 0.55))));

    // Wells at every settlement
    if (inChunk(sc.x + 2, sc.y + 2)) out.push({ x: sc.x + 2, y: sc.y + 2, type: 'well', variant: 0 });

    // Huts and fences for villages/towns/capitals
    if (['village', 'town', 'capital', 'inn'].includes(s.type)) {
      const hutN = Math.min(95, Math.max(6, Math.round(6 + R * 0.42)));
      const walkTiles = sidewalks.filter(p => inChunk(p.x, p.y));
      for (let i = 0; i < hutN; i++) {
        let hx: number;
        let hy: number;
        if (walkTiles.length > 0) {
          const pick = walkTiles[Math.floor(hash(i * 9, id.charCodeAt(0)) * walkTiles.length)]!;
          const jx = Math.round((hash(i, id.charCodeAt(1)) - 0.5) * 4);
          const jy = Math.round((hash(i + 3, id.charCodeAt(2)) - 0.5) * 4);
          hx = pick.x + jx;
          hy = pick.y + jy;
        } else {
          const ang = hash(i * 9, id.charCodeAt(0)) * Math.PI * 2;
          const d = Math.max(6, R * 0.12) + hash(i, id.charCodeAt(1)) * R * 0.78;
          hx = Math.round(sc.x + Math.cos(ang) * d);
          hy = Math.round(sc.y + Math.sin(ang) * d);
        }
        if (inChunk(hx, hy)) out.push({ x: hx, y: hy, type: 'hut', variant: i % 4 });
      }
      const fenceN = Math.min(140, Math.max(14, Math.round(14 + R * 0.55)));
      const fenceR = R * 0.84;
      for (let i = 0; i < fenceN; i++) {
        const ang = (i / fenceN) * Math.PI * 2;
        const fx = Math.round(sc.x + Math.cos(ang) * fenceR);
        const fy = Math.round(sc.y + Math.sin(ang) * fenceR);
        if (inChunk(fx, fy)) out.push({ x: fx, y: fy, type: 'fence', variant: i % 2 });
      }
    }

    // Farms around agricultural settlements
    if (['village', 'capital', 'inn', 'town'].includes(s.type)) {
      const farmN = Math.min(55, Math.max(6, Math.round(6 + R * 0.28)));
      for (let i = 0; i < farmN; i++) {
        const ang = hash(i + id.length * 3, i * 7) * Math.PI * 2;
        const d = R * 0.35 + hash(i * 3, i * 11 + id.charCodeAt(0)) * R * 1.05;
        const fx = Math.round(sc.x + Math.cos(ang) * d);
        const fy = Math.round(sc.y + Math.sin(ang) * d);
        if (!inChunk(fx, fy)) continue;
        const li = (fy - oy) * CHUNK_SIZE + (fx - ox);
        const t = tiles[li] ?? T.GRASS;
        if (t === T.GRASS || t === T.FARM_FIELD || t === T.CLEARING) {
          out.push({ x: fx, y: fy, type: hash(i, id.charCodeAt(0)) > 0.6 ? 'barn' : 'farm', variant: i % 4 });
        }
      }
    }

    // Market stalls at trade cities/ports
    if (['city', 'port', 'capital'].includes(s.type)) {
      const stallN = Math.min(36, Math.max(5, Math.round(5 + R * 0.22)));
      const stallWalk = sidewalks.filter(p => inChunk(p.x, p.y) && Math.hypot(p.x - sc.x, p.y - sc.y) < R * 0.5);
      for (let i = 0; i < stallN; i++) {
        let mx: number;
        let my: number;
        if (stallWalk.length > 0) {
          const pick = stallWalk[Math.floor(hash(i * 5, id.charCodeAt(0)) * stallWalk.length)]!;
          mx = pick.x;
          my = pick.y;
        } else {
          const ang = hash(i * 5, id.charCodeAt(0)) * Math.PI * 2;
          const d = Math.max(4, R * 0.08) + hash(i * 7, id.charCodeAt(1)) * R * 0.35;
          mx = Math.round(sc.x + Math.cos(ang) * d);
          my = Math.round(sc.y + Math.sin(ang) * d);
        }
        if (inChunk(mx, my)) out.push({ x: mx, y: my, type: 'market_stall', variant: i % 4 });
      }
    }

    // Watchtowers and walls at fortresses/capitals
    if (['fortress', 'capital'].includes(s.type)) {
      const towerN = Math.min(14, Math.max(4, Math.round(3 + R / 28)));
      for (let i = 0; i < towerN; i++) {
        const ang = (i / towerN) * Math.PI * 2 + Math.PI / 4;
        const wr = R * 0.26;
        const wx = Math.round(sc.x + Math.cos(ang) * wr);
        const wy = Math.round(sc.y + Math.sin(ang) * wr);
        if (inChunk(wx, wy)) out.push({ x: wx, y: wy, type: 'watchtower', variant: i % 2 });
      }
      const wallSegs = Math.min(96, Math.max(24, Math.round(22 + R * 0.55)));
      const wallR = R * 0.2;
      for (let i = 0; i < wallSegs; i++) {
        const ang = (i / wallSegs) * Math.PI * 2;
        const wx = Math.round(sc.x + Math.cos(ang) * wallR);
        const wy = Math.round(sc.y + Math.sin(ang) * wallR);
        if (inChunk(wx, wy)) out.push({ x: wx, y: wy, type: 'stone_wall', variant: i % 4 });
      }
      const gateY = Math.round(sc.y + R * 0.2);
      if (inChunk(sc.x, gateY)) out.push({ x: sc.x, y: gateY, type: 'gate', variant: 0 });
    }

    // Ruins at ruin sites
    if (s.type === 'ruins') {
      const pillarN = Math.min(48, Math.max(10, Math.round(10 + R * 0.35)));
      for (let i = 0; i < pillarN; i++) {
        const ang = hash(i * 11, id.charCodeAt(0)) * Math.PI * 2;
        const d = 6 + hash(i * 13, id.charCodeAt(1)) * R * 0.85;
        const rx = Math.round(sc.x + Math.cos(ang) * d);
        const ry = Math.round(sc.y + Math.sin(ang) * d);
        if (inChunk(rx, ry)) out.push({ x: rx, y: ry, type: 'ruins_pillar', variant: i % 4 });
      }
      const circleN = Math.min(22, Math.max(8, Math.round(8 + R * 0.12)));
      const circleR = R * 0.22;
      for (let i = 0; i < circleN; i++) {
        const ang = (i / circleN) * Math.PI * 2;
        const rx = Math.round(sc.x + Math.cos(ang) * circleR);
        const ry = Math.round(sc.y + Math.sin(ang) * circleR);
        if (inChunk(rx, ry)) out.push({ x: rx, y: ry, type: 'stone_circle', variant: i % 2 });
      }
      const shrY = Math.round(sc.y - R * 0.12);
      if (inChunk(sc.x, shrY)) out.push({ x: sc.x, y: shrY, type: 'shrine', variant: 0 });
    }

    // Docks at ports
    if (s.type === 'port') {
      const dockN = Math.min(14, Math.max(5, Math.round(5 + R * 0.1)));
      for (let i = 0; i < dockN; i++) {
        const dx = sc.x - Math.round(R * 0.22) + i * Math.round(4 + R * 0.04);
        const dy = sc.y + Math.round(R * 0.08) + i * 2;
        if (inChunk(dx, dy)) out.push({ x: dx, y: dy, type: 'dock', variant: i % 3 });
      }
    }

    // Windmills near villages
    if (['village', 'town'].includes(s.type)) {
      const wmN = Math.min(8, Math.max(2, Math.round(2 + R / 45)));
      for (let i = 0; i < wmN; i++) {
        const ang = hash(i * 17, id.charCodeAt(0) + 60) * Math.PI * 2;
        const d = R * 0.55 + hash(i * 23, id.charCodeAt(1)) * R * 1.1;
        const wx = Math.round(sc.x + Math.cos(ang) * d);
        const wy = Math.round(sc.y + Math.sin(ang) * d);
        if (inChunk(wx, wy)) out.push({ x: wx, y: wy, type: 'windmill', variant: i % 2 });
      }
    }
  }

  // Campfires along roads
  for (let ty = 0; ty < CHUNK_SIZE; ty += 3) {
    for (let tx = 0; tx < CHUNK_SIZE; tx += 3) {
      if (roads[ty * CHUNK_SIZE + tx] === 1 && hash((ox + tx) * 97, (oy + ty) * 113) < 0.004) {
        out.push({ x: ox + tx, y: oy + ty, type: 'campfire', variant: 0 });
      }
    }
  }
}

// ── Entity generation per chunk ────────────────────────────────────────────
function generateChunkEntities(
  cx: number, cy: number,
  tiles: Uint8Array,
  roads: Uint8Array,
  nearby: [string, typeof SETTLEMENTS[string]][],
  out: AmbientEntity[],
) {
  const ox = cx * CHUNK_SIZE, oy = cy * CHUNK_SIZE;

  // Ambient critters only (deer/sheep/rabbit/wolves are dynamic WorldEntity spawns)
  for (let ty = 0; ty < CHUNK_SIZE; ty += 4) {
    for (let tx = 0; tx < CHUNK_SIZE; tx += 4) {
      const wx = ox + tx, wy = oy + ty;
      const code = tiles[ty * CHUNK_SIZE + tx];
      const h = hash(wx * 37 + wy * 53, 7777);
      const h2 = hash(wx * 41, wy * 59);

      if ((code === T.MOUNTAIN || code === T.SNOW || code === T.HILL) && h < 0.008)
        out.push({ x: wx, y: wy, type: 'eagle', speed: 0.5 + h2 * 0.4, phase: h2 * Math.PI * 2, radius: 24 });
      else if ((code === T.RIVER || code === T.WATER) && h < 0.025)
        out.push({ x: wx, y: wy, type: 'fish', speed: 0.3 + h2 * 0.3, phase: h2 * Math.PI * 2, radius: 7 });
      else if ((code === T.FOREST || code === T.HILL) && h > 0.97)
        out.push({ x: wx, y: wy, type: 'crow', speed: 0.6 + h2 * 0.4, phase: h2 * Math.PI * 2, radius: 18 });
      else if ((code === T.SAND || code === T.RIVER) && h < 0.012)
        out.push({ x: wx, y: wy, type: 'fisherman', speed: 0.03 + h2 * 0.04, phase: h2 * Math.PI * 2, radius: 4 });
    }
  }

  // Settlement entities (villagers, guards, merchants)
  for (const [id, s] of nearby) {
    const inChunk = (x: number, y: number) => x >= ox && x < ox + CHUNK_SIZE && y >= oy && y < oy + CHUNK_SIZE;
    const R = s.biomeRadius;
    const sc = getSettlementLayoutCenter(id);

    if (['village', 'town', 'city', 'capital', 'inn', 'port'].includes(s.type)) {
      const nV = Math.min(55, Math.max(4, Math.round(4 + R * 0.22)));
      const sw = getSettlementSidewalkPositions(id, nV * 2).filter(p => inChunk(p.x, p.y));
      const spread = R * 0.72;
      for (let i = 0; i < nV; i++) {
        let vx: number;
        let vy: number;
        if (sw.length > 0) {
          const pick = sw[Math.floor(hash(i * 3, id.charCodeAt(0)) * sw.length)]!;
          vx = pick.x;
          vy = pick.y;
        } else {
          vx = sc.x + Math.round((hash(i * 3, id.charCodeAt(0)) - 0.5) * spread * 2);
          vy = sc.y + Math.round((hash(i * 7, id.charCodeAt(1)) - 0.5) * spread * 2);
        }
        if (!inChunk(vx, vy)) continue;
        out.push({
          x: vx, y: vy, type: 'villager',
          speed: 0.12 + hash(i, id.charCodeAt(0) + 50) * 0.18,
          phase: hash(i * 11, id.charCodeAt(0)) * Math.PI * 2, radius: 12,
        });
      }
    }

    if (['fortress', 'capital'].includes(s.type)) {
      const nG = Math.min(28, Math.max(4, Math.round(4 + R / 20)));
      const gR = R * 0.22;
      for (let i = 0; i < nG; i++) {
        const ang = (i / nG) * Math.PI * 2;
        const gx = Math.round(sc.x + Math.cos(ang) * gR);
        const gy = Math.round(sc.y + Math.sin(ang) * gR);
        if (!inChunk(gx, gy)) continue;
        out.push({ x: gx, y: gy, type: 'guard', speed: 0.18, phase: ang, radius: 6 });
      }
    }
  }

  // Merchants/travelers on roads
  for (let ty = 0; ty < CHUNK_SIZE; ty += 8) {
    for (let tx = 0; tx < CHUNK_SIZE; tx += 8) {
      const wx = ox + tx, wy = oy + ty;
      const localIdx = ty * CHUNK_SIZE + tx;
      if (roads[localIdx] === 1 || tiles[localIdx] === T.ROAD || (wx < MAP_W && wy < MAP_H && ensureRoads().has(wy * MAP_W + wx))) {
        if (hash(wx * 101, wy * 103) < 0.005) {
          out.push({
            x: wx, y: wy,
            type: hash(wx, wy * 2929) > 0.5 ? 'merchant' : 'traveler',
            speed: 0.10 + hash(wx, wy * 3030) * 0.22,
            phase: hash(wx * 103, wy * 3131) * Math.PI * 2, radius: 35,
          });
        }
      }
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────
export function getChunkData(cx: number, cy: number): ChunkData {
  const key = cy * NUM_CHUNKS_X + cx;
  let data = chunkCache.get(key);
  if (!data) {
    data = generateChunk(cx, cy);
    chunkCache.set(key, data);
  }
  return data;
}

export function getTileAt(x: number, y: number): number {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return T.DEEP_WATER;
  const cx = Math.floor(x / CHUNK_SIZE), cy = Math.floor(y / CHUNK_SIZE);
  const chunk = getChunkData(cx, cy);
  const lx = x - cx * CHUNK_SIZE, ly = y - cy * CHUNK_SIZE;
  const roadSet = ensureRoads();
  if (roadSet.has(y * MAP_W + x)) return T.ROAD;
  if (isSettlementLocalRoad(x, y)) return T.ROAD;
  return chunk.tiles[ly * CHUNK_SIZE + lx];
}

export function getRoadAt(x: number, y: number): boolean {
  return ensureRoads().has(y * MAP_W + x) || isSettlementLocalRoad(x, y);
}

export function isWalkable(tile: TileType): boolean {
  return tile !== 'deep_water' && tile !== 'water' && tile !== 'mountain';
}

export function isWalkableCode(code: number): boolean {
  return code !== T.DEEP_WATER && code !== T.WATER && code !== T.MOUNTAIN;
}

export function tileCodeToType(code: number): TileType {
  return TILE_NAMES[code] ?? 'grass';
}

// Legacy compat — no longer creates a full map; returns stub so old imports don't break
export interface WorldMapLegacy { tiles: null; roads: null; objects: never[]; entities: never[]; }
export function generateWorldMap(): WorldMapLegacy {
  return { tiles: null, roads: null, objects: [], entities: [] };
}
