/**
 * Deterministic settlement-local road skeleton + building anchors.
 * Centers are nudged off global trade roads; arterials branch inside a tiered bbox.
 */
import {
  LOCATION_COORDS,
  getSettlementMeta,
  ensureRoads,
  MAP_W,
  MAP_H,
  CHUNK_SIZE,
  isWalkableCode,
  sampleBaseTerrainCode,
  getWorldSeed,
} from './mapGenerator';

export interface HamletPoint {
  x: number;
  y: number;
  id: string;
}

function layoutHash(id: string, salt: number): number {
  const seed = getWorldSeed();
  let h = ((id.charCodeAt(0) ?? 65) * 127 + id.length * 997 + salt * 1315423911 + seed) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function bresenhamLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

function halfExtentForType(type: string): number {
  switch (type) {
    case 'capital':
      return 56;
    case 'city':
      return 44;
    case 'town':
      return 34;
    case 'fortress':
      return 48;
    case 'port':
      return 46;
    case 'village':
      return 26;
    case 'inn':
      return 18;
    case 'ruins':
      return 24;
    case 'wilderness':
      return 22;
    default:
      return 24;
  }
}

const layoutCenterCache = new Map<string, { x: number; y: number }>();
const roadKeysBySettlement = new Map<string, Set<number>>();

/** Logical center for layout (off main trail when possible). */
export function getSettlementLayoutCenter(settlementId: string): { x: number; y: number } {
  const hit = layoutCenterCache.get(settlementId);
  if (hit) return hit;

  const base = LOCATION_COORDS[settlementId];
  if (!base) return { x: 0, y: 0 };
  const meta = getSettlementMeta(settlementId);
  if (!meta) {
    const r = { x: base.x, y: base.y };
    layoutCenterCache.set(settlementId, r);
    return r;
  }

  const rs = ensureRoads();
  const ang = layoutHash(settlementId, 1) * Math.PI * 2;
  let dist = 6 + Math.floor(layoutHash(settlementId, 2) * 10);
  let cx = base.x + Math.round(Math.cos(ang) * dist);
  let cy = base.y + Math.round(Math.sin(ang) * dist);

  const walk = (x: number, y: number) =>
    x >= 0 &&
    x < MAP_W &&
    y >= 0 &&
    y < MAP_H &&
    isWalkableCode(sampleBaseTerrainCode(x, y)) &&
    !rs.has(y * MAP_W + x);

  for (let attempt = 0; attempt < 12; attempt++) {
    if (walk(cx, cy)) break;
    dist = Math.max(2, dist - 2);
    cx = base.x + Math.round(Math.cos(ang) * dist);
    cy = base.y + Math.round(Math.sin(ang) * dist);
    if (attempt === 6) {
      cx = base.x;
      cy = base.y;
    }
  }

  if (rs.has(cy * MAP_W + cx)) {
    const perp = ang + Math.PI / 2;
    const step = 5 + Math.floor(layoutHash(settlementId, 3) * 6);
    const ox = Math.round(Math.cos(perp) * step);
    const oy = Math.round(Math.sin(perp) * step);
    const nx = Math.max(0, Math.min(MAP_W - 1, cx + ox));
    const ny = Math.max(0, Math.min(MAP_H - 1, cy + oy));
    if (walk(nx, ny)) {
      cx = nx;
      cy = ny;
    }
  }

  const out = { x: cx, y: cy };
  layoutCenterCache.set(settlementId, out);
  return out;
}

function buildRoadKeysForSettlementUncached(settlementId: string): Set<number> {
  const keys = new Set<number>();
  const meta = getSettlementMeta(settlementId);
  const base = LOCATION_COORDS[settlementId];
  if (!meta || !base) return keys;

  const center = getSettlementLayoutCenter(settlementId);
  const hw = halfExtentForType(meta.type);
  const minX = Math.max(0, center.x - hw);
  const maxX = Math.min(MAP_W - 1, center.x + hw);
  const minY = Math.max(0, center.y - hw);
  const maxY = Math.min(MAP_H - 1, center.y + hw);

  const addLine = (a: [number, number], b: [number, number]) => {
    for (const [x, y] of bresenhamLine(a[0], a[1], b[0], b[1])) {
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
      keys.add(y * MAP_W + x);
      if (layoutHash(settlementId, x * 17 + y) < 0.12) {
        const jx = x + (layoutHash(settlementId, x + y * 31) < 0.5 ? -1 : 1);
        const jy = y + (layoutHash(settlementId, x * 13 + y) < 0.5 ? -1 : 1);
        if (jx >= 0 && jx < MAP_W && jy >= 0 && jy < MAP_H) keys.add(jy * MAP_W + jx);
      }
    }
  };

  const nArterials =
    meta.type === 'capital' ? 3 : meta.type === 'city' || meta.type === 'town' ? 2 : meta.type === 'fortress' || meta.type === 'port' ? 2 : 1;

  if (nArterials >= 1) {
    addLine([center.x, minY], [center.x, maxY]);
  }
  if (nArterials >= 2) {
    addLine([minX, center.y], [maxX, center.y]);
  }
  if (nArterials >= 3) {
    addLine([minX, minY], [maxX, maxY]);
  }

  const gates: [number, number][] = [
    [center.x, minY],
    [center.x, maxY],
    [minX, center.y],
    [maxX, center.y],
  ];
  for (const g of gates) {
    addLine([center.x, center.y], [Math.max(minX, Math.min(maxX, g[0])), Math.max(minY, Math.min(maxY, g[1]))]);
  }

  if (['capital', 'city', 'town'].includes(meta.type)) {
    const q = Math.floor(hw * 0.55);
    const districts: [number, number][] = [
      [center.x - q, center.y - q],
      [center.x + q, center.y - q],
      [center.x - q, center.y + q],
      [center.x + q, center.y + q],
    ];
    for (const d of districts) {
      const dx = Math.max(minX, Math.min(maxX, d[0]));
      const dy = Math.max(minY, Math.min(maxY, d[1]));
      addLine([center.x, center.y], [dx, dy]);
    }
  }

  const spurToGlobal = ensureRoads();
  let nearRx = base.x;
  let nearRy = base.y;
  let bestD = Infinity;
  for (let dy = -28; dy <= 28; dy += 4) {
    for (let dx = -28; dx <= 28; dx += 4) {
      const tx = base.x + dx;
      const ty = base.y + dy;
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      if (!spurToGlobal.has(ty * MAP_W + tx)) continue;
      const d = (tx - center.x) ** 2 + (ty - center.y) ** 2;
      if (d < bestD) {
        bestD = d;
        nearRx = tx;
        nearRy = ty;
      }
    }
  }
  addLine([center.x, center.y], [nearRx, nearRy]);

  return keys;
}

function collectRoadKeysForSettlement(settlementId: string): Set<number> {
  let cached = roadKeysBySettlement.get(settlementId);
  if (cached) return cached;
  cached = buildRoadKeysForSettlementUncached(settlementId);
  roadKeysBySettlement.set(settlementId, cached);
  return cached;
}

let _unionLocalRoads: Set<number> | null = null;

export function invalidateSettlementRoadCache(): void {
  _unionLocalRoads = null;
  layoutCenterCache.clear();
  roadKeysBySettlement.clear();
}

/** Build union of all settlement-local road cells once (cached). Call during boot before mass getTileAt. */
export function warmSettlementRoadIndexes(): void {
  ensureUnionLocalRoads();
}

function ensureUnionLocalRoads(): Set<number> {
  if (_unionLocalRoads) return _unionLocalRoads;
  const u = new Set<number>();
  for (const id of Object.keys(LOCATION_COORDS)) {
    const meta = getSettlementMeta(id);
    if (!meta) continue;
    for (const k of collectRoadKeysForSettlement(id)) u.add(k);
  }
  _unionLocalRoads = u;
  return u;
}

export function isSettlementLocalRoad(wx: number, wy: number): boolean {
  if (wx < 0 || wx >= MAP_W || wy < 0 || wy >= MAP_H) return false;
  return ensureUnionLocalRoads().has(wy * MAP_W + wx);
}

/** Mark chunk-local road cells from settlement skeletons. */
export function mergeSettlementLocalRoadsIntoChunk(cx: number, cy: number, roads: Uint8Array): void {
  const u = ensureUnionLocalRoads();
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;
  for (let ty = 0; ty < CHUNK_SIZE; ty++) {
    for (let tx = 0; tx < CHUNK_SIZE; tx++) {
      const wx = ox + tx;
      const wy = oy + ty;
      if (u.has(wy * MAP_W + wx)) roads[ty * CHUNK_SIZE + tx] = 1;
    }
  }
}

/** Short spur from hamlet toward nearest global road (deterministic). */
export function mergeHamletSpurRoadsIntoChunk(cx: number, cy: number, roads: Uint8Array, hamlets: HamletPoint[]): void {
  const rs = ensureRoads();
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;
  for (const h of hamlets) {
    if (h.x < ox - 8 || h.x > ox + CHUNK_SIZE + 8 || h.y < oy - 8 || h.y > oy + CHUNK_SIZE + 8) continue;
    let rx = h.x;
    let ry = h.y;
    let best = Infinity;
    for (let dy = -20; dy <= 20; dy += 2) {
      for (let dx = -20; dx <= 20; dx += 2) {
        const tx = h.x + dx;
        const ty = h.y + dy;
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        if (!rs.has(ty * MAP_W + tx)) continue;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          rx = tx;
          ry = ty;
        }
      }
    }
    const seed = getWorldSeed() + h.id.charCodeAt(0) * 131;
    const jitter = (salt: number) => ((seed * 9301 + salt * 49297) % 233280) / 233280 - 0.5;
    for (const [px, py] of bresenhamLine(h.x, h.y, rx, ry)) {
      const jx = Math.max(0, Math.min(MAP_W - 1, px + Math.round(jitter(px) * 2)));
      const jy = Math.max(0, Math.min(MAP_H - 1, py + Math.round(jitter(py + 17) * 2)));
      if (jx >= ox && jx < ox + CHUNK_SIZE && jy >= oy && jy < oy + CHUNK_SIZE) {
        roads[(jy - oy) * CHUNK_SIZE + (jx - ox)] = 1;
      }
    }
  }
}

/** Sidewalk tiles: walkable, not road, 4-neighbor to a local road inside settlement bbox. */
export function getSettlementSidewalkPositions(settlementId: string, max: number): { x: number; y: number }[] {
  const meta = getSettlementMeta(settlementId);
  const roadKeys = collectRoadKeysForSettlement(settlementId);
  if (!meta || roadKeys.size === 0) return [];

  const center = getSettlementLayoutCenter(settlementId);
  const hw = halfExtentForType(meta.type);
  const minX = Math.max(1, center.x - hw);
  const maxX = Math.min(MAP_W - 2, center.x + hw);
  const minY = Math.max(1, center.y - hw);
  const maxY = Math.min(MAP_H - 2, center.y + hw);

  const out: { x: number; y: number }[] = [];
  const rs = ensureRoads();

  for (let y = minY; y <= maxY && out.length < max * 6; y++) {
    for (let x = minX; x <= maxX && out.length < max * 6; x++) {
      if (roadKeys.has(y * MAP_W + x) || rs.has(y * MAP_W + x)) continue;
      if (!isWalkableCode(sampleBaseTerrainCode(x, y))) continue;
      const n4 = [
        roadKeys.has((y - 1) * MAP_W + x),
        roadKeys.has((y + 1) * MAP_W + x),
        roadKeys.has(y * MAP_W + (x - 1)),
        roadKeys.has(y * MAP_W + (x + 1)),
      ];
      if (!n4.some(Boolean)) continue;
      if (layoutHash(settlementId, x * 10007 + y) < 0.22) out.push({ x, y });
    }
  }

  while (out.length > max) {
    const idx = Math.floor(layoutHash(settlementId, out.length) * out.length);
    out.splice(idx, 1);
  }
  if (out.length < max) {
    for (let y = minY; y <= maxY && out.length < max; y++) {
      for (let x = minX; x <= maxX && out.length < max; x++) {
        if (roadKeys.has(y * MAP_W + x) || rs.has(y * MAP_W + x)) continue;
        if (!isWalkableCode(sampleBaseTerrainCode(x, y))) continue;
        const n4 = [
          roadKeys.has((y - 1) * MAP_W + x),
          roadKeys.has((y + 1) * MAP_W + x),
          roadKeys.has(y * MAP_W + (x - 1)),
          roadKeys.has(y * MAP_W + (x + 1)),
        ];
        if (n4.some(Boolean)) out.push({ x, y });
      }
    }
  }
  return out.slice(0, max);
}
