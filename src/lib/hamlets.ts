import {
  LOCATION_COORDS,
  MAP_W,
  MAP_H,
  ensureRoads,
  getContinentAt,
  getSettlementMeta,
  type ContinentId,
} from './mapGenerator';
import { mergeHamletSpurRoadsIntoChunk, type HamletPoint } from './settlementLayout';

export type HamletArchetype =
  | 'shepherd_camp'
  | 'river_hut'
  | 'logging_stead'
  | 'shrine_waypost'
  | 'toll_cabin'
  | 'apiary'
  | 'charcoal_burner'
  | 'wayfarer_camp'
  | 'shearing_shed'
  | 'orchard_house'
  | 'ferry_house'
  | 'salt_boiler';

export interface HamletDef {
  id: string;
  displayName: string;
  x: number;
  y: number;
  archetype: HamletArchetype;
  continent: ContinentId | null;
}

const ARCHETYPES: HamletArchetype[] = [
  'shepherd_camp',
  'river_hut',
  'logging_stead',
  'shrine_waypost',
  'toll_cabin',
  'apiary',
  'charcoal_burner',
  'wayfarer_camp',
  'shearing_shed',
  'orchard_house',
  'ferry_house',
  'salt_boiler',
];

const ARCHETYPE_NAMES: Record<HamletArchetype, string[]> = {
  shepherd_camp: ['High Pasture', 'Woolfold', 'Shepherd\'s Rest', 'Blackthorn Fold'],
  river_hut: ['Reed Landing', 'Stillwater', 'Eel Run', 'Gray Dock'],
  logging_stead: ['Axe Rest', 'Pine Notch', 'Sawdust Yard', 'Timber End'],
  shrine_waypost: ['Stone Mercy', 'Traveler\'s Blessing', 'Small Gods\' Plot', 'Ash Marker'],
  toll_cabin: ['Gatepost', 'Coin Bridge', 'Levy House', 'Toll Oak'],
  apiary: ['Honey Row', 'Wax Yard', 'Bee Hollow', 'Golden Hive'],
  charcoal_burner: ['Smoke Mound', 'Black Pit', 'Kiln Row', 'Cinder Field'],
  wayfarer_camp: ['Ash Circle', 'Star Camp', 'Dry Hollow', 'Mile Rest'],
  shearing_shed: ['Clip Yard', 'Fleece Post', 'Low Barn', 'Spring Fold'],
  orchard_house: ['Apple Row', 'Pear Close', 'Cider End', 'Bloom Gate'],
  ferry_house: ['Oar House', 'Crossing', 'Wet Rope', 'Mud Landing'],
  salt_boiler: ['Brine Pit', 'White Pan', 'Crystal Shed', 'Salt Row'],
};

function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt) & 0xffffffff;
  h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff;
  h = ((h ^ (h >> 16)) * 1911520717) & 0xffffffff;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function nearRoad(rs: Set<number>, x: number, y: number): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || xx >= MAP_W || yy < 0 || yy >= MAP_H) continue;
      if (rs.has(yy * MAP_W + xx)) return true;
    }
  }
  return false;
}

function farFromNamedSettlements(x: number, y: number): boolean {
  for (const [id, c] of Object.entries(LOCATION_COORDS)) {
    const meta = getSettlementMeta(id);
    const br = meta?.biomeRadius ?? 40;
    const d = Math.hypot(x - c.x, y - c.y);
    if (d < br + 24) return false;
  }
  return true;
}

function hamletProbability(continent: ContinentId | null): number {
  if (continent === 'auredia') return 0.34;
  if (continent === 'trivalen') return 0.2;
  if (continent === 'uloren') return 0.065;
  return 0;
}

function buildHamlets(): HamletDef[] {
  const rs = ensureRoads();
  const sites: HamletDef[] = [];
  const minSpacing = 36;
  /** Larger stride = fewer grid probes (boot cost); cap still limits hamlet count. */
  const stride = 84;

  for (let gy = stride; gy < MAP_H - stride; gy += stride) {
    for (let gx = stride; gx < MAP_W - stride; gx += stride) {
      const jitterX = Math.floor((hash(gx, gy, 1) - 0.5) * 28);
      const jitterY = Math.floor((hash(gx, gy, 2) - 0.5) * 28);
      const x = Math.max(8, Math.min(MAP_W - 9, gx + jitterX));
      const y = Math.max(8, Math.min(MAP_H - 9, gy + jitterY));
      if (!nearRoad(rs, x, y)) continue;
      if (!farFromNamedSettlements(x, y)) continue;
      const continent = getContinentAt(x, y);
      const p = hamletProbability(continent);
      if (hash(x, y, 3) > p) continue;

      let ok = true;
      for (const h of sites) {
        if (Math.hypot(h.x - x, h.y - y) < minSpacing) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      const arch = ARCHETYPES[Math.floor(hash(x, y, 4) * ARCHETYPES.length)]!;
      const pool = ARCHETYPE_NAMES[arch];
      const base = pool[Math.floor(hash(x, y, 5) * pool.length)]!;
      const suffix = Math.floor(hash(x, y, 6) * 900 + 100);
      const id = `hamlet_${gx}_${gy}`;
      sites.push({
        id,
        displayName: `${base} ${suffix}`,
        x,
        y,
        archetype: arch,
        continent,
      });
      if (sites.length >= 140) return sites;
    }
  }
  return sites;
}

let _hamlets: HamletDef[] | null = null;

/** Clears cached hamlet sites (call when world seed / roads change). */
export function invalidateHamletCache(): void {
  _hamlets = null;
}

export function getHamlets(): HamletDef[] {
  if (!_hamlets) _hamlets = buildHamlets();
  return _hamlets;
}

/** Named settlements plus procedural road hamlets (for discovery, travel, minimap). */
export function getExtendedLocationCoords(): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = { ...LOCATION_COORDS };
  for (const h of getHamlets()) {
    out[h.id] = { x: h.x, y: h.y };
  }
  return out;
}

export function isHamletId(id: string): boolean {
  return id.startsWith('hamlet_');
}

/** Merge procedural hamlet spur roads into a chunk road bitmask (called from mapGenerator). */
export function mergeHamletChunkRoads(cx: number, cy: number, roads: Uint8Array): void {
  const pts: HamletPoint[] = getHamlets().map(h => ({ x: h.x, y: h.y, id: h.id }));
  mergeHamletSpurRoadsIntoChunk(cx, cy, roads, pts);
}
