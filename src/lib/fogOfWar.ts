import { CHUNK_SIZE, MAP_W, MAP_H, getContinentAt } from './mapGenerator';

export type RevealLevel = 0 | 1 | 2; // 0=unseen, 1=discovered, 2=bright

const NUM_CX = Math.ceil(MAP_W / CHUNK_SIZE);
const NUM_CY = Math.ceil(MAP_H / CHUNK_SIZE);

export interface FogMap {
  chunks: Uint8Array; // NUM_CX * NUM_CY, values 0/1/2
}

export function createFogMap(): FogMap {
  return { chunks: new Uint8Array(NUM_CX * NUM_CY) };
}

export function revealAroundPlayer(fog: FogMap, playerX: number, playerY: number, radius: number): FogMap {
  const pcx = Math.floor(playerX / CHUNK_SIZE);
  const pcy = Math.floor(playerY / CHUNK_SIZE);
  const chunkRadius = Math.ceil(radius / CHUNK_SIZE);

  const keys: number[] = [];
  const vals: RevealLevel[] = [];

  for (let dy = -chunkRadius; dy <= chunkRadius; dy++) {
    for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
      const cx = pcx + dx,
        cy = pcy + dy;
      if (cx < 0 || cx >= NUM_CX || cy < 0 || cy >= NUM_CY) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const key = cy * NUM_CX + cx;
      const cur = fog.chunks[key] as RevealLevel;
      let target = cur;

      if (dist <= chunkRadius * 0.5) {
        const worldX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
        const worldY = cy * CHUNK_SIZE + CHUNK_SIZE / 2;
        const continent = getContinentAt(worldX, worldY);
        if (continent === 'uloren') {
          target = Math.max(cur, 1) as RevealLevel;
        } else {
          target = 2;
        }
      } else if (dist <= chunkRadius) {
        target = Math.max(cur, 1) as RevealLevel;
      }

      if (target > cur) {
        keys.push(key);
        vals.push(target);
      }
    }
  }

  if (keys.length === 0) return fog;

  const nextChunks = new Uint8Array(fog.chunks);
  for (let i = 0; i < keys.length; i++) {
    nextChunks[keys[i]!] = vals[i]!;
  }
  return { chunks: nextChunks };
}

export function revealLocation(fog: FogMap, x: number, y: number): FogMap {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  const keys: number[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = cx + dx,
        ny = cy + dy;
      if (nx >= 0 && nx < NUM_CX && ny >= 0 && ny < NUM_CY) {
        const key = ny * NUM_CX + nx;
        if ((fog.chunks[key] as RevealLevel) < 2) keys.push(key);
      }
    }
  }
  if (keys.length === 0) return fog;
  const nextChunks = new Uint8Array(fog.chunks);
  for (const key of keys) nextChunks[key] = 2;
  return { chunks: nextChunks };
}

export function getRevealLevel(fog: FogMap, cx: number, cy: number): RevealLevel {
  if (cx < 0 || cx >= NUM_CX || cy < 0 || cy >= NUM_CY) return 0;
  return fog.chunks[cy * NUM_CX + cx] as RevealLevel;
}

export function isChunkRevealed(fog: FogMap, cx: number, cy: number): boolean {
  return getRevealLevel(fog, cx, cy) > 0;
}
