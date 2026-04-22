import { useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { useGameStore } from '@/lib/gameStore';
import {
  MAP_W, MAP_H, CHUNK_SIZE, NUM_CHUNKS_X, NUM_CHUNKS_Y,
  LOCATION_COORDS, PARSED_PALETTES,
  getChunkData, ChunkData,
  WorldObject, AmbientEntity,
  WorldObjectType, AmbientEntityType,
} from '@/lib/mapGenerator';
import { getEntitiesInChunk, WorldEntity } from '@/lib/worldEntities';
import { LOCATIONS } from '@/lib/gameData';
import { Season } from '@/lib/gameTypes';

// ── Location icons ─────────────────────────────────────────────────────────
const LOC_ICONS: Record<string, string> = {};
for (const loc of LOCATIONS) LOC_ICONS[loc.id] = loc.icon;

// ── Object colours ─────────────────────────────────────────────────────────
const OBJ_COLORS: Record<WorldObjectType, [number, number, number]> = {
  farm: [160, 120, 60], barn: [140, 80, 40], windmill: [200, 180, 140],
  watchtower: [90, 90, 90], dock: [100, 70, 40], bridge: [160, 140, 90],
  campfire: [220, 120, 30], market_stall: [180, 140, 60], ruins_pillar: [130, 120, 100],
  stone_wall: [110, 110, 105], stone_circle: [140, 135, 120], hut: [150, 110, 70],
  well: [100, 90, 80], shrine: [210, 190, 130], gate: [80, 75, 65], fence: [170, 140, 90],
  poi_lakeshore: [70, 120, 160],
  poi_chapel: [180, 170, 200],
  poi_knight_camp: [140, 90, 90],
  poi_wrecked_cart: [120, 70, 50],
  poi_standing_stone: [110, 110, 130],
  poi_monster_lair: [90, 40, 90],
  poi_road_inn: [160, 120, 70],
};

const ENTITY_COLORS: Record<AmbientEntityType, string> = {
  deer: '#a07850', sheep: '#e8e4d8', wolf: '#606060', eagle: '#705030',
  rabbit: '#d0c8b0', fish: '#5090c0', crow: '#303038', villager: '#c8a870',
  fisherman: '#7090a0', guard: '#808878', merchant: '#c0904a', traveler: '#a09070',
};

// ── Chunk canvas baking ────────────────────────────────────────────────────
function bakeChunkCanvas(chunk: ChunkData, season: Season): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CHUNK_SIZE; c.height = CHUNK_SIZE;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(CHUNK_SIZE, CHUNK_SIZE);
  const d = img.data;
  const pal = PARSED_PALETTES[season];

  for (let ty = 0; ty < CHUNK_SIZE; ty++) {
    for (let tx = 0; tx < CHUNK_SIZE; tx++) {
      const localIdx = ty * CHUNK_SIZE + tx;
      const isRoad = chunk.roads[localIdx] === 1;
      const code = isRoad ? 11 : chunk.tiles[localIdx];
      const [r, g, b] = pal[code] ?? [50, 50, 50];
      const v = ((tx * 3 + ty * 7) ^ (tx ^ ty)) & 0x07;
      const pix = localIdx * 4;
      d[pix]     = Math.min(255, r + v - 3);
      d[pix + 1] = Math.min(255, g + v - 3);
      d[pix + 2] = Math.min(255, b + v - 3);
      d[pix + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ── Object rendering ───────────────────────────────────────────────────────
function drawObject(ctx: CanvasRenderingContext2D, obj: WorldObject, sx: number, sy: number, zoom: number, time: number) {
  const z = zoom;
  const [r, g, b] = OBJ_COLORS[obj.type] ?? [150, 150, 150];
  const col = `rgb(${r},${g},${b})`;
  if (z < 5) { ctx.fillStyle = col; ctx.fillRect(sx - 1, sy - 1, 2, 2); return; }
  ctx.save(); ctx.translate(sx, sy);
  switch (obj.type) {
    case 'hut': case 'farm': {
      ctx.fillStyle = col;
      ctx.fillRect(-z * 1.2, -z * 0.7, z * 2.4, z * 1.4);
      ctx.fillStyle = `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 30)},${Math.max(0, b - 20)})`;
      ctx.beginPath(); ctx.moveTo(-z * 1.5, -z * 0.7); ctx.lineTo(0, -z * 2.0); ctx.lineTo(z * 1.5, -z * 0.7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-z * 0.3, z * 0.1, z * 0.6, z * 0.6);
      break;
    }
    case 'barn': {
      ctx.fillStyle = col; ctx.fillRect(-z * 1.8, -z * 1.0, z * 3.6, z * 2.0);
      ctx.fillStyle = `rgb(${Math.max(0, r - 50)},${Math.max(0, g - 30)},${Math.max(0, b - 10)})`;
      ctx.beginPath(); ctx.moveTo(-z * 2.0, -z * 1.0); ctx.lineTo(0, -z * 2.5); ctx.lineTo(z * 2.0, -z * 1.0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = z * 0.15;
      ctx.beginPath(); ctx.moveTo(-z * 0.8, z * 1.0); ctx.lineTo(z * 0.8, -z * 0.2); ctx.moveTo(z * 0.8, z * 1.0); ctx.lineTo(-z * 0.8, -z * 0.2); ctx.stroke();
      break;
    }
    case 'windmill': {
      const spin = time * 0.0008 * (1 + obj.variant * 0.3);
      ctx.fillStyle = col; ctx.fillRect(-z * 0.5, -z * 2.0, z, z * 2.5);
      ctx.strokeStyle = `rgb(${Math.max(0, r - 20)},${Math.max(0, g - 20)},${Math.max(0, b + 10)})`; ctx.lineWidth = z * 0.5;
      for (let i = 0; i < 4; i++) { const a = spin + (i / 4) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, -z * 1.5); ctx.lineTo(Math.cos(a) * z * 2.2, -z * 1.5 + Math.sin(a) * z * 2.2); ctx.stroke(); }
      break;
    }
    case 'watchtower': {
      ctx.fillStyle = col; ctx.fillRect(-z * 0.9, -z * 3.0, z * 1.8, z * 3.5);
      ctx.fillStyle = `rgb(${Math.max(0, r - 15)},${Math.max(0, g - 15)},${Math.max(0, b - 10)})`;
      for (let i = 0; i < 3; i++) ctx.fillRect(-z * 0.9 + i * z * 0.7, -z * 3.6, z * 0.45, z * 0.6);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(-z * 0.12, -z * 2.0, z * 0.24, z * 0.6);
      break;
    }
    case 'stone_wall': {
      ctx.fillStyle = col; ctx.fillRect(-z * 0.6, -z * 0.5, z * 1.2, z * 1.0);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.5; ctx.strokeRect(-z * 0.6, -z * 0.5, z * 1.2, z * 1.0);
      break;
    }
    case 'market_stall': {
      const awningCol = ['#e05050', '#50a050', '#5050e0', '#e0a020'][obj.variant % 4];
      ctx.fillStyle = awningCol; ctx.fillRect(-z * 1.6, -z * 1.8, z * 3.2, z * 0.5);
      ctx.fillStyle = col; ctx.fillRect(-z * 1.4, -z * 1.3, z * 2.8, z * 1.0);
      ctx.fillStyle = `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 30)},${Math.max(0, b - 20)})`;
      ctx.fillRect(-z * 1.2, -z * 0.3, z * 0.25, z * 0.6); ctx.fillRect(z * 0.95, -z * 0.3, z * 0.25, z * 0.6);
      break;
    }
    case 'ruins_pillar': {
      const h = z * (1.5 + (obj.variant % 3) * 0.8);
      ctx.fillStyle = col; ctx.fillRect(-z * 0.5, -h, z, h);
      ctx.fillStyle = `rgb(${Math.max(0, r - 20)},${Math.max(0, g - 15)},${Math.max(0, b - 10)})`;
      ctx.fillRect(-z * 0.6, -h - z * 0.3, z * 0.4, z * 0.3); ctx.fillRect(z * 0.2, -h - z * 0.5, z * 0.4, z * 0.5);
      break;
    }
    case 'stone_circle': {
      ctx.strokeStyle = col; ctx.lineWidth = z * 0.5; ctx.beginPath(); ctx.arc(0, 0, z * 0.8, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'well': {
      ctx.strokeStyle = col; ctx.lineWidth = z * 0.4; ctx.beginPath(); ctx.arc(0, 0, z * 1.0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgb(${Math.max(0, r - 30)},${Math.max(0, g - 20)},${Math.max(0, b)})`; ctx.lineWidth = z * 0.3;
      ctx.beginPath(); ctx.moveTo(-z, -z * 0.8); ctx.lineTo(z, -z * 0.8); ctx.stroke();
      break;
    }
    case 'campfire': {
      const flicker = 0.7 + Math.sin(time * 0.005 + obj.variant) * 0.3;
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, z * 2.5 * flicker);
      grd.addColorStop(0, 'rgba(255,180,50,0.6)'); grd.addColorStop(1, 'rgba(255,80,10,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, z * 2.5 * flicker, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-z * 0.9, z * 0.2, z * 0.5, z * 0.3); ctx.fillRect(z * 0.4, z * 0.2, z * 0.5, z * 0.3);
      ctx.fillStyle = `rgba(255,${Math.round(120 + flicker * 80)},30,0.9)`;
      ctx.beginPath(); ctx.ellipse(0, -z * 0.6 * flicker, z * 0.5, z * 0.9 * flicker, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'dock': {
      ctx.fillStyle = col; ctx.fillRect(-z * 0.4, -z * 2.5, z * 0.8, z * 3.0);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-z * 0.4, -z * 2.0 + i * z * 0.7); ctx.lineTo(z * 0.4, -z * 2.0 + i * z * 0.7); ctx.stroke(); }
      break;
    }
    case 'shrine': {
      ctx.fillStyle = col; ctx.fillRect(-z * 0.25, -z * 2.0, z * 0.5, z * 2.5); ctx.fillRect(-z * 0.9, -z * 1.4, z * 1.8, z * 0.45);
      break;
    }
    case 'gate': {
      ctx.fillStyle = col;
      ctx.fillRect(-z * 2.0, -z * 2.5, z * 1.0, z * 2.5); ctx.fillRect(z * 1.0, -z * 2.5, z * 1.0, z * 2.5);
      ctx.strokeStyle = col; ctx.lineWidth = z * 0.8;
      ctx.beginPath(); ctx.arc(0, -z * 2.5, z * 1.5, Math.PI, 0, false); ctx.stroke();
      break;
    }
    case 'fence': {
      ctx.strokeStyle = col; ctx.lineWidth = z * 0.3;
      ctx.beginPath();
      ctx.moveTo(-z * 0.8, z * 0.2); ctx.lineTo(-z * 0.8, -z * 0.8);
      ctx.moveTo(z * 0.8, z * 0.2); ctx.lineTo(z * 0.8, -z * 0.8);
      ctx.moveTo(-z * 0.8, -z * 0.35); ctx.lineTo(z * 0.8, -z * 0.35);
      ctx.stroke();
      break;
    }
    case 'poi_lakeshore': {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, 0, z * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,220,255,0.5)';
      ctx.lineWidth = z * 0.12;
      ctx.stroke();
      break;
    }
    case 'poi_chapel': {
      ctx.fillStyle = col;
      ctx.fillRect(-z * 0.8, -z * 1.6, z * 1.6, z * 1.8);
      ctx.beginPath();
      ctx.moveTo(-z * 1.0, -z * 1.6);
      ctx.lineTo(0, -z * 2.4);
      ctx.lineTo(z * 1.0, -z * 1.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'poi_knight_camp': {
      ctx.fillStyle = col;
      ctx.fillRect(-z * 1.2, z * 0.2, z * 2.4, z * 0.35);
      ctx.strokeStyle = '#c8a060';
      ctx.lineWidth = z * 0.15;
      ctx.beginPath();
      ctx.arc(0, -z * 0.4, z * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'poi_wrecked_cart': {
      ctx.fillStyle = col;
      ctx.fillRect(-z * 1.4, -z * 0.2, z * 2.8, z * 0.6);
      ctx.fillStyle = '#3a3028';
      ctx.fillRect(-z * 0.3, -z * 0.9, z * 0.6, z * 0.5);
      break;
    }
    case 'poi_standing_stone': {
      ctx.fillStyle = col;
      ctx.fillRect(-z * 0.35, -z * 2.2, z * 0.7, z * 2.5);
      break;
    }
    case 'poi_monster_lair': {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, z * 0.6);
      ctx.lineTo(-z * 1.2, -z * 0.8);
      ctx.lineTo(z * 1.2, -z * 0.8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'poi_road_inn': {
      ctx.fillStyle = col;
      ctx.fillRect(-z * 1.4, -z * 1.0, z * 2.8, z * 1.8);
      ctx.fillStyle = 'rgba(255,200,100,0.35)';
      ctx.fillRect(-z * 0.5, -z * 1.6, z * 1.0, z * 0.35);
      break;
    }
    default:
      ctx.fillStyle = col; ctx.fillRect(-z * 0.7, -z * 0.7, z * 1.4, z * 1.4);
  }
  ctx.restore();
}

// ── Entity rendering ───────────────────────────────────────────────────────
function drawEntity(ctx: CanvasRenderingContext2D, entity: AmbientEntity, sx: number, sy: number, zoom: number) {
  const col = ENTITY_COLORS[entity.type] ?? '#aaa';
  const z = zoom;
  if (z < 5) { ctx.fillStyle = col; ctx.fillRect(sx - 1, sy - 1, 2, 2); return; }
  ctx.save(); ctx.translate(sx, sy);
  switch (entity.type) {
    case 'deer': {
      ctx.fillStyle = col; ctx.fillRect(-z * 0.9, -z * 0.6, z * 1.8, z * 0.9);
      ctx.beginPath(); ctx.arc(-z * 0.5, -z * 1.0, z * 0.45, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'sheep': {
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, z * 1.1, z * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a09080'; ctx.beginPath(); ctx.arc(-z * 0.8, -z * 0.4, z * 0.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'wolf': {
      ctx.fillStyle = col; ctx.fillRect(-z * 1.0, -z * 0.5, z * 2.0, z * 1.0);
      ctx.beginPath(); ctx.moveTo(-z * 0.9, -z * 0.5); ctx.lineTo(-z * 1.3, -z * 1.3); ctx.lineTo(-z * 0.4, -z * 0.5); ctx.closePath(); ctx.fill();
      break;
    }
    case 'eagle': case 'crow': {
      ctx.strokeStyle = col; ctx.lineWidth = z * 0.35;
      ctx.beginPath(); ctx.moveTo(-z * 1.4, 0); ctx.quadraticCurveTo(-z * 0.5, -z * 0.7, 0, 0); ctx.quadraticCurveTo(z * 0.5, -z * 0.7, z * 1.4, 0); ctx.stroke();
      break;
    }
    case 'rabbit': {
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, z * 0.2, z * 0.55, z * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-z * 0.3, -z * 0.7, z * 0.2, z * 0.6); ctx.fillRect(z * 0.1, -z * 0.8, z * 0.2, z * 0.6);
      break;
    }
    case 'fish': {
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, z * 0.9, z * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(z * 0.9, 0); ctx.lineTo(z * 1.5, -z * 0.4); ctx.lineTo(z * 1.5, z * 0.4); ctx.closePath(); ctx.fill();
      break;
    }
    case 'villager': case 'traveler': case 'fisherman': case 'merchant': {
      ctx.fillStyle = col; ctx.fillRect(-z * 0.35, -z * 0.9, z * 0.7, z * 0.9);
      ctx.beginPath(); ctx.arc(0, -z * 1.2, z * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-z * 0.35, 0, z * 0.3, z * 0.55); ctx.fillRect(z * 0.05, 0, z * 0.3, z * 0.55);
      break;
    }
    case 'guard': {
      ctx.fillStyle = col; ctx.fillRect(-z * 0.4, -z * 1.0, z * 0.8, z * 1.0);
      ctx.beginPath(); ctx.arc(0, -z * 1.35, z * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a7050'; ctx.lineWidth = z * 0.2;
      ctx.beginPath(); ctx.moveTo(z * 0.55, -z * 1.8); ctx.lineTo(z * 0.55, z * 0.6); ctx.stroke();
      ctx.fillStyle = '#c0c0b0';
      ctx.beginPath(); ctx.moveTo(z * 0.4, -z * 1.8); ctx.lineTo(z * 0.7, -z * 1.8); ctx.lineTo(z * 0.55, -z * 2.3); ctx.closePath(); ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, z * 0.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// ── Player sprite ──────────────────────────────────────────────────────────
type MoveDir = 'up' | 'down' | 'left' | 'right';

function drawHumanPlayer(ctx: CanvasRenderingContext2D, sx: number, sy: number, zoom: number, dir: MoveDir, time: number) {
  if (zoom < 4) { ctx.fillStyle = '#e8d490'; ctx.fillRect(sx - 1, sy - 1, 3, 3); return; }
  const z = zoom;
  const walkCycle = Math.sin(time * 0.006) * 0.4;
  const bobY = Math.abs(Math.sin(time * 0.006)) * z * 0.15;
  const facingLeft = dir === 'left';
  ctx.save(); ctx.translate(sx, sy);
  if (facingLeft) ctx.scale(-1, 1);

  ctx.beginPath(); ctx.ellipse(0, z * 0.3, z * 0.9, z * 0.25, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-z * 0.7, -z * 1.6 + bobY); ctx.lineTo(-z * 0.9, z * 0.4 + bobY); ctx.lineTo(z * 0.9, z * 0.4 + bobY); ctx.lineTo(z * 0.7, -z * 1.6 + bobY); ctx.closePath(); ctx.fillStyle = dir === 'up' ? '#6a5a3a' : '#7a6a42'; ctx.fill();

  ctx.save(); ctx.translate(-z * 0.22, z * 0.15 + bobY); ctx.rotate(-walkCycle);
  ctx.fillStyle = '#4a3a22'; ctx.fillRect(-z * 0.18, 0, z * 0.36, z * 0.9);
  ctx.fillStyle = '#2a1a0a'; ctx.fillRect(-z * 0.2, z * 0.75, z * 0.4, z * 0.22); ctx.restore();

  ctx.save(); ctx.translate(z * 0.22, z * 0.15 + bobY); ctx.rotate(walkCycle);
  ctx.fillStyle = '#5a4a2a'; ctx.fillRect(-z * 0.18, 0, z * 0.36, z * 0.9);
  ctx.fillStyle = '#2a1a0a'; ctx.fillRect(-z * 0.2, z * 0.75, z * 0.4, z * 0.22); ctx.restore();

  ctx.fillStyle = '#8a7040'; ctx.fillRect(-z * 0.45, -z * 1.55 + bobY, z * 0.9, z * 1.7);
  ctx.fillStyle = '#3a2a10'; ctx.fillRect(-z * 0.48, -z * 0.55 + bobY, z * 0.96, z * 0.2);
  ctx.fillStyle = '#c0a050'; ctx.fillRect(-z * 0.1, -z * 0.58 + bobY, z * 0.2, z * 0.26);

  ctx.save(); ctx.translate(-z * 0.52, -z * 1.2 + bobY); ctx.rotate(walkCycle * 0.6);
  ctx.fillStyle = '#7a6038'; ctx.fillRect(-z * 0.15, 0, z * 0.3, z * 0.75); ctx.restore();
  ctx.save(); ctx.translate(z * 0.52, -z * 1.2 + bobY); ctx.rotate(-walkCycle * 0.6);
  ctx.fillStyle = '#8a7040'; ctx.fillRect(-z * 0.15, 0, z * 0.3, z * 0.75); ctx.restore();

  ctx.fillStyle = '#c8a878'; ctx.fillRect(-z * 0.18, -z * 1.75 + bobY, z * 0.36, z * 0.22);
  ctx.beginPath(); ctx.ellipse(0, -z * 2.1 + bobY, z * 0.42, z * 0.45, 0, 0, Math.PI * 2); ctx.fillStyle = '#c8a878'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -z * 2.35 + bobY, z * 0.44, z * 0.28, 0, 0, Math.PI); ctx.fillStyle = '#5a3a18'; ctx.fill();
  if (dir !== 'up') {
    ctx.fillStyle = '#1a0a00';
    ctx.beginPath(); ctx.arc(-z * 0.14, -z * 2.1 + bobY, z * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(z * 0.14, -z * 2.1 + bobY, z * 0.07, 0, Math.PI * 2); ctx.fill();
  }
  if (dir === 'up' || dir === 'down') {
    ctx.beginPath(); ctx.ellipse(0, -z * 2.35 + bobY, z * 0.5, z * 0.18, 0, 0, Math.PI * 2); ctx.fillStyle = '#4a3820'; ctx.fill();
  }
  ctx.restore();

  const pulse = 1 + Math.sin(time * 0.003) * 0.15;
  ctx.beginPath(); ctx.arc(sx, sy - zoom * 1.0, zoom * 1.5 * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(200,170,80,0.25)'; ctx.lineWidth = 1; ctx.stroke();
}

/** Layered arcs + destination-out — much cheaper per frame than createRadialGradient. */
function punchVisionHole(fogCtx: CanvasRenderingContext2D, lx: number, ly: number, outerPx: number) {
  fogCtx.save();
  fogCtx.globalCompositeOperation = 'destination-out';
  const rings = [1.0, 0.74, 0.5, 0.28];
  const alphas = [0.18, 0.22, 0.28, 0.42];
  for (let i = 0; i < rings.length; i++) {
    fogCtx.fillStyle = `rgba(0,0,0,${alphas[i]})`;
    fogCtx.beginPath();
    fogCtx.arc(lx, ly, outerPx * rings[i]!, 0, Math.PI * 2);
    fogCtx.fill();
  }
  fogCtx.restore();
}

// ── Main component ─────────────────────────────────────────────────────────
export default function WorldMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const visibleObjectsRef = useRef<WorldObject[]>([]);
  const visibleEntitiesRef = useRef<AmbientEntity[]>([]);
  const visRef = useRef({ x: 0, y: 0, initialised: false });
  const moveDirRef = useRef<MoveDir>('down');

  // Chunk canvas cache: key = chunkY * NUM_CHUNKS_X + chunkX
  const chunksRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const seasonRef = useRef<Season>('thaw');
  const lastRafTsRef = useRef(0);

  const stateRef = useRef({
    playerX: 0, playerY: 0,
    season: 'thaw' as Season,
    dayNightPhase: 'day' as string,
    visitedLocations: [] as string[],
    nearestLocation: null as string | null,
    zoom: 7,
    canvasW: 800, canvasH: 600,
  });

  const playerX = useGameStore(s => s.playerX);
  const playerY = useGameStore(s => s.playerY);
  const season = useGameStore(s => s.season);
  const dayNightPhase = useGameStore(s => s.dayNightPhase);
  const visitedLocations = useGameStore(s => s.visitedLocations);
  const nearestLocation = useGameStore(s => s.nearestLocation);
  const movePlayer = useGameStore(s => s.movePlayer);
  const useItem = useGameStore(s => s.useItem);
  const interactEntity = useGameStore(s => s.interactEntity);
  const attackAction = useGameStore(s => s.attackAction);
  const setOverlay = useGameStore(s => s.setOverlay);
  const overlay = useGameStore(s => s.overlay);
  const phase = useGameStore(s => s.phase);

  useLayoutEffect(() => {
    const prev = stateRef.current;
    const seasonChanged = prev.season !== season;
    stateRef.current = { ...prev, playerX, playerY, season, dayNightPhase, visitedLocations, nearestLocation };
    if (seasonChanged) chunksRef.current.clear();
  });

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      stateRef.current.canvasW = w;
      stateRef.current.canvasH = h;
      const c = canvasRef.current;
      if (c && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
    };
    update();
    const obs = new ResizeObserver(update);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const keysDown = new Set<string>();
    const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    const onDown = (e: KeyboardEvent) => { if (MOVE_KEYS.has(e.key)) { e.preventDefault(); keysDown.add(e.key); } };
    const onUp = (e: KeyboardEvent) => keysDown.delete(e.key);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    const iv = setInterval(() => {
      let dx = 0, dy = 0;
      if (keysDown.has('w') || keysDown.has('ArrowUp')) dy = -1;
      if (keysDown.has('s') || keysDown.has('ArrowDown')) dy = 1;
      if (keysDown.has('a') || keysDown.has('ArrowLeft')) dx = -1;
      if (keysDown.has('d') || keysDown.has('ArrowRight')) dx = 1;
      if (dx || dy) {
        if (dy < 0) moveDirRef.current = 'up';
        else if (dy > 0) moveDirRef.current = 'down';
        else if (dx < 0) moveDirRef.current = 'left';
        else if (dx > 0) moveDirRef.current = 'right';
        movePlayer(dx, dy);
      }
    }, 55);
    return () => { clearInterval(iv); window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [movePlayer]);

  // E key — interact with entity first, then use item if no entity handled
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'e' && e.key !== 'E') return;
      if (['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName ?? '')) return;
      const handled = interactEntity();
      if (!handled) useItem();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [useItem, interactEntity]);

  // J key — attack
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'j' && e.key !== 'J') return;
      if (['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName ?? '')) return;
      attackAction();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [attackAction]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '?' && e.key !== 'h' && e.key !== 'H') return;
      if (['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName ?? '')) return;
      setOverlay(overlay === 'help' ? 'none' : 'help');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOverlay, overlay]);

  // ── Render loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let animId: number;

    function render(timestamp: number) {
      const ctx = canvas!.getContext('2d');
      if (!ctx) { animId = requestAnimationFrame(render); return; }

      // #region agent log
      const prevTs = lastRafTsRef.current;
      lastRafTsRef.current = timestamp;
      if (prevTs > 0) {
        const gap = timestamp - prevTs;
        if (gap > 38) {
          fetch('http://127.0.0.1:7891/ingest/68e880b8-e871-43be-946d-757508d96764', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a7e92f' },
            body: JSON.stringify({
              sessionId: 'a7e92f',
              hypothesisId: 'B',
              location: 'WorldMap.tsx:render',
              message: 'raf_frame_gap_ms',
              data: { gapMs: Math.round(gap * 10) / 10 },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
        }
      }
      // #endregion

      const { playerX, playerY, season, visitedLocations, nearestLocation, zoom, canvasW, canvasH } = stateRef.current;

      if (canvas!.width !== canvasW || canvas!.height !== canvasH) {
        canvas!.width = canvasW; canvas!.height = canvasH;
      }

      // Smooth camera
      if (!visRef.current.initialised) {
        visRef.current.x = playerX; visRef.current.y = playerY; visRef.current.initialised = true;
      } else {
        const LERP = 0.18;
        visRef.current.x += (playerX - visRef.current.x) * LERP;
        visRef.current.y += (playerY - visRef.current.y) * LERP;
      }
      const visX = visRef.current.x, visY = visRef.current.y;

      const tilesX = Math.ceil(canvasW / zoom) + 2;
      const tilesY = Math.ceil(canvasH / zoom) + 2;
      const camX = visX - tilesX / 2;
      const camY = visY - tilesY / 2;

      ctx.fillStyle = '#080808';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // ── Draw chunks ──────────────────────────────────────────────────
      const chunkStartX = Math.max(0, Math.floor(camX / CHUNK_SIZE));
      const chunkStartY = Math.max(0, Math.floor(camY / CHUNK_SIZE));
      const chunkEndX = Math.min(NUM_CHUNKS_X - 1, Math.ceil((camX + tilesX) / CHUNK_SIZE));
      const chunkEndY = Math.min(NUM_CHUNKS_Y - 1, Math.ceil((camY + tilesY) / CHUNK_SIZE));

      ctx.imageSmoothingEnabled = false;

      const visibleObjects = visibleObjectsRef.current;
      const visibleEntities = visibleEntitiesRef.current;
      visibleObjects.length = 0;
      visibleEntities.length = 0;

      for (let cy = chunkStartY; cy <= chunkEndY; cy++) {
        for (let cx = chunkStartX; cx <= chunkEndX; cx++) {
          const key = cy * NUM_CHUNKS_X + cx;
          const chunkData = getChunkData(cx, cy);
          if (!chunksRef.current.has(key)) {
            chunksRef.current.set(key, bakeChunkCanvas(chunkData, season));
          }
          const chunkCanvas = chunksRef.current.get(key)!;
          const sx = (cx * CHUNK_SIZE - camX) * zoom;
          const sy = (cy * CHUNK_SIZE - camY) * zoom;
          ctx.drawImage(chunkCanvas, sx, sy, CHUNK_SIZE * zoom, CHUNK_SIZE * zoom);

          for (const o of chunkData.objects) visibleObjects.push(o);
          for (const e of chunkData.entities) visibleEntities.push(e);
        }
      }

      // Water shimmer
      if (zoom >= 5) {
        const shimAlpha = 0.04 + Math.sin(timestamp * 0.0008) * 0.02;
        ctx.fillStyle = `rgba(40,100,160,${shimAlpha})`;
        ctx.fillRect(0, 0, canvasW * 0.15, canvasH);
      }

      // ── World objects ────────────────────────────────────────────────
      if (zoom >= 4) {
        for (const obj of visibleObjects) {
          const sx = (obj.x - camX) * zoom;
          const sy = (obj.y - camY) * zoom;
          if (sx < -zoom * 4 || sx > canvasW + zoom * 4 || sy < -zoom * 4 || sy > canvasH + zoom * 4) continue;
          drawObject(ctx, obj, sx, sy, zoom, timestamp);
        }
      }

      // ── Ambient entities ─────────────────────────────────────────────
      if (zoom >= 4) {
        for (const entity of visibleEntities) {
          const t = timestamp * 0.001;
          const animX = entity.x + Math.sin(t * entity.speed + entity.phase) * entity.radius;
          const animY = entity.y + Math.cos(t * entity.speed * 0.71 + entity.phase + 0.5) * entity.radius * 0.6;
          const sx = (animX - camX) * zoom;
          const sy = (animY - camY) * zoom;
          if (sx < -zoom * 4 || sx > canvasW + zoom * 4 || sy < -zoom * 4 || sy > canvasH + zoom * 4) continue;
          drawEntity(ctx, entity, sx, sy, zoom);
        }
      }

      // ── World entities (boats, caves, enemies, resources, horses) ──
      if (zoom >= 2) {
        for (let ecy = chunkStartY; ecy <= chunkEndY; ecy++) {
          for (let ecx = chunkStartX; ecx <= chunkEndX; ecx++) {
            const worldEnts = getEntitiesInChunk(ecx, ecy);
            for (const we of worldEnts) {
              const esx = (we.x - camX) * zoom;
              const esy = (we.y - camY) * zoom;
              if (esx < -20 || esx > canvasW + 20 || esy < -20 || esy > canvasH + 20) continue;
              const z = zoom;
              ctx.save(); ctx.translate(esx, esy);
              switch (we.kind) {
                case 'boat': {
                  if (z < 3.5) {
                    ctx.fillStyle = 'rgba(100,140,200,0.95)';
                    ctx.fillRect(-2, -2, 4, 4);
                  } else {
                    ctx.fillStyle = '#8a6a40'; ctx.fillRect(-z, -z * 0.5, z * 2, z); ctx.fillStyle = '#c8a060'; ctx.fillRect(-z * 0.1, -z * 1.5, z * 0.2, z * 1.2);
                  }
                  break;
                }
                case 'horse':
                  ctx.fillStyle = '#8a5a30'; ctx.fillRect(-z * 0.8, -z * 0.4, z * 1.6, z * 0.8); ctx.fillRect(-z * 1.0, -z * 0.8, z * 0.5, z * 0.5);
                  break;
                case 'cave_entrance': {
                  // Distinct "maw" silhouette + teal rim so caves read as dungeons, not generic dots
                  const s = z * 1.35;
                  ctx.strokeStyle = 'rgba(72, 200, 190, 0.92)';
                  ctx.lineWidth = Math.max(1.2, z * 0.22);
                  ctx.beginPath();
                  ctx.moveTo(0, s * 0.35);
                  ctx.lineTo(-s * 0.95, -s * 0.2);
                  ctx.lineTo(-s * 0.35, -s * 0.95);
                  ctx.lineTo(0, -s * 0.55);
                  ctx.lineTo(s * 0.35, -s * 0.95);
                  ctx.lineTo(s * 0.95, -s * 0.2);
                  ctx.closePath();
                  ctx.fillStyle = '#141018';
                  ctx.fill();
                  ctx.stroke();
                  ctx.fillStyle = '#0a080c';
                  ctx.beginPath();
                  ctx.moveTo(0, s * 0.15);
                  ctx.lineTo(-s * 0.55, -s * 0.35);
                  ctx.lineTo(s * 0.55, -s * 0.35);
                  ctx.closePath();
                  ctx.fill();
                  ctx.fillStyle = '#2a2830';
                  ctx.fillRect(-s * 0.12, -s * 0.92, s * 0.1, s * 0.28);
                  ctx.fillRect(0, -s * 0.88, s * 0.11, s * 0.24);
                  ctx.fillRect(s * 0.18, -s * 0.85, s * 0.09, s * 0.22);
                  break;
                }
                case 'wolf':
                  ctx.fillStyle = '#606060'; ctx.fillRect(-z * 0.8, -z * 0.4, z * 1.6, z * 0.8);
                  break;
                case 'bandit': case 'warband':
                  ctx.fillStyle = '#8a3030'; ctx.fillRect(-z * 0.35, -z * 0.9, z * 0.7, z * 0.9);
                  ctx.beginPath(); ctx.arc(0, -z * 1.2, z * 0.35, 0, Math.PI * 2); ctx.fill();
                  break;
                case 'bear':
                  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-z * 1, -z * 0.6, z * 2, z * 1.2);
                  break;
                case 'deer':
                  ctx.fillStyle = '#a07850'; ctx.fillRect(-z * 0.7, -z * 0.4, z * 1.4, z * 0.7);
                  break;
                case 'sheep':
                  ctx.fillStyle = '#e8e4d8'; ctx.beginPath(); ctx.ellipse(0, 0, z * 0.8, z * 0.5, 0, 0, Math.PI * 2); ctx.fill();
                  break;
                case 'rabbit':
                  ctx.fillStyle = '#d0c8b0'; ctx.beginPath(); ctx.ellipse(0, 0, z * 0.4, z * 0.3, 0, 0, Math.PI * 2); ctx.fill();
                  break;
                case 'caravan':
                  ctx.fillStyle = '#6a5040';
                  ctx.fillRect(-z * 1.4, -z * 0.5, z * 2.8, z * 1.0);
                  ctx.fillStyle = '#c4a060';
                  ctx.fillRect(-z * 0.8, -z * 1.1, z * 1.6, z * 0.55);
                  ctx.fillStyle = '#3a3028';
                  ctx.fillRect(z * 0.9, -z * 0.35, z * 0.35, z * 0.7);
                  break;
                case 'cooking_fire':
                  ctx.fillStyle = '#5a3a1a';
                  ctx.beginPath(); ctx.arc(0, z * 0.15, z * 0.9, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = 'rgba(255,140,40,0.85)';
                  ctx.beginPath(); ctx.arc(0, -z * 0.2, z * 0.45, 0, Math.PI * 2); ctx.fill();
                  break;
                case 'settlement_npc': {
                  const d = we.data as Record<string, unknown>;
                  const hasId = Boolean(d.npcId);
                  ctx.fillStyle = hasId ? '#e8c878' : '#c8a878';
                  ctx.beginPath(); ctx.arc(0, 0, z * 0.55, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#4a4038';
                  ctx.fillRect(-z * 0.35, z * 0.1, z * 0.7, z * 0.55);
                  if (hasId && z >= 4) {
                    const nm = String(d.name ?? '').slice(0, 10);
                    if (nm) {
                      ctx.font = `${Math.max(7, z * 1.8)}px sans-serif`;
                      ctx.textAlign = 'center';
                      ctx.fillStyle = 'rgba(240,220,160,0.95)';
                      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                      ctx.lineWidth = 2;
                      ctx.strokeText(nm, 0, -z * 1.15);
                      ctx.fillText(nm, 0, -z * 1.15);
                    }
                  }
                  break;
                }
                case 'hamlet_npc':
                  ctx.fillStyle = '#a8c8c0';
                  ctx.beginPath(); ctx.arc(0, 0, z * 0.52, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#3a5048';
                  ctx.fillRect(-z * 0.32, z * 0.08, z * 0.64, z * 0.52);
                  break;
                default:
                  if (we.kind.startsWith('resource_')) {
                    ctx.fillStyle = we.kind === 'resource_tree' ? '#3a6a2a' : we.kind === 'resource_rock' ? '#7a7a7a' : we.kind === 'resource_iron' ? '#8a6644' : '#4a8a3a';
                    ctx.beginPath(); ctx.arc(0, 0, z * 0.6, 0, Math.PI * 2); ctx.fill();
                  } else {
                    ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.arc(0, 0, z * 0.5, 0, Math.PI * 2); ctx.fill();
                  }
              }
              ctx.restore();
            }
          }
        }
      }

      // ── Fog of war ───────────────────────────────────────────────────
      if (!fogCanvasRef.current) fogCanvasRef.current = document.createElement('canvas');
      const fog = fogCanvasRef.current;
      if (fog.width !== canvasW || fog.height !== canvasH) { fog.width = canvasW; fog.height = canvasH; }
      const fogCtx = fog.getContext('2d')!;
      fogCtx.clearRect(0, 0, canvasW, canvasH);
      fogCtx.fillStyle = 'rgba(4,4,8,0.82)';
      fogCtx.fillRect(0, 0, canvasW, canvasH);
      fogCtx.globalCompositeOperation = 'destination-out';

      const playerSX = (playerX - camX) * zoom;
      const playerSY = (playerY - camY) * zoom;
      punchVisionHole(fogCtx, playerSX, playerSY, 110 * zoom);
      for (const locId of visitedLocations) {
        const coord = LOCATION_COORDS[locId];
        if (!coord) continue;
        const lsx = (coord.x - camX) * zoom;
        const lsy = (coord.y - camY) * zoom;
        punchVisionHole(fogCtx, lsx, lsy, 160 * zoom);
      }
      fogCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(fog, 0, 0);

      const visitedSet = new Set(visitedLocations);

      // ── Location markers ─────────────────────────────────────────────
      for (const loc of LOCATIONS) {
        const coord = LOCATION_COORDS[loc.id];
        if (!coord) continue;
        const lsx = (coord.x - camX) * zoom;
        const lsy = (coord.y - camY) * zoom;
        if (lsx < -50 || lsx > canvasW + 50 || lsy < -50 || lsy > canvasH + 50) continue;

        const isNear = nearestLocation === loc.id;
        const isVisited = visitedSet.has(loc.id);
        const markerR = isNear ? 14 : 9;

        if (isNear) {
          const pulse = 1 + Math.sin(timestamp * 0.004) * 0.25;
          ctx.beginPath(); ctx.arc(lsx, lsy, markerR * pulse * 1.6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(200,170,80,0.12)'; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(lsx, lsy, markerR, 0, Math.PI * 2);
        ctx.fillStyle = isNear ? 'rgba(200,170,80,0.95)' : isVisited ? 'rgba(160,140,80,0.65)' : 'rgba(80,80,80,0.4)';
        ctx.fill();
        ctx.strokeStyle = isNear ? '#c8aa50' : isVisited ? '#a08c50' : '#555';
        ctx.lineWidth = isNear ? 2 : 1; ctx.stroke();

        ctx.font = `${isNear ? 17 : 13}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(LOC_ICONS[loc.id] ?? '📍', lsx, lsy);

        if (isNear || isVisited || zoom > 5) {
          ctx.font = `${isNear ? 11 : 9}px "Courier Prime", monospace`;
          ctx.fillStyle = isNear ? '#c8aa50' : '#777';
          ctx.textBaseline = 'top';
          ctx.fillText(loc.name, lsx, lsy + markerR + 4);
        }
      }

      // ── Player sprite ────────────────────────────────────────────────
      const psx = (visX - camX) * zoom;
      const psy = (visY - camY) * zoom;
      drawHumanPlayer(ctx, psx, psy, zoom, moveDirRef.current, timestamp);

      // ── Off-screen compass indicators ────────────────────────────────
      for (const loc of LOCATIONS) {
        const coord = LOCATION_COORDS[loc.id];
        if (!coord) continue;
        const lsx = (coord.x - camX) * zoom;
        const lsy = (coord.y - camY) * zoom;
        const dist = Math.sqrt((coord.x - playerX) ** 2 + (coord.y - playerY) ** 2);
        if (dist > 500 || dist < 25) continue;
        if (lsx > 30 && lsx < canvasW - 30 && lsy > 30 && lsy < canvasH - 30) continue;

        const angle = Math.atan2(coord.y - visY, coord.x - visX);
        const edgeX = Math.max(24, Math.min(canvasW - 24, psx + Math.cos(angle) * (canvasW / 2 - 35)));
        const edgeY = Math.max(24, Math.min(canvasH - 24, psy + Math.sin(angle) * (canvasH / 2 - 35)));

        ctx.save(); ctx.translate(edgeX, edgeY); ctx.rotate(angle);
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath();
        ctx.fillStyle = visitedSet.has(loc.id) ? 'rgba(200,170,80,0.7)' : 'rgba(140,140,140,0.4)';
        ctx.fill(); ctx.restore();

        ctx.font = '8px "Courier Prime", monospace';
        ctx.fillStyle = 'rgba(200,170,80,0.55)'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(`${loc.name} (${Math.round(dist)})`, edgeX, edgeY + 13);
      }

      // ── Day/night tint ─────────────────────────────────────────────
      const dayNight = stateRef.current.dayNightPhase;
      if (dayNight === 'night') {
        ctx.fillStyle = 'rgba(10,10,40,0.35)'; ctx.fillRect(0, 0, canvasW, canvasH);
      } else if (dayNight === 'dusk') {
        ctx.fillStyle = 'rgba(200,100,50,0.12)'; ctx.fillRect(0, 0, canvasW, canvasH);
      } else if (dayNight === 'dawn') {
        ctx.fillStyle = 'rgba(255,200,140,0.08)'; ctx.fillRect(0, 0, canvasW, canvasH);
      }

      // ── Vignette (cached; gradient is expensive — only rebuild on resize) ──
      let vigEl = vigCanvasRef.current;
      if (!vigEl) {
        vigEl = document.createElement('canvas');
        vigCanvasRef.current = vigEl;
      }
      if (vigEl.width !== canvasW || vigEl.height !== canvasH) {
        vigEl.width = canvasW;
        vigEl.height = canvasH;
        const vctx = vigEl.getContext('2d')!;
        const g = vctx.createRadialGradient(
          canvasW / 2,
          canvasH / 2,
          canvasH * 0.3,
          canvasW / 2,
          canvasH / 2,
          canvasH * 0.85,
        );
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.55)');
        vctx.fillStyle = g;
        vctx.fillRect(0, 0, canvasW, canvasH);
      }
      ctx.drawImage(vigEl, 0, 0);

      ctx.font = '10px "Courier Prime", monospace';
      ctx.fillStyle = 'rgba(200,185,140,0.4)'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(`${zoom.toFixed(1)}×`, canvasW - 10, 10);

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    stateRef.current.zoom = Math.max(2, Math.min(20, stateRef.current.zoom + (e.deltaY > 0 ? -0.6 : 0.6)));
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        className="w-full h-full cursor-crosshair"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
