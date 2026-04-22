import type { ContinentId } from './mapGenerator';

export const DUNGEON_W = 200;
export const DUNGEON_H = 100;

/** Minimum air cells in the kept cave (fraction of map) before regenerating. */
const MIN_AIR_FRAC = 0.012;
const GEN_MAX_ATTEMPTS = 14;

export type DungeonTile = 'air' | 'stone' | 'ore_iron' | 'ore_gold' | 'crystal' | 'exit' | 'entrance';

/** Deterministic 0..1 noise for rendering (tile shading). */
export function dungeonTileHash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed) & 0xffffffff;
  h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff;
  return (h & 0x7fffffff) / 0x7fffffff;
}

export interface DungeonEnemy {
  id: string;
  kind: 'slime' | 'goblin' | 'bat';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  vx: number;
  vy: number;
}

export interface DungeonData {
  tiles: Uint8Array; // DUNGEON_W * DUNGEON_H
  enemies: DungeonEnemy[];
  entranceX: number;
  entranceY: number;
  exitX: number;
  exitY: number;
  /** Seed used for rendering variation (hash with tile coords). */
  renderSeed: number;
}

const DT = {
  AIR: 0,
  STONE: 1,
  ORE_IRON: 2,
  ORE_GOLD: 3,
  CRYSTAL: 4,
  EXIT: 5,
  ENTRANCE: 6,
} as const;

export const DUNGEON_TILE_NAMES: DungeonTile[] = ['air', 'stone', 'ore_iron', 'ore_gold', 'crystal', 'exit', 'entrance'];

/** Inventory item id when mining destroys this tile type (plain stone yields nothing). */
export function miningDropForTileByte(b: number): string | null {
  if (b === DT.ORE_IRON) return 'iron_ore';
  if (b === DT.ORE_GOLD) return 'gold_ore';
  if (b === DT.CRYSTAL) return 'crystal';
  return null;
}

function pickOreType(continent: ContinentId, i: number, seed: number): number {
  const h = dungeonTileHash(i * 17, seed + 3);
  switch (continent) {
    case 'trivalen':
      return h < 0.72 ? DT.ORE_IRON : h < 0.92 ? DT.ORE_GOLD : DT.CRYSTAL;
    case 'uloren':
      return h < 0.28 ? DT.ORE_IRON : h < 0.48 ? DT.ORE_GOLD : DT.CRYSTAL;
    case 'auredia':
    default:
      return h < 0.5 ? DT.ORE_IRON : h < 0.82 ? DT.ORE_GOLD : DT.CRYSTAL;
  }
}

function cellularAutomataPass(tiles: Uint8Array, seed: number): void {
  const temp = new Uint8Array(DUNGEON_W * DUNGEON_H);
  for (let y = 0; y < DUNGEON_H; y++) {
    for (let x = 0; x < DUNGEON_W; x++) {
      if (x === 0 || x === DUNGEON_W - 1 || y === 0 || y === DUNGEON_H - 1) continue;
      if (dungeonTileHash(x, y, seed) < 0.45) tiles[y * DUNGEON_W + x] = DT.AIR;
    }
  }
  for (let iter = 0; iter < 4; iter++) {
    temp.set(tiles);
    for (let y = 1; y < DUNGEON_H - 1; y++) {
      for (let x = 1; x < DUNGEON_W - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (temp[(y + dy) * DUNGEON_W + (x + dx)] !== DT.AIR) walls++;
          }
        }
        tiles[y * DUNGEON_W + x] = walls >= 5 ? DT.STONE : DT.AIR;
      }
    }
  }
}

/** Keep only the largest 4-connected air region; return its size or 0. */
function keepLargestAirRegion(tiles: Uint8Array): number {
  const W = DUNGEON_W;
  const H = DUNGEON_H;
  const comp = new Int32Array(W * H);
  comp.fill(-1);
  const sizes: number[] = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (tiles[i] !== DT.AIR || comp[i] >= 0) continue;
      const cid = sizes.length;
      const q: number[] = [i];
      comp[i] = cid;
      let sz = 0;
      while (q.length) {
        const c = q.pop()!;
        sz++;
        const cx = c % W;
        const cy = (c / W) | 0;
        if (cx > 0) {
          const j = c - 1;
          if (tiles[j] === DT.AIR && comp[j] < 0) {
            comp[j] = cid;
            q.push(j);
          }
        }
        if (cx < W - 1) {
          const j = c + 1;
          if (tiles[j] === DT.AIR && comp[j] < 0) {
            comp[j] = cid;
            q.push(j);
          }
        }
        if (cy > 0) {
          const j = c - W;
          if (tiles[j] === DT.AIR && comp[j] < 0) {
            comp[j] = cid;
            q.push(j);
          }
        }
        if (cy < H - 1) {
          const j = c + W;
          if (tiles[j] === DT.AIR && comp[j] < 0) {
            comp[j] = cid;
            q.push(j);
          }
        }
      }
      sizes.push(sz);
    }
  }

  if (sizes.length === 0) return 0;

  let bestCid = 0;
  for (let c = 1; c < sizes.length; c++) {
    if (sizes[c] > sizes[bestCid]) bestCid = c;
  }

  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === DT.AIR && comp[i] !== bestCid) tiles[i] = DT.STONE;
  }

  return sizes[bestCid];
}

function placeOreVeins(tiles: Uint8Array, continent: ContinentId, seed: number): void {
  for (let i = 0; i < 30; i++) {
    const ox = Math.floor(dungeonTileHash(i * 137, seed + 1) * DUNGEON_W);
    const oy = Math.floor(dungeonTileHash(i * 251, seed + 2) * DUNGEON_H);
    if (tiles[oy * DUNGEON_W + ox] !== DT.STONE) continue;
    const oreType = pickOreType(continent, i, seed);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = ox + dx;
        const ny = oy + dy;
        if (nx > 0 && nx < DUNGEON_W - 1 && ny > 0 && ny < DUNGEON_H - 1) {
          if (tiles[ny * DUNGEON_W + nx] === DT.STONE && dungeonTileHash(nx + dy, ny + dx + seed) < 0.5) {
            tiles[ny * DUNGEON_W + nx] = oreType;
          }
        }
      }
    }
  }
}

function pickEntranceExit(tiles: Uint8Array): { entranceX: number; entranceY: number; exitX: number; exitY: number } {
  const W = DUNGEON_W;
  const H = DUNGEON_H;
  let entranceX = Math.floor(W / 2);
  let entranceY = Math.floor(H / 2);
  let exitX = entranceX;
  let exitY = entranceY;
  let foundEnt = false;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] !== DT.AIR) continue;
      if (!foundEnt || y < entranceY || (y === entranceY && x < entranceX)) {
        entranceX = x;
        entranceY = y;
        foundEnt = true;
      }
    }
  }

  let bestDist = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] !== DT.AIR) continue;
      const d = Math.abs(x - entranceX) + Math.abs(y - entranceY);
      if (d > bestDist) {
        bestDist = d;
        exitX = x;
        exitY = y;
      }
    }
  }

  return { entranceX, entranceY, exitX, exitY };
}

function generateDungeonOnce(caveId: number, continent: ContinentId, attempt: number): DungeonData | null {
  const seed = caveId * 12345 + continent.charCodeAt(0) * 67890 + attempt * 9973;
  const tiles = new Uint8Array(DUNGEON_W * DUNGEON_H);
  tiles.fill(DT.STONE);

  cellularAutomataPass(tiles, seed);

  const airCount = keepLargestAirRegion(tiles);
  const minAir = Math.floor(DUNGEON_W * DUNGEON_H * MIN_AIR_FRAC);
  if (airCount < minAir) return null;

  placeOreVeins(tiles, continent, seed);

  let { entranceX, entranceY, exitX, exitY } = pickEntranceExit(tiles);

  for (let dx = -2; dx <= 2; dx++) {
    tiles[entranceY * DUNGEON_W + entranceX + dx] = DT.AIR;
    tiles[(entranceY + 1) * DUNGEON_W + entranceX + dx] = DT.STONE;
  }
  tiles[entranceY * DUNGEON_W + entranceX] = DT.ENTRANCE;

  for (let dx = -2; dx <= 2; dx++) {
    tiles[exitY * DUNGEON_W + exitX + dx] = DT.AIR;
    tiles[(exitY + 1) * DUNGEON_W + exitX + dx] = DT.STONE;
  }
  tiles[exitY * DUNGEON_W + exitX] = DT.EXIT;

  const enemies: DungeonEnemy[] = [];
  let enemyId = 0;
  for (let i = 0; i < 15; i++) {
    const ex = Math.floor(dungeonTileHash(i * 97 + 111, seed + 5) * DUNGEON_W);
    const ey = Math.floor(dungeonTileHash(i * 113 + 222, seed + 6) * DUNGEON_H);
    if (tiles[ey * DUNGEON_W + ex] !== DT.AIR) continue;
    const kindRoll = dungeonTileHash(i, seed + 7);
    const kind: DungeonEnemy['kind'] = kindRoll < 0.4 ? 'slime' : kindRoll < 0.75 ? 'goblin' : 'bat';
    const hp = kind === 'slime' ? 20 : kind === 'goblin' ? 35 : 15;
    enemies.push({ id: `de_${enemyId++}`, kind, x: ex, y: ey, hp, maxHp: hp, vx: 0, vy: 0 });
  }

  let bx = exitX - 3;
  let by = exitY;
  for (let t = 0; t < 12 && tiles[by * DUNGEON_W + bx] !== DT.AIR; t++) {
    bx -= 1;
  }
  if (bx > 2 && tiles[by * DUNGEON_W + bx] === DT.AIR) {
    enemies.push({
      id: `de_${enemyId++}`,
      kind: 'goblin',
      x: bx,
      y: by,
      hp: 120,
      maxHp: 120,
      vx: 0,
      vy: 0,
    });
  }

  return { tiles, enemies, entranceX, entranceY, exitX, exitY, renderSeed: seed };
}

function generateFallbackLineCave(caveId: number, continent: ContinentId): DungeonData {
  const seed = caveId * 12345 + continent.charCodeAt(0) * 67890 + 55555;
  const tiles = new Uint8Array(DUNGEON_W * DUNGEON_H);
  tiles.fill(DT.STONE);
  const midY = Math.floor(DUNGEON_H / 2);
  for (let x = 3; x < DUNGEON_W - 3; x++) {
    for (let dy = -3; dy <= 3; dy++) {
      const ny = midY + dy;
      if (ny > 0 && ny < DUNGEON_H - 1) tiles[ny * DUNGEON_W + x] = DT.AIR;
    }
  }
  placeOreVeins(tiles, continent, seed);
  const entranceX = 8;
  const entranceY = midY - 2;
  const exitX = DUNGEON_W - 9;
  const exitY = midY - 2;
  for (let dx = -2; dx <= 2; dx++) {
    tiles[entranceY * DUNGEON_W + entranceX + dx] = DT.AIR;
    tiles[(entranceY + 1) * DUNGEON_W + entranceX + dx] = DT.STONE;
  }
  tiles[entranceY * DUNGEON_W + entranceX] = DT.ENTRANCE;
  for (let dx = -2; dx <= 2; dx++) {
    tiles[exitY * DUNGEON_W + exitX + dx] = DT.AIR;
    tiles[(exitY + 1) * DUNGEON_W + exitX + dx] = DT.STONE;
  }
  tiles[exitY * DUNGEON_W + exitX] = DT.EXIT;
  return {
    tiles,
    enemies: [],
    entranceX,
    entranceY,
    exitX,
    exitY,
    renderSeed: seed,
  };
}

export function generateDungeon(caveId: number, continent: ContinentId): DungeonData {
  for (let a = 0; a < GEN_MAX_ATTEMPTS; a++) {
    const d = generateDungeonOnce(caveId, continent, a);
    if (d) return d;
  }
  return generateFallbackLineCave(caveId, continent);
}
