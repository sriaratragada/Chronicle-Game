import {
  CHUNK_SIZE,
  MAP_W,
  MAP_H,
  ensureRoads,
  getSettlementMeta,
  LOCATION_COORDS,
  getWorldSeed,
  getChunkData,
  sampleBaseTerrainCode,
  TILE_NAMES,
  TRADE_CONNECTIONS,
  type WorldObject,
  type WorldObjectType,
  type ContinentId,
} from './mapGenerator';
import { buildRoutePolyline } from './tradeRoutes';

const T = {
  GRASS: 3,
  FOREST: 4,
  DENSE_FOREST: 5,
  HILL: 6,
  CLEARING: 13,
  FARM_FIELD: 14,
  ROAD: 11,
  RUINS: 10,
  SWAMP: 9,
  WATER: 1,
  DEEP_WATER: 0,
  SAND: 2,
};

function poiHash(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt + getWorldSeed() * 131) & 0xffffffff;
  h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff;
  h = ((h ^ (h >> 16)) * 1911520717) & 0xffffffff;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function farFromSettlements(x: number, y: number, margin: number): boolean {
  for (const [id, c] of Object.entries(LOCATION_COORDS)) {
    const meta = getSettlementMeta(id);
    const r = (meta?.biomeRadius ?? 50) + margin;
    if (Math.hypot(x - c.x, y - c.y) < r) return false;
  }
  return true;
}

function tileAt(tiles: Uint8Array, ox: number, oy: number, wx: number, wy: number): number {
  if (wx < ox || wx >= ox + CHUNK_SIZE || wy < oy || wy >= oy + CHUNK_SIZE) return -1;
  return tiles[(wy - oy) * CHUNK_SIZE + (wx - ox)]!;
}

function hasLakeNeighbor(tiles: Uint8Array, ox: number, oy: number, wx: number, wy: number): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const c = tileAt(tiles, ox, oy, wx + dx, wy + dy);
      if (c === T.WATER || c === T.DEEP_WATER) return true;
    }
  }
  return false;
}

const POI_TYPES: WorldObjectType[] = [
  'poi_lakeshore',
  'poi_chapel',
  'poi_knight_camp',
  'poi_wrecked_cart',
  'poi_standing_stone',
  'poi_monster_lair',
  'poi_watchtower',
  'poi_stockade_ruins',
];

/** Deterministic wilderness POIs merged into chunk object lists. */
export function mergeWildernessPoisIntoChunk(
  cx: number,
  cy: number,
  tiles: Uint8Array,
  roads: Uint8Array,
  out: WorldObject[],
): void {
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;
  const h = poiHash(cx, cy, 88421);
  if (h > 0.13) return;

  const txi = Math.floor(poiHash(cx + 1, cy, 991) * (CHUNK_SIZE - 16)) + 8;
  const tyi = Math.floor(poiHash(cx, cy + 2, 992) * (CHUNK_SIZE - 16)) + 8;
  let wx = ox + txi;
  let wy = oy + tyi;

  // Nudge onto walkable-ish tile
  for (let s = 0; s < 40; s++) {
    const c = tileAt(tiles, ox, oy, wx, wy);
    if (
      c === T.GRASS ||
      c === T.CLEARING ||
      c === T.FARM_FIELD ||
      c === T.FOREST ||
      c === T.HILL ||
      c === T.RUINS
    ) {
      break;
    }
    const ang = poiHash(s, cx, 77) * Math.PI * 2;
    wx = ox + txi + Math.round(Math.cos(ang) * (s % 9));
    wy = oy + tyi + Math.round(Math.sin(ang) * (s % 9));
  }

  if (!farFromSettlements(wx, wy, 48)) return;

  const roll = poiHash(wx, wy, 66261);
  let kind: WorldObjectType = 'poi_standing_stone';
  if (roll < 0.16 && hasLakeNeighbor(tiles, ox, oy, wx, wy)) kind = 'poi_lakeshore';
  else if (roll < 0.32) kind = 'poi_chapel';
  else if (roll < 0.48) kind = 'poi_knight_camp';
  else if (roll < 0.62) {
    kind = 'poi_wrecked_cart';
    const rs = ensureRoads();
    for (let tryRoad = 0; tryRoad < 30; tryRoad++) {
      const rx = ox + Math.floor(poiHash(tryRoad, cy, 51) * CHUNK_SIZE);
      const ry = oy + Math.floor(poiHash(cx, tryRoad, 52) * CHUNK_SIZE);
      if (rs.has(ry * MAP_W + rx) || roads[(ry - oy) * CHUNK_SIZE + (rx - ox)] === 1) {
        wx = rx;
        wy = ry;
        break;
      }
    }
  } else if (roll < 0.67) kind = 'poi_standing_stone';
  else if (roll < 0.78) kind = 'poi_monster_lair';
  else if (roll < 0.89) kind = 'poi_watchtower';
  else kind = 'poi_stockade_ruins';

  if (kind === 'poi_monster_lair') {
    let found = false;
    for (let dy = -12; dy <= 12 && !found; dy++) {
      for (let dx = -12; dx <= 12; dx++) {
        const wxx = ox + txi + dx;
        const wyy = oy + tyi + dy;
        const c = tileAt(tiles, ox, oy, wxx, wyy);
        if (c === T.RUINS || c === T.HILL) {
          wx = wxx; wy = wyy; found = true; break;
        }
      }
    }
  }

  // Watchtowers prefer hill tiles for maximum drama
  if (kind === 'poi_watchtower') {
    let found = false;
    for (let dy = -10; dy <= 10 && !found; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        const wxx = ox + txi + dx;
        const wyy = oy + tyi + dy;
        if (tileAt(tiles, ox, oy, wxx, wyy) === T.HILL) {
          wx = wxx; wy = wyy; found = true; break;
        }
      }
    }
  }

  if (!farFromSettlements(wx, wy, 36)) return;

  const poiId = `wpoi_${wx}_${wy}_${kind}`;
  if (out.some(o => o.poiId === poiId || (o.x === wx && o.y === wy))) return;

  out.push({
    x: wx,
    y: wy,
    type: kind,
    variant: Math.floor(poiHash(wx, wy, 3) * 4),
    poiId,
  });

  for (const inn of getRoadInnSites()) {
    if (inn.x >= ox && inn.x < ox + CHUNK_SIZE && inn.y >= oy && inn.y < oy + CHUNK_SIZE) {
      if (out.some(o => o.poiId === inn.id)) continue;
      out.push({ x: inn.x, y: inn.y, type: 'poi_road_inn', variant: 0, poiId: inn.id });
    }
  }
}

export interface NearestPoiResult {
  obj: WorldObject;
  dist: number;
}

export function findNearestWildernessPoi(px: number, py: number, maxDist: number): NearestPoiResult | null {
  const POI_PREFIX = 'poi_';
  let best: NearestPoiResult | null = null;
  const cxi = Math.floor(px / CHUNK_SIZE);
  const cyi = Math.floor(py / CHUNK_SIZE);
  for (let dcy = -1; dcy <= 1; dcy++) {
    for (let dcx = -1; dcx <= 1; dcx++) {
      const cx = cxi + dcx;
      const cy = cyi + dcy;
      if (cx < 0 || cy < 0 || cx >= Math.ceil(MAP_W / CHUNK_SIZE) || cy >= Math.ceil(MAP_H / CHUNK_SIZE)) continue;
      const chunk = getChunkData(cx, cy);
      for (const obj of chunk.objects) {
        if (!obj.type.startsWith(POI_PREFIX)) continue;
        const d = Math.hypot(obj.x - px, obj.y - py);
        if (d > maxDist) continue;
        if (!best || d < best.dist) best = { obj, dist: d };
      }
    }
  }
  return best;
}

export interface RoadInnSite {
  id: string;
  x: number;
  y: number;
  continent: ContinentId;
}

let cachedRoadInns: RoadInnSite[] | null = null;

export function invalidateWildernessCaches(): void {
  cachedRoadInns = null;
}

/** Trail inns along trade roads (Auredia + Trivalen only). */
export function getRoadInnSites(): RoadInnSite[] {
  if (cachedRoadInns) return cachedRoadInns;
  cachedRoadInns = computeRoadInnSitesInternal();
  return cachedRoadInns;
}

function computeRoadInnSitesInternal(): RoadInnSite[] {
  const sites: RoadInnSite[] = [];
  let idx = 0;
  for (const [a, b] of TRADE_CONNECTIONS) {
    const poly = buildRoutePolyline(a, b);
    if (poly.length < 120) continue;
    const step = 520;
    for (let i = step; i < poly.length - step; i += step) {
      const jitter = Math.floor(poiHash(idx, i, 77123) * 24) - 12;
      const p = poly[i + jitter] ?? poly[i];
      if (!p) continue;
      const x = p.x;
      const y = p.y;
      const cont = ((): ContinentId | null => {
        if (x < 4000) return 'auredia';
        if (x < 8200) return 'trivalen';
        return null;
      })();
      if (cont === null) continue;
      if (!farFromSettlements(x, y, 70)) continue;
      const code = sampleBaseTerrainCode(x, y);
      const tname = TILE_NAMES[code] ?? 'grass';
      if (!['grass', 'clearing', 'farm_field', 'forest', 'hill'].includes(tname)) continue;

      const id = `road_inn_${a}_${b}_${i}`;
      sites.push({ id, x, y, continent: cont });
      idx++;
      if (sites.length >= 28) return sites;
    }
  }
  return sites;
}
