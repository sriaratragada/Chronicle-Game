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
  poi_farmstead: [176, 154, 108],
  poi_watchtower: [122, 114, 96],
  poi_stockade_ruins: [106, 88, 64],
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
      // Water shimmer glow
      const lg = ctx.createRadialGradient(0, 0, 0, 0, 0, z * 3.0);
      lg.addColorStop(0, 'rgba(80,150,200,0.25)'); lg.addColorStop(1, 'rgba(60,120,180,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(0, 0, z * 3.0, 0, Math.PI * 2); ctx.fill();
      // Dock posts
      ctx.fillStyle = '#6a4a28';
      for (let p = -1; p <= 1; p++) { ctx.fillRect(p * z * 1.0 - z * 0.15, z * 0.0, z * 0.3, z * 1.4); }
      // Planks
      ctx.fillStyle = '#8a6a40'; ctx.fillRect(-z * 1.3, z * 0.0, z * 2.6, z * 0.35);
      // Ripple
      const rph = time * 0.0015;
      ctx.strokeStyle = 'rgba(120,180,220,0.4)'; ctx.lineWidth = z * 0.12;
      ctx.beginPath(); ctx.ellipse(0, z * 1.8, z * (1.4 + Math.sin(rph) * 0.3), z * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'poi_chapel': {
      // Lavender glow
      const chapGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, z * 3.5);
      chapGlow.addColorStop(0, 'rgba(200,190,255,0.18)'); chapGlow.addColorStop(1, 'rgba(200,190,255,0)');
      ctx.fillStyle = chapGlow; ctx.beginPath(); ctx.arc(0, 0, z * 3.5, 0, Math.PI * 2); ctx.fill();
      // Stone walls
      ctx.fillStyle = '#9a9098'; ctx.fillRect(-z * 1.3, -z * 1.5, z * 2.6, z * 2.4);
      // Arched window
      ctx.fillStyle = 'rgba(200,190,255,0.45)';
      ctx.beginPath(); ctx.arc(0, -z * 0.5, z * 0.55, Math.PI, 0); ctx.fill();
      ctx.fillRect(-z * 0.55, -z * 0.5, z * 1.1, z * 0.7);
      // Pitched roof
      ctx.fillStyle = '#6a5a78';
      ctx.beginPath(); ctx.moveTo(-z * 1.5, -z * 1.5); ctx.lineTo(0, -z * 2.8); ctx.lineTo(z * 1.5, -z * 1.5); ctx.closePath(); ctx.fill();
      // Cross
      ctx.fillStyle = '#e8daf8';
      ctx.fillRect(-z * 0.12, -z * 3.6, z * 0.24, z * 1.0);
      ctx.fillRect(-z * 0.45, -z * 3.35, z * 0.9, z * 0.22);
      break;
    }
    case 'poi_knight_camp': {
      // Campfire glow
      const kcFlicker = 0.8 + Math.sin(time * 0.004 + obj.variant) * 0.2;
      const kcFg = ctx.createRadialGradient(0, z * 0.8, 0, 0, z * 0.8, z * 2.5 * kcFlicker);
      kcFg.addColorStop(0, 'rgba(255,160,40,0.45)'); kcFg.addColorStop(1, 'rgba(255,100,10,0)');
      ctx.fillStyle = kcFg; ctx.beginPath(); ctx.arc(0, z * 0.8, z * 2.5, 0, Math.PI * 2); ctx.fill();
      // Tent body
      ctx.fillStyle = '#8a6a40';
      ctx.beginPath(); ctx.moveTo(-z * 1.8, z * 1.0); ctx.lineTo(0, -z * 1.8); ctx.lineTo(z * 1.8, z * 1.0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6a4a28'; ctx.fillRect(-z * 0.25, -z * 0.5, z * 0.5, z * 1.5);
      // Banner
      ctx.fillStyle = '#c84040'; ctx.fillRect(-z * 0.25, -z * 2.2, z * 0.22, z * 0.55);
      // Campfire
      ctx.fillStyle = '#4a3010'; ctx.beginPath(); ctx.arc(0, z * 1.2, z * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,${140 + Math.floor(Math.sin(time * 0.007) * 40)},30,0.9)`;
      ctx.beginPath(); ctx.arc(0, z * 0.85, z * 0.28 * kcFlicker, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'poi_wrecked_cart': {
      ctx.save(); ctx.rotate(0.3);
      ctx.fillStyle = '#7a5030'; ctx.fillRect(-z * 1.4, -z * 0.45, z * 2.8, z * 0.75);
      // Broken wheel partial arc
      ctx.strokeStyle = '#5a3818'; ctx.lineWidth = z * 0.28;
      ctx.beginPath(); ctx.arc(z * 0.9, z * 0.7, z * 0.85, 0.4, Math.PI * 1.9); ctx.stroke();
      for (let s = 0; s < 4; s++) {
        const wa = 0.4 + (s / 4) * Math.PI * 1.5;
        ctx.beginPath(); ctx.moveTo(z * 0.9, z * 0.7); ctx.lineTo(z * 0.9 + Math.cos(wa) * z * 0.85, z * 0.7 + Math.sin(wa) * z * 0.85); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#b89060'; ctx.beginPath(); ctx.ellipse(-z * 0.8, z * 0.3, z * 0.8, z * 0.5, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d4aa70'; ctx.beginPath(); ctx.ellipse(-z * 0.8, z * 0.1, z * 0.35, z * 0.25, -0.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'poi_standing_stone': {
      // Ancient green glow
      const ssGlow = ctx.createRadialGradient(0, -z * 1.5, 0, 0, -z * 1.5, z * 2.8);
      ssGlow.addColorStop(0, 'rgba(140,200,160,0.22)'); ssGlow.addColorStop(1, 'rgba(140,200,160,0)');
      ctx.fillStyle = ssGlow; ctx.beginPath(); ctx.arc(0, -z * 1.5, z * 2.8, 0, Math.PI * 2); ctx.fill();
      // Base stones
      ctx.fillStyle = '#7a7870'; ctx.fillRect(-z * 1.0, z * 0.3, z * 2.0, z * 0.5);
      // Main monolith
      ctx.fillStyle = '#9a9890';
      ctx.beginPath(); ctx.moveTo(-z * 0.6, z * 0.3); ctx.lineTo(-z * 0.45, -z * 3.0); ctx.lineTo(z * 0.45, -z * 3.0); ctx.lineTo(z * 0.6, z * 0.3); ctx.closePath(); ctx.fill();
      // Carved rune
      ctx.strokeStyle = 'rgba(140,220,160,0.7)'; ctx.lineWidth = z * 0.13;
      ctx.beginPath(); ctx.moveTo(0, -z * 2.4); ctx.lineTo(-z * 0.25, -z * 1.6); ctx.lineTo(z * 0.25, -z * 1.6); ctx.lineTo(0, -z * 0.8); ctx.stroke();
      break;
    }
    case 'poi_monster_lair': {
      // Malevolent purple glow
      const mlGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, z * 3.5);
      mlGlow.addColorStop(0, 'rgba(100,20,120,0.35)'); mlGlow.addColorStop(0.5, 'rgba(80,10,100,0.15)'); mlGlow.addColorStop(1, 'rgba(60,0,80,0)');
      ctx.fillStyle = mlGlow; ctx.beginPath(); ctx.arc(0, 0, z * 3.5, 0, Math.PI * 2); ctx.fill();
      // Cave mouth
      ctx.fillStyle = '#1a1020';
      ctx.beginPath(); ctx.moveTo(-z * 2.0, z * 0.6); ctx.quadraticCurveTo(0, -z * 2.0, z * 2.0, z * 0.6); ctx.closePath(); ctx.fill();
      // Rim
      ctx.lineWidth = z * 0.3; ctx.strokeStyle = '#4a3050';
      ctx.beginPath(); ctx.moveTo(-z * 2.0, z * 0.6); ctx.quadraticCurveTo(0, -z * 1.8, z * 2.0, z * 0.6); ctx.stroke();
      // Skull marks at high zoom
      if (z >= 4) {
        ctx.fillStyle = 'rgba(200,180,200,0.7)';
        ctx.beginPath(); ctx.arc(-z * 0.6, z * 0.0, z * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1020';
        ctx.fillRect(-z * 0.72, z * 0.06, z * 0.18, z * 0.16); ctx.fillRect(-z * 0.5, z * 0.06, z * 0.18, z * 0.16);
      }
      break;
    }
    case 'poi_road_inn': {
      // Warm orange glow
      const riGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, z * 3.2);
      riGlow.addColorStop(0, 'rgba(255,180,60,0.2)'); riGlow.addColorStop(1, 'rgba(255,140,30,0)');
      ctx.fillStyle = riGlow; ctx.beginPath(); ctx.arc(0, 0, z * 3.2, 0, Math.PI * 2); ctx.fill();
      // Walls
      ctx.fillStyle = '#b09a70'; ctx.fillRect(-z * 1.6, -z * 1.2, z * 3.2, z * 2.0);
      // Thatched roof
      ctx.fillStyle = '#8a6a30';
      ctx.beginPath(); ctx.moveTo(-z * 1.9, -z * 1.2); ctx.lineTo(0, -z * 2.6); ctx.lineTo(z * 1.9, -z * 1.2); ctx.closePath(); ctx.fill();
      // Warm windows
      const riWinFlicker = 0.85 + Math.sin(time * 0.002 + obj.variant) * 0.15;
      ctx.fillStyle = `rgba(255,200,80,${(0.7 * riWinFlicker).toFixed(2)})`;
      ctx.fillRect(-z * 1.1, -z * 0.7, z * 0.65, z * 0.75);
      ctx.fillRect(z * 0.45, -z * 0.7, z * 0.65, z * 0.75);
      // Door
      ctx.fillStyle = '#5a3a18'; ctx.fillRect(-z * 0.28, z * 0.0, z * 0.56, z * 0.8);
      // Hanging sign post
      ctx.fillStyle = '#7a5030'; ctx.fillRect(z * 1.5, -z * 1.8, z * 0.15, z * 1.1);
      ctx.fillRect(z * 1.4, -z * 1.9, z * 0.55, z * 0.45);
      break;
    }
    case 'poi_farmstead': {
      // Farmhouse walls + pitched roof
      ctx.fillStyle = '#b09a6c';
      ctx.fillRect(-z * 1.4, -z * 0.9, z * 2.8, z * 1.5);
      ctx.fillStyle = '#7a4a28';
      ctx.beginPath();
      ctx.moveTo(-z * 1.75, -z * 0.9);
      ctx.lineTo(0, -z * 2.1);
      ctx.lineTo(z * 1.75, -z * 0.9);
      ctx.closePath();
      ctx.fill();
      // Door
      ctx.fillStyle = '#5a3818';
      ctx.fillRect(-z * 0.22, z * 0.1, z * 0.44, z * 0.5);
      // Fence posts
      ctx.fillStyle = '#c8a870';
      for (let fi = -2; fi <= 2; fi++) {
        ctx.fillRect(fi * z * 0.75 - z * 0.09, z * 0.75, z * 0.18, z * 0.42);
      }
      // Small field patch to the right
      ctx.fillStyle = 'rgba(90,130,50,0.32)';
      ctx.fillRect(z * 1.55, -z * 0.3, z * 1.9, z * 1.4);
      // Row lines in field
      ctx.strokeStyle = 'rgba(60,100,30,0.4)';
      ctx.lineWidth = z * 0.07;
      for (let ri = 0; ri < 3; ri++) {
        const fy = -z * 0.1 + ri * z * 0.42;
        ctx.beginPath();
        ctx.moveTo(z * 1.6, fy);
        ctx.lineTo(z * 3.35, fy);
        ctx.stroke();
      }
      break;
    }
    case 'poi_watchtower': {
      // Stone base
      ctx.fillStyle = '#857a68';
      ctx.fillRect(-z * 0.9, z * 0.05, z * 1.8, z * 0.32);
      // Tower body
      ctx.fillStyle = '#7a7060';
      ctx.fillRect(-z * 0.65, -z * 2.85, z * 1.3, z * 2.9);
      // Battlements — 3 merlons
      ctx.fillStyle = '#6a6050';
      for (let bi = -1; bi <= 1; bi++) {
        ctx.fillRect(bi * z * 0.42 - z * 0.19, -z * 3.35, z * 0.36, z * 0.55);
      }
      // Arrow slit
      ctx.fillStyle = '#1e1810';
      ctx.fillRect(-z * 0.1, -z * 1.85, z * 0.2, z * 0.55);
      // Torch flicker (warm dot at top)
      ctx.fillStyle = 'rgba(255,180,60,0.55)';
      ctx.beginPath();
      ctx.arc(0, -z * 3.05, z * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'poi_stockade_ruins': {
      // Partial ring of weathered log posts with gaps
      ctx.lineWidth = z * 0.3;
      for (let pi = 0; pi < 8; pi++) {
        if (pi === 2 || pi === 5) continue; // deliberate gaps
        const ang = (pi / 8) * Math.PI * 2;
        const r = z * 1.65;
        const bx = Math.cos(ang) * r;
        const by = Math.sin(ang) * r;
        const ht = z * (0.85 + (pi % 3) * 0.28);
        ctx.strokeStyle = pi % 2 === 0 ? '#6a5030' : '#7a6040';
        ctx.beginPath();
        ctx.moveTo(bx, by + z * 0.18);
        ctx.lineTo(bx, by - ht);
        ctx.stroke();
        // Post cap
        ctx.fillStyle = '#7a6040';
        ctx.beginPath();
        ctx.arc(bx, by - ht, z * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
      // Charred central scar
      ctx.fillStyle = 'rgba(32,22,14,0.6)';
      ctx.beginPath();
      ctx.arc(0, 0, z * 0.58, 0, Math.PI * 2);
      ctx.fill();
      // Ash ring
      ctx.strokeStyle = 'rgba(100,90,80,0.35)';
      ctx.lineWidth = z * 0.12;
      ctx.beginPath();
      ctx.arc(0, 0, z * 0.82, 0, Math.PI * 2);
      ctx.stroke();
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

/** Smooth radial gradient fog reveal — fully clear at center, fades over outer 55% of radius. */
function punchVisionHole(fogCtx: CanvasRenderingContext2D, lx: number, ly: number, outerPx: number) {
  const grad = fogCtx.createRadialGradient(lx, ly, 0, lx, ly, outerPx);
  grad.addColorStop(0,    'rgba(0,0,0,1)');
  grad.addColorStop(0.45, 'rgba(0,0,0,1)');
  grad.addColorStop(0.75, 'rgba(0,0,0,0.6)');
  grad.addColorStop(0.9,  'rgba(0,0,0,0.15)');
  grad.addColorStop(1,    'rgba(0,0,0,0)');
  fogCtx.fillStyle = grad;
  fogCtx.beginPath();
  fogCtx.arc(lx, ly, outerPx, 0, Math.PI * 2);
  fogCtx.fill();
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
    clearedCaves: {} as Record<string, number>,
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
  const clearedCaves = useGameStore(s => s.clearedCaves);

  useLayoutEffect(() => {
    const prev = stateRef.current;
    const seasonChanged = prev.season !== season;
    stateRef.current = { ...prev, playerX, playerY, season, dayNightPhase, visitedLocations, nearestLocation, clearedCaves };
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

      const { playerX, playerY, season, visitedLocations, nearestLocation, zoom, canvasW, canvasH } = stateRef.current;

      if (canvas!.width !== canvasW || canvas!.height !== canvasH) {
        canvas!.width = canvasW; canvas!.height = canvasH;
      }

      // Smooth camera — frame-rate independent exponential lerp
      const prevTs = lastRafTsRef.current;
      lastRafTsRef.current = timestamp;
      const dt = prevTs > 0 ? Math.min(timestamp - prevTs, 80) : 16;
      const lerp = 1 - Math.exp(-8 * dt / 1000);
      if (!visRef.current.initialised) {
        visRef.current.x = playerX; visRef.current.y = playerY; visRef.current.initialised = true;
      } else {
        visRef.current.x += (playerX - visRef.current.x) * lerp;
        visRef.current.y += (playerY - visRef.current.y) * lerp;
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
      if (zoom >= 2) {
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
                  // Maw silhouette — teal rim for uncleared, grey/dim for cleared
                  const s = z * 1.35;
                  const isCleared = Boolean(stateRef.current.clearedCaves[we.id]);
                  ctx.globalAlpha = isCleared ? 0.3 : 1;
                  ctx.strokeStyle = isCleared ? 'rgba(140, 140, 140, 0.7)' : 'rgba(72, 200, 190, 0.92)';
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
                  ctx.globalAlpha = 1;
                  break;
                }
                case 'wolf': {
                  const wGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, z * 2.2);
                  wGlow.addColorStop(0, 'rgba(60,60,60,0.4)'); wGlow.addColorStop(1, 'rgba(60,60,60,0)');
                  ctx.fillStyle = wGlow; ctx.beginPath(); ctx.arc(0, 0, z * 2.2, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#606060'; ctx.fillRect(-z * 1.0, -z * 0.5, z * 2.0, z * 1.0);
                  if (z >= 4) { ctx.beginPath(); ctx.moveTo(-z * 0.9, -z * 0.5); ctx.lineTo(-z * 1.3, -z * 1.3); ctx.lineTo(-z * 0.4, -z * 0.5); ctx.closePath(); ctx.fill(); }
                  break;
                }
                case 'bandit': case 'warband':
                  ctx.fillStyle = '#8a3030'; ctx.fillRect(-z * 0.35, -z * 0.9, z * 0.7, z * 0.9);
                  ctx.beginPath(); ctx.arc(0, -z * 1.2, z * 0.35, 0, Math.PI * 2); ctx.fill();
                  break;
                case 'bear': {
                  const bGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, z * 2.7);
                  bGlow.addColorStop(0, 'rgba(90,58,26,0.4)'); bGlow.addColorStop(1, 'rgba(90,58,26,0)');
                  ctx.fillStyle = bGlow; ctx.beginPath(); ctx.arc(0, 0, z * 2.7, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-z * 1.1, -z * 0.7, z * 2.2, z * 1.3);
                  if (z >= 4) { ctx.beginPath(); ctx.arc(-z * 0.8, -z * 1.0, z * 0.5, 0, Math.PI * 2); ctx.fill(); }
                  break;
                }
                case 'deer': {
                  const dGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, z * 2.4);
                  dGlow.addColorStop(0, 'rgba(180,140,80,0.35)'); dGlow.addColorStop(1, 'rgba(180,140,80,0)');
                  ctx.fillStyle = dGlow; ctx.beginPath(); ctx.arc(0, 0, z * 2.4, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#a07850'; ctx.fillRect(-z * 0.9, -z * 0.5, z * 1.8, z * 0.9);
                  if (z >= 4) {
                    ctx.beginPath(); ctx.arc(-z * 0.65, -z * 0.85, z * 0.38, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#7a5830'; ctx.lineWidth = z * 0.14;
                    ctx.beginPath(); ctx.moveTo(-z * 0.65, -z * 1.2); ctx.lineTo(-z * 1.0, -z * 1.85); ctx.moveTo(-z * 0.65, -z * 1.2); ctx.lineTo(-z * 0.3, -z * 1.85); ctx.stroke();
                  }
                  break;
                }
                case 'sheep': {
                  const sGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, z * 2.2);
                  sGlow.addColorStop(0, 'rgba(240,235,215,0.3)'); sGlow.addColorStop(1, 'rgba(240,235,215,0)');
                  ctx.fillStyle = sGlow; ctx.beginPath(); ctx.arc(0, 0, z * 2.2, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#e8e4d8'; ctx.beginPath(); ctx.ellipse(0, 0, z * 1.0, z * 0.7, 0, 0, Math.PI * 2); ctx.fill();
                  if (z >= 4) { ctx.fillStyle = '#c0b8a0'; ctx.beginPath(); ctx.arc(-z * 0.7, -z * 0.35, z * 0.35, 0, Math.PI * 2); ctx.fill(); }
                  break;
                }
                case 'rabbit':
                  ctx.fillStyle = '#d0c8b0'; ctx.beginPath(); ctx.ellipse(0, 0, z * 0.7, z * 0.5, 0, 0, Math.PI * 2); ctx.fill();
                  if (z >= 3) { ctx.fillRect(-z * 0.28, -z * 0.85, z * 0.18, z * 0.55); ctx.fillRect(z * 0.1, -z * 0.95, z * 0.18, z * 0.55); }
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

      // ── Wilderness POI direction arrows ──────────────────────────────
      {
        const POI_ARROW_COLORS: Partial<Record<WorldObjectType, string>> = {
          poi_stockade_ruins: 'rgba(160,130,80,0.78)',
          poi_monster_lair:   'rgba(170,60,200,0.78)',
          poi_chapel:         'rgba(160,150,220,0.78)',
          poi_standing_stone: 'rgba(100,200,140,0.78)',
          poi_knight_camp:    'rgba(200,80,80,0.78)',
        };
        const poiArrowTypes = new Set<string>(['poi_stockade_ruins', 'poi_monster_lair', 'poi_chapel', 'poi_standing_stone', 'poi_knight_camp']);
        const poiArrowCx = Math.floor(playerX / CHUNK_SIZE);
        const poiArrowCy = Math.floor(playerY / CHUNK_SIZE);
        const POI_SCAN_R = 5;
        for (let dcy = -POI_SCAN_R; dcy <= POI_SCAN_R; dcy++) {
          for (let dcx = -POI_SCAN_R; dcx <= POI_SCAN_R; dcx++) {
            const sCx = poiArrowCx + dcx;
            const sCy = poiArrowCy + dcy;
            if (sCx < 0 || sCy < 0 || sCx >= NUM_CHUNKS_X || sCy >= NUM_CHUNKS_Y) continue;
            const cd = getChunkData(sCx, sCy);
            for (const obj of cd.objects) {
              if (!poiArrowTypes.has(obj.type)) continue;
              const dist = Math.hypot(obj.x - playerX, obj.y - playerY);
              if (dist < 40 || dist > 600) continue;
              const osx = (obj.x - camX) * zoom;
              const osy = (obj.y - camY) * zoom;
              if (osx > 20 && osx < canvasW - 20 && osy > 20 && osy < canvasH - 20) continue;
              const angle = Math.atan2(obj.y - visY, obj.x - visX);
              const eX = Math.max(20, Math.min(canvasW - 20, psx + Math.cos(angle) * (canvasW / 2 - 30)));
              const eY = Math.max(20, Math.min(canvasH - 20, psy + Math.sin(angle) * (canvasH / 2 - 30)));
              const arrowColor = POI_ARROW_COLORS[obj.type as WorldObjectType] ?? 'rgba(160,160,160,0.6)';
              ctx.save();
              ctx.translate(eX, eY);
              ctx.rotate(angle + Math.PI / 2);
              ctx.fillStyle = arrowColor;
              ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-5, 3.5); ctx.lineTo(5, 3.5); ctx.closePath(); ctx.fill();
              ctx.restore();
              ctx.font = '7px "Courier Prime", monospace';
              ctx.textAlign = 'center'; ctx.textBaseline = 'top';
              ctx.fillStyle = arrowColor;
              ctx.fillText(`${Math.round(dist)}`, eX, eY + 10);
            }
          }
        }
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
