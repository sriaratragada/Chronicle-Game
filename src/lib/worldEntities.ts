import {
  CHUNK_SIZE,
  MAP_W,
  MAP_H,
  LOCATION_COORDS,
  getSettlementMeta,
  getTileAt,
  tileCodeToType,
  getWorldSeed,
  sampleBaseTerrainCode,
  isWalkableCode,
} from './mapGenerator';
import { getCoastalPortMarkers } from './coastalPorts';
import { getSettlementSidewalkPositions, getSettlementLayoutCenter } from './settlementLayout';
import { buildCaravanRuns } from './tradeRoutes';
import { getHamlets, type HamletArchetype } from './hamlets';
import { INITIAL_NPCS } from './gameData';

export type EntityKind =
  | 'boat' | 'cave_entrance' | 'resource_tree' | 'resource_rock' | 'resource_iron'
  | 'resource_herb' | 'resource_berry' | 'wolf' | 'bandit' | 'warband' | 'knight'
  | 'deer' | 'bear' | 'caravan' | 'army' | 'horse' | 'sheep' | 'rabbit'
  | 'settlement_npc' | 'hamlet_npc' | 'cooking_fire';

export interface WorldEntity {
  id: string;
  kind: EntityKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  data: Record<string, unknown>;
}

// Spatial hash: key = chunkKey (cy * numChunksX + cx)
const spatialHash = new Map<number, WorldEntity[]>();
const entityById = new Map<string, WorldEntity>();
let nextId = 1;

/** Per-kind lists so tick paths avoid scanning all entities (O(N) → O(k)). */
const entitiesByKind = new Map<EntityKind, WorldEntity[]>();
/** settlement_npc + hamlet_npc only, for schedule ticks without full scans. */
const scheduleNpcBucket: WorldEntity[] = [];

function bucketForKind(kind: EntityKind): WorldEntity[] {
  let b = entitiesByKind.get(kind);
  if (!b) {
    b = [];
    entitiesByKind.set(kind, b);
  }
  return b;
}

function removeFromKindBucket(entity: WorldEntity) {
  const b = entitiesByKind.get(entity.kind);
  if (!b) return;
  const i = b.indexOf(entity);
  if (i !== -1) b.splice(i, 1);
}

function registerEntityIndexes(entity: WorldEntity) {
  bucketForKind(entity.kind).push(entity);
  if (entity.kind === 'settlement_npc' || entity.kind === 'hamlet_npc') {
    scheduleNpcBucket.push(entity);
  }
}

function unregisterEntityIndexes(entity: WorldEntity) {
  removeFromKindBucket(entity);
  if (entity.kind === 'settlement_npc' || entity.kind === 'hamlet_npc') {
    const i = scheduleNpcBucket.indexOf(entity);
    if (i !== -1) scheduleNpcBucket.splice(i, 1);
  }
}

function chunkKey(x: number, y: number): number {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  return cy * Math.ceil(MAP_W / CHUNK_SIZE) + cx;
}

export function spawnEntity(kind: EntityKind, x: number, y: number, data: Record<string, unknown> = {}, hp = 100): WorldEntity {
  const id = `e_${nextId++}`;
  const entity: WorldEntity = { id, kind, x, y, hp, maxHp: hp, data };
  entityById.set(id, entity);
  const key = chunkKey(x, y);
  if (!spatialHash.has(key)) spatialHash.set(key, []);
  spatialHash.get(key)!.push(entity);
  registerEntityIndexes(entity);
  return entity;
}

export function removeEntity(id: string) {
  const entity = entityById.get(id);
  if (!entity) return;
  unregisterEntityIndexes(entity);
  entityById.delete(id);
  const key = chunkKey(entity.x, entity.y);
  const arr = spatialHash.get(key);
  if (arr) {
    const idx = arr.indexOf(entity);
    if (idx !== -1) arr.splice(idx, 1);
  }
}

export function moveEntity(id: string, nx: number, ny: number) {
  const entity = entityById.get(id);
  if (!entity) return;
  const oldKey = chunkKey(entity.x, entity.y);
  const newKey = chunkKey(nx, ny);
  if (oldKey !== newKey) {
    const arr = spatialHash.get(oldKey);
    if (arr) { const idx = arr.indexOf(entity); if (idx !== -1) arr.splice(idx, 1); }
    if (!spatialHash.has(newKey)) spatialHash.set(newKey, []);
    spatialHash.get(newKey)!.push(entity);
  }
  entity.x = nx;
  entity.y = ny;
}

export function getEntitiesInChunk(cx: number, cy: number): WorldEntity[] {
  const key = cy * Math.ceil(MAP_W / CHUNK_SIZE) + cx;
  return spatialHash.get(key) ?? [];
}

export function getEntitiesNear(x: number, y: number, radius: number): WorldEntity[] {
  const results: WorldEntity[] = [];
  const minCx = Math.max(0, Math.floor((x - radius) / CHUNK_SIZE));
  const maxCx = Math.min(Math.ceil(MAP_W / CHUNK_SIZE) - 1, Math.floor((x + radius) / CHUNK_SIZE));
  const minCy = Math.max(0, Math.floor((y - radius) / CHUNK_SIZE));
  const maxCy = Math.min(Math.ceil(MAP_H / CHUNK_SIZE) - 1, Math.floor((y + radius) / CHUNK_SIZE));
  const r2 = radius * radius;
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (const e of getEntitiesInChunk(cx, cy)) {
        if ((e.x - x) ** 2 + (e.y - y) ** 2 <= r2) results.push(e);
      }
    }
  }
  return results;
}

export function getEntityById(id: string): WorldEntity | undefined {
  return entityById.get(id);
}

export function clearAllEntities() {
  spatialHash.clear();
  entityById.clear();
  entitiesByKind.clear();
  scheduleNpcBucket.length = 0;
  nextId = 1;
}

const WILD_ANIMAL_KINDS: EntityKind[] = ['deer', 'sheep', 'rabbit', 'wolf', 'bear', 'bandit'];

/** Open grazing ground — herbivores cluster and respawn more often here. */
function isPlainTileType(tn: string): boolean {
  return tn === 'grass' || tn === 'clearing' || tn === 'farm_field';
}

export function countWildlifeEntities(): number {
  let n = 0;
  entityById.forEach(e => {
    if (WILD_ANIMAL_KINDS.includes(e.kind)) n++;
  });
  return n;
}

// Spawn initial world entities (boats at docks, cave entrances)
export function initWorldEntities() {
  clearAllEntities();

  // Boats at ports (named + Vell Harbor capital harbour)
  for (const [locId, coord] of Object.entries(LOCATION_COORDS)) {
    const meta = getSettlementMeta(locId);
    if (meta?.type === 'port' || locId === 'vell_harbor') {
      spawnEntity('boat', coord.x - 15, coord.y + 10, { docked: true, location: locId });
      spawnEntity('boat', coord.x - 10, coord.y + 12, { docked: true, location: locId });
    }
  }

  for (const m of getCoastalPortMarkers()) {
    spawnEntity('boat', m.x + 2, m.y + 1, { docked: true, location: 'coast', coast: m.continent });
  }

  // Horses at stables near major settlements
  for (const locId of ['highmarch', 'graygate', 'korrath_citadel', 'sarnak_hold', 'brightwater', 'vell_harbor']) {
    const coord = LOCATION_COORDS[locId];
    if (coord) {
      spawnEntity('horse', coord.x + 15, coord.y + 5, { stable: locId });
      spawnEntity('horse', coord.x + 18, coord.y + 7, { stable: locId });
    }
  }

  const hash = (a: number, b: number) => {
    let h = (a * 374761393 + b * 668265263 + 42) & 0xffffffff;
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff;
    return (h & 0x7fffffff) / 0x7fffffff;
  };

  // Cave entrances (random)
  for (let i = 0; i < 28; i++) {
    const x = Math.floor(hash(i * 137, 9999) * MAP_W);
    const y = Math.floor(hash(i * 251, 8888) * MAP_H);
    if (hash(x, y) < 0.5) {
      spawnEntity('cave_entrance', x, y, { explored: false, biome: 'mountain' });
    }
  }

  // Resource nodes scattered across the world
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(hash(i * 173, 3333) * MAP_W);
    const y = Math.floor(hash(i * 197, 4444) * MAP_H);
    const roll = hash(x, y + 1000);
    const kind: EntityKind = roll < 0.3 ? 'resource_tree' : roll < 0.5 ? 'resource_rock' : roll < 0.65 ? 'resource_herb' : roll < 0.8 ? 'resource_berry' : 'resource_iron';
    spawnEntity(kind, x, y, {}, 1);
  }

  // Dynamic animals (base quota + plains herds, biome-aware; AmbientEntity wildlife removed from mapGenerator)
  type SpawnSpec = { kind: EntityKind; hp: number; pred: (t: string) => boolean };
  const specs: SpawnSpec[] = [
    { kind: 'deer', hp: 20, pred: t => ['forest', 'dense_forest', 'clearing', 'grass'].includes(t) },
    { kind: 'sheep', hp: 15, pred: t => ['grass', 'farm_field', 'clearing'].includes(t) },
    { kind: 'rabbit', hp: 8, pred: t => ['grass', 'clearing', 'farm_field', 'hill'].includes(t) },
    { kind: 'wolf', hp: 40, pred: t => ['dense_forest', 'hill', 'forest'].includes(t) },
    { kind: 'bear', hp: 60, pred: t => ['forest', 'hill', 'dense_forest'].includes(t) },
    { kind: 'bandit', hp: 50, pred: t => ['road', 'hill', 'grass', 'ruins'].includes(t) },
  ];
  const quota = [11, 10, 7, 8, 4, 5]; // grazers bumped on plains-friendly tiles; sum 45
  for (let si = 0; si < specs.length; si++) {
    const { kind, hp, pred } = specs[si]!;
    for (let j = 0; j < quota[si]!; j++) {
      const i = si * 1000 + j;
      let placed = false;
      for (let a = 0; a < 80 && !placed; a++) {
        const x = Math.floor(hash(i * 173 + a * 17, 3333 + a) * MAP_W);
        const y = Math.floor(hash(i * 197 + a * 19, 4444 + a) * MAP_H);
        const tn = tileCodeToType(getTileAt(x, y));
        if (tn === 'deep_water' || tn === 'water' || tn === 'mountain' || tn === 'snow') continue;
        if (!pred(tn)) continue;
        spawnEntity(kind, x, y, { behavior: kind === 'bandit' ? 'ambush' : 'grazing' }, hp);
        placed = true;
      }
      if (!placed) {
        for (let a = 0; a < 50 && !placed; a++) {
          const x = Math.floor(hash(i * 131 + a, 1212) * MAP_W);
          const y = Math.floor(hash(i * 149 + a, 2323) * MAP_H);
          const tn = tileCodeToType(getTileAt(x, y));
          if (['grass', 'clearing', 'forest', 'hill'].includes(tn)) {
            spawnEntity(kind, x, y, { behavior: 'grazing' }, hp);
            placed = true;
          }
        }
      }
    }
  }

  // Plains herds — extra sheep/rabbit/deer grouped on grass, clearing, and farm strips
  for (let herd = 0; herd < 8; herd++) {
    let cx = 0;
    let cy = 0;
    let found = false;
    for (let a = 0; a < 120 && !found; a++) {
      cx = Math.floor(hash(herd * 997 + a, 6001) * MAP_W);
      cy = Math.floor(hash(herd * 769 + a, 6002) * MAP_H);
      const tn = tileCodeToType(getTileAt(cx, cy));
      if (!isPlainTileType(tn)) continue;
      if (tn === 'deep_water' || tn === 'water') continue;
      found = true;
    }
    if (!found) continue;

    const pattern = hash(herd, 7001);
    const members: { kind: EntityKind; hp: number }[] =
      pattern < 0.48
        ? [
            { kind: 'sheep', hp: 15 },
            { kind: 'sheep', hp: 15 },
            { kind: 'sheep', hp: 15 },
            { kind: 'sheep', hp: 15 },
          ]
        : pattern < 0.78
          ? [
              { kind: 'rabbit', hp: 8 },
              { kind: 'rabbit', hp: 8 },
              { kind: 'rabbit', hp: 8 },
              { kind: 'rabbit', hp: 8 },
            ]
          : [
              { kind: 'deer', hp: 20 },
              { kind: 'deer', hp: 20 },
              { kind: 'sheep', hp: 15 },
              { kind: 'rabbit', hp: 8 },
            ];

    for (let mi = 0; mi < members.length; mi++) {
      const { kind, hp } = members[mi]!;
      let placed = false;
      for (let attempt = 0; attempt < 48 && !placed; attempt++) {
        const ang = hash(herd * 31 + mi, attempt + 404) * Math.PI * 2;
        const rad = 2 + hash(herd * 37 + mi, attempt + 505) * 12;
        const px = Math.round(cx + Math.cos(ang) * rad);
        const py = Math.round(cy + Math.sin(ang) * rad);
        if (px < 0 || px >= MAP_W || py < 0 || py >= MAP_H) continue;
        const tn = tileCodeToType(getTileAt(px, py));
        if (tn === 'deep_water' || tn === 'water' || tn === 'mountain' || tn === 'snow') continue;
        if (!isPlainTileType(tn) && hash(herd + mi, attempt + 909) > 0.42) continue;
        spawnEntity(kind, px, py, { behavior: 'grazing', herd: herd }, hp);
        placed = true;
      }
    }
  }

  // Guaranteed cave entrances near mountain settlements
  const caveAnchors = ['ironhold', 'coldpeak', 'korrath_citadel', 'frostmarch', 'deepmine', 'hollowpeak'] as const;
  for (const lid of caveAnchors) {
    const c = LOCATION_COORDS[lid];
    if (!c) continue;
    const ang = hash(lid.length + 3, 42) * Math.PI * 2;
    const dist = 16 + hash(42, lid.length + 1) * 14;
    const x = Math.round(c.x + Math.cos(ang) * dist);
    const y = Math.round(c.y + Math.sin(ang) * dist);
    spawnEntity('cave_entrance', x, y, { explored: false, biome: 'mountain', guaranteed: true }, 1);
  }

  // Starter resources near Ashenford
  const home = LOCATION_COORDS.ashenford;
  if (home) {
    for (let i = 0; i < 5; i++) {
      const ang = hash(i + 11, 1) * Math.PI * 2;
      const d = 10 + hash(i + 22, 2) * 36;
      spawnEntity('resource_tree', Math.round(home.x + Math.cos(ang) * d), Math.round(home.y + Math.sin(ang) * d), { starter: true }, 1);
    }
    for (let i = 0; i < 3; i++) {
      const ang = hash(i + 33, 3) * Math.PI * 2;
      const d = 14 + hash(i + 44, 4) * 30;
      spawnEntity('resource_rock', Math.round(home.x + Math.cos(ang) * d), Math.round(home.y + Math.sin(ang) * d), { starter: true }, 1);
    }
  }

  const jobFromTitle = (title: string): string => {
    const t = title.toLowerCase();
    if (t.includes('guild') || t.includes('broker')) return 'merchant';
    if (t.includes('captain') || t.includes('watch') || t.includes('sergeant') || t.includes('commander')) return 'guard';
    if (t.includes('innkeeper') || t.includes('inn')) return 'innkeeper';
    if (t.includes('archivist') || t.includes('astronomer')) return 'merchant';
    return 'farmer';
  };

  for (const npc of INITIAL_NPCS) {
    const coord = LOCATION_COORDS[npc.location];
    if (!coord) continue;
    const slots = getSettlementSidewalkPositions(npc.location, 48);
    const pick =
      slots.length > 0
        ? slots[Math.floor(hash(npc.id.charCodeAt(0), 501) * slots.length)]!
        : { x: coord.x + Math.round((hash(npc.id.charCodeAt(0), 501) - 0.5) * 26), y: coord.y + Math.round((hash(npc.id.charCodeAt(1), 502) - 0.5) * 26) };
    spawnEntity('settlement_npc', pick.x, pick.y, {
      npcId: npc.id,
      name: npc.name,
      job: jobFromTitle(npc.title),
      locationId: npc.location,
      homeX: pick.x,
      homeY: pick.y,
    }, 100);
  }

  const hamletJob = (arch: HamletArchetype): string => {
    const m: Record<string, string> = {
      shepherd_camp: 'shepherd', river_hut: 'fisher', logging_stead: 'woodcutter', shrine_waypost: 'caretaker',
      toll_cabin: 'warden', apiary: 'beekeeper', charcoal_burner: 'burner', wayfarer_camp: 'guide',
      shearing_shed: 'shearer', orchard_house: 'grower', ferry_house: 'ferryman', salt_boiler: 'boiler',
    };
    return m[arch] ?? 'commoner';
  };

  const forenames = ['Corin', 'Mara', 'Jory', 'Sera', 'Tomas', 'Elka', 'Hen', 'Mira', 'Daveth', 'Ysolde'];
  const caravanRuns = buildCaravanRuns(getWorldSeed(), 10);
  for (const run of caravanRuns) {
    const start = run.waypoints[0];
    if (!start) continue;
    spawnEntity(
      'caravan',
      start.x,
      start.y,
      {
        waypoints: run.waypoints,
        legIndex: 1,
        dir: 1,
        origin: run.origin,
        dest: run.dest,
        cargo: run.cargo,
      },
      75,
    );
  }

  for (const h of getHamlets()) {
    const count = hash(h.x + 9, h.y + 8) > 0.38 ? 2 : 1;
    for (let slot = 0; slot < count; slot++) {
      const name = forenames[Math.floor(hash(h.x + slot * 17, h.y + slot * 19) * forenames.length)]!;
      const hx = h.x + 1 + slot * 2;
      const hy = h.y + slot;
      spawnEntity('hamlet_npc', hx, hy, {
        hamletId: h.id,
        hamletName: h.displayName,
        archetype: h.archetype,
        minorKey: `${h.id}_${slot}`,
        name,
        job: hamletJob(h.archetype),
        slot,
        homeX: hx,
        homeY: hy,
        hamletX: h.x,
        hamletY: h.y,
      }, 100);
    }
  }
}

const NPC_SCHEDULE_BUDGET = 36;
let npcScheduleCursor = 0;

function tickOneSettlementOrHamletNpc(
  e: WorldEntity,
  dayPhase: import('./gameTypes').DayNightPhase,
  worldTime: number,
  h: (a: number, b: number) => number,
): void {
  const homeX = (e.data.homeX as number) ?? e.x;
  const homeY = (e.data.homeY as number) ?? e.y;
  const locId = e.data.locationId as string | undefined;
  const hamletId = e.data.hamletId as string | undefined;
  let tx = homeX;
  let ty = homeY;
  if (e.kind === 'settlement_npc' && locId) {
    const hub = getSettlementLayoutCenter(locId);
    if (dayPhase === 'day' || dayPhase === 'dawn') {
      const job = String(e.data.job ?? '');
      const spread = job === 'merchant' || job === 'guard' ? 14 : 10;
      tx = hub.x + Math.round((h(worldTime, e.x) - 0.5) * spread * 2);
      ty = hub.y + Math.round((h(worldTime, e.y + 3) - 0.5) * spread * 2);
    } else {
      tx = homeX + Math.round((h(e.x, worldTime) - 0.5) * 3);
      ty = homeY + Math.round((h(e.y, worldTime + 1) - 0.5) * 3);
    }
  } else if (e.kind === 'hamlet_npc' && hamletId) {
    const hx = (e.data.hamletX as number) ?? homeX;
    const hy = (e.data.hamletY as number) ?? homeY;
    if (dayPhase === 'day' || dayPhase === 'dawn') {
      tx = hx + 3 + Math.round((h(worldTime, e.x) - 0.5) * 4);
      ty = hy + Math.round((h(worldTime, e.y) - 0.5) * 4);
    } else {
      tx = homeX;
      ty = homeY;
    }
  }
  if (Math.abs(tx - e.x) + Math.abs(ty - e.y) > 48) return;
  const dx = Math.sign(tx - e.x);
  const dy = Math.sign(ty - e.y);
  if (dx === 0 && dy === 0) return;
  const nx = e.x + dx;
  const ny = e.y + dy;
  const tn = tileCodeToType(getTileAt(nx, ny));
  if (tn === 'deep_water' || tn === 'water' || tn === 'mountain') return;
  moveEntity(e.id, nx, ny);
}

/** Settlement / hamlet NPCs: round-robin a fixed budget per tick to avoid getTileAt storms. */
export function tickWorldNpcSchedules(dayPhase: import('./gameTypes').DayNightPhase, worldTime: number): void {
  const h = (a: number, b: number) => {
    let x = (a * 374761393 + b * 668265263 + worldTime) & 0xffffffff;
    x = ((x ^ (x >> 13)) * 1274126177) & 0xffffffff;
    return (x & 0x7fffffff) / 0x7fffffff;
  };
  const n = scheduleNpcBucket.length;
  if (n === 0) return;
  const budget = Math.min(NPC_SCHEDULE_BUDGET, n);
  const start = npcScheduleCursor % n;
  for (let i = 0; i < budget; i++) {
    tickOneSettlementOrHamletNpc(scheduleNpcBucket[(start + i) % n]!, dayPhase, worldTime, h);
  }
  npcScheduleCursor = (start + budget) % n;
}

export function tickCaravanMovement(): void {
  const caravans = entitiesByKind.get('caravan');
  if (!caravans?.length) return;
  for (let ci = 0; ci < caravans.length; ci++) {
    const e = caravans[ci]!;
    const wp = e.data.waypoints as { x: number; y: number }[] | undefined;
    if (!wp || wp.length < 2) continue;
    let li = (e.data.legIndex as number) ?? 1;
    let dir = (e.data.dir as number) ?? 1;
    if (li < 0) {
      li = 1;
      dir = 1;
    }
    if (li >= wp.length) {
      li = wp.length - 2;
      dir = -1;
    }
    const target = wp[li];
    if (!target) continue;
    if (e.x === target.x && e.y === target.y) {
      li += dir;
      if (li >= wp.length) {
        dir = -1;
        li = Math.max(0, wp.length - 2);
        e.data.lastArrival = e.data.dest;
        e.data.pendingDelivery = { locationId: String(e.data.dest ?? ''), cargo: String(e.data.cargo ?? 'cloth') };
      } else if (li < 0) {
        dir = 1;
        li = Math.min(1, wp.length - 1);
        e.data.lastArrival = e.data.origin;
        e.data.pendingDelivery = { locationId: String(e.data.origin ?? ''), cargo: String(e.data.cargo ?? 'cloth') };
      }
      e.data.legIndex = li;
      e.data.dir = dir;
      continue;
    }
    const dx = Math.sign(target.x - e.x);
    const dy = Math.sign(target.y - e.y);
    moveEntity(e.id, e.x + dx, e.y + dy);
  }
}

export function getEntitiesByKind(kind: EntityKind): WorldEntity[] {
  const b = entitiesByKind.get(kind);
  return b ? [...b] : [];
}

const RESPAWN_RING_MIN = 96;
const RESPAWN_RING_MAX = 240;
const RESPAWN_ATTEMPTS = 28;

export function respawnWildlifeFarFrom(px: number, py: number, worldTime: number) {
  if (countWildlifeEntities() >= 48) return;
  const hash = (a: number, b: number) => {
    let h = (a * 374761393 + b * 668265263 + worldTime) & 0xffffffff;
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff;
    return (h & 0x7fffffff) / 0x7fffffff;
  };
  const rollKind = (r: number): EntityKind => {
    if (r < 0.30) return 'deer';
    if (r < 0.52) return 'sheep';
    if (r < 0.62) return 'rabbit';
    if (r < 0.80) return 'wolf';
    if (r < 0.93) return 'bear';
    return 'bandit';
  };
  const toSpawn = 1 + (hash(worldTime, 77) > 0.55 ? 1 : 0);
  for (let s = 0; s < toSpawn; s++) {
    const kind = rollKind(hash(worldTime + s * 13, py + 404));
    const herbivore = kind === 'deer' || kind === 'sheep' || kind === 'rabbit';
    const maxAttempts = RESPAWN_ATTEMPTS * (herbivore ? 2 : 1);
    for (let a = 0; a < maxAttempts; a++) {
      const ang = hash(worldTime + s * 31, a * 59 + 1000) * Math.PI * 2;
      const rad = RESPAWN_RING_MIN + hash(worldTime + s * 47, a * 61 + 2000) * (RESPAWN_RING_MAX - RESPAWN_RING_MIN);
      const x = Math.floor(px + Math.cos(ang) * rad);
      const y = Math.floor(py + Math.sin(ang) * rad);
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
      if (!isWalkableCode(sampleBaseTerrainCode(x, y))) continue;
      const tn = tileCodeToType(getTileAt(x, y));
      if (tn === 'deep_water' || tn === 'water' || tn === 'mountain') continue;
      if (herbivore && !isPlainTileType(tn) && a < maxAttempts - 6 && hash(x + a, y + worldTime) < 0.52) continue;
      const hp = kind === 'deer' ? 20 : kind === 'sheep' ? 15 : kind === 'rabbit' ? 8 : kind === 'wolf' ? 40 : kind === 'bear' ? 60 : 50;
      spawnEntity(kind, x, y, { behavior: 'grazing' }, hp);
      break;
    }
  }
}

export function serializeEntities(): string {
  const all: WorldEntity[] = [];
  entityById.forEach(e => all.push(e));
  return JSON.stringify(all);
}

export function deserializeEntities(json: string) {
  clearAllEntities();
  const all: WorldEntity[] = JSON.parse(json);
  for (const e of all) {
    const entity: WorldEntity = { ...e };
    entityById.set(entity.id, entity);
    const key = chunkKey(entity.x, entity.y);
    if (!spatialHash.has(key)) spatialHash.set(key, []);
    spatialHash.get(key)!.push(entity);
    registerEntityIndexes(entity);
    const num = parseInt(entity.id.split('_')[1]);
    if (num >= nextId) nextId = num + 1;
  }
}
