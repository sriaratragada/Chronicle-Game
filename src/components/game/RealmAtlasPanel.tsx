import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import {
  MAP_W,
  MAP_H,
  LOCATION_COORDS,
  sampleBaseTerrainCode,
  getSettlementMeta,
} from '@/lib/mapGenerator';
import { getCoastalPortMarkers } from '@/lib/coastalPorts';
import { getHamlets } from '@/lib/hamlets';
import { LOCATIONS } from '@/lib/gameData';
import { getEntitiesByKind } from '@/lib/worldEntities';

const CACHE_SIZE = 1024;
const TERRAIN_STEP = 12;

/** Same topology as Minimap — settlement road edges for drawing. */
const CONNECTIONS: [string, string][] = [
  ['highmarch', 'ashenford'],
  ['highmarch', 'millhaven'],
  ['highmarch', 'graygate'],
  ['highmarch', 'brightwater'],
  ['ashenford', 'crossroads'],
  ['ashenford', 'saltmoor'],
  ['saltmoor', 'graygate'],
  ['saltmoor', 'oakshire'],
  ['ironhold', 'crossroads'],
  ['ironhold', 'coldpeak'],
  ['ironhold', 'brightwater'],
  ['thornwick', 'graygate'],
  ['thornwick', 'goldcrest'],
  ['graygate', 'oakshire'],
  ['graygate', 'goldcrest'],
  ['crossroads', 'millhaven'],
  ['brightwater', 'millhaven'],
  ['korrath_citadel', 'frostmarch'],
  ['korrath_citadel', 'deepmine'],
  ['korrath_citadel', 'dustfall'],
  ['vell_harbor', 'sunfield'],
  ['vell_harbor', 'coral_cove'],
  ['sunfield', 'badlands'],
  ['sarnak_hold', 'windridge'],
  ['sarnak_hold', 'dustplain'],
  ['dustplain', 'dustfall'],
  ['dustfall', 'marshend'],
  ['marshend', 'badlands'],
  ['marshend', 'sunfield'],
];

/** RGB per TILE_NAMES index — readable overview palette. */
const ATLAS_PALETTE: [number, number, number][] = [
  [18, 42, 62],
  [42, 92, 118],
  [184, 168, 124],
  [52, 110, 48],
  [38, 82, 44],
  [28, 58, 32],
  [96, 92, 72],
  [82, 78, 88],
  [210, 218, 228],
  [46, 72, 52],
  [92, 84, 96],
  [110, 100, 72],
  [72, 118, 148],
  [118, 132, 78],
  [132, 138, 92],
];

function buildAtlasCache(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const S = CACHE_SIZE;
  canvas.width = S;
  canvas.height = S;

  for (let wy = 0; wy < MAP_H; wy += TERRAIN_STEP) {
    for (let wx = 0; wx < MAP_W; wx += TERRAIN_STEP) {
      const code = sampleBaseTerrainCode(wx, wy);
      const idx = Math.min(ATLAS_PALETTE.length - 1, Math.max(0, Math.floor(code)));
      const [r, g, b] = ATLAS_PALETTE[idx] ?? [60, 60, 65];
      const sx = (wx / MAP_W) * S;
      const sy = (wy / MAP_H) * S;
      const sw = (TERRAIN_STEP / MAP_W) * S + 0.6;
      const sh = (TERRAIN_STEP / MAP_H) * S + 0.6;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(sx, sy, sw, sh);
    }
  }

  ctx.fillStyle = 'rgba(80, 160, 220, 0.82)';
  for (const [id, c] of Object.entries(LOCATION_COORDS)) {
    const meta = getSettlementMeta(id);
    if (meta?.type === 'port' || id === 'vell_harbor') {
      const sx = (c.x / MAP_W) * S;
      const sy = (c.y / MAP_H) * S;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 5);
      ctx.lineTo(sx + 6, sy + 4);
      ctx.lineTo(sx - 6, sy + 4);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(80, 160, 220, 0.42)';
  for (const m of getCoastalPortMarkers()) {
    const sx = (m.x / MAP_W) * S;
    const sy = (m.y / MAP_H) * S;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 4);
    ctx.lineTo(sx + 5, sy + 3);
    ctx.lineTo(sx - 5, sy + 3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(160, 140, 88, 0.42)';
  ctx.lineWidth = 1.2;
  for (const [a, b] of CONNECTIONS) {
    const ca = LOCATION_COORDS[a];
    const cb = LOCATION_COORDS[b];
    if (!ca || !cb) continue;
    ctx.beginPath();
    ctx.moveTo((ca.x / MAP_W) * S, (ca.y / MAP_H) * S);
    ctx.lineTo((cb.x / MAP_W) * S, (cb.y / MAP_H) * S);
    ctx.stroke();
  }

  for (const loc of LOCATIONS) {
    const coord = LOCATION_COORDS[loc.id];
    if (!coord) continue;
    const sx = (coord.x / MAP_W) * S;
    const sy = (coord.y / MAP_H) * S;
    ctx.fillStyle = '#b8943c';
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(130, 175, 130, 0.65)';
  for (const h of getHamlets()) {
    const hx = (h.x / MAP_W) * S;
    const hy = (h.y / MAP_H) * S;
    ctx.fillRect(hx - 2, hy - 2, 4, 4);
  }

  for (const ent of getEntitiesByKind('cave_entrance')) {
    const esx = (ent.x / MAP_W) * S;
    const esy = (ent.y / MAP_H) * S;
    ctx.save();
    ctx.translate(esx, esy);
    ctx.fillStyle = 'rgba(48, 190, 175, 0.92)';
    ctx.strokeStyle = 'rgba(170, 240, 232, 0.78)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.lineTo(-7, 0);
    ctx.lineTo(0, -7);
    ctx.lineTo(7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function worldToScreen(
  wx: number,
  wy: number,
  camX: number,
  camY: number,
  ppw: number,
  dw: number,
  dh: number,
): [number, number] {
  return [dw / 2 + (wx - camX) * ppw, dh / 2 + (wy - camY) * ppw];
}

export default function RealmAtlasPanel() {
  const overlay = useGameStore(s => s.overlay);
  const phase = useGameStore(s => s.phase);
  const setOverlay = useGameStore(s => s.setOverlay);
  const playerX = useGameStore(s => s.playerX);
  const playerY = useGameStore(s => s.playerY);
  const facingDir = useGameStore(s => s.facingDir);
  const visitedLocations = useGameStore(s => s.visitedLocations);

  const cacheRef = useRef<HTMLCanvasElement | null>(null);
  const displayRef = useRef<HTMLCanvasElement | null>(null);
  const cacheReadyRef = useRef(false);
  const dragRef = useRef<{ active: boolean; lx: number; ly: number }>({ active: false, lx: 0, ly: 0 });

  const [camX, setCamX] = useState(() => playerX);
  const [camY, setCamY] = useState(() => playerY);
  const [zoomMul, setZoomMul] = useState(1);

  const visible = overlay === 'map' && (phase === 'playing' || phase === 'sailing');

  useLayoutEffect(() => {
    if (!visible || !cacheRef.current) return;
    if (cacheReadyRef.current) return;
    buildAtlasCache(cacheRef.current);
    cacheReadyRef.current = true;
  }, [visible]);

  const redraw = useCallback(() => {
    const display = displayRef.current;
    const cache = cacheRef.current;
    if (!display || !cache || !cacheReadyRef.current) return;
    const ctx = display.getContext('2d');
    if (!ctx) return;
    const dw = display.width;
    const dh = display.height;
    const fit = Math.min(dw, dh) / MAP_W;
    const ppw = fit * zoomMul;

    const viewWorldW = dw / ppw;
    const viewWorldH = dh / ppw;

    ctx.fillStyle = '#06060c';
    ctx.fillRect(0, 0, dw, dh);

    const sx0 = ((camX - viewWorldW / 2) / MAP_W) * CACHE_SIZE;
    const sy0 = ((camY - viewWorldH / 2) / MAP_H) * CACHE_SIZE;
    const sw = (viewWorldW / MAP_W) * CACHE_SIZE;
    const sh = (viewWorldH / MAP_H) * CACHE_SIZE;

    const sx = Math.max(0, sx0);
    const sy = Math.max(0, sy0);
    const sx1 = Math.min(CACHE_SIZE, sx0 + sw);
    const sy1 = Math.min(CACHE_SIZE, sy0 + sh);
    const srcW = sx1 - sx;
    const srcH = sy1 - sy;
    if (srcW <= 0 || srcH <= 0) return;

    const dstX = ((sx - sx0) / sw) * dw;
    const dstY = ((sy - sy0) / sh) * dh;
    const dstW = (srcW / sw) * dw;
    const dstH = (srcH / sh) * dh;

    ctx.drawImage(cache, sx, sy, srcW, srcH, dstX, dstY, dstW, dstH);

    const fontPx = Math.max(9, Math.min(16, 10 + zoomMul * 2));
    ctx.font = `${fontPx}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (const loc of LOCATIONS) {
      const coord = LOCATION_COORDS[loc.id];
      if (!coord) continue;
      const [sxp, syp] = worldToScreen(coord.x, coord.y, camX, camY, ppw, dw, dh);
      if (sxp < -40 || sxp > dw + 40 || syp < -20 || syp > dh + 40) continue;
      const visited = visitedLocations.includes(loc.id);
      ctx.fillStyle = visited ? 'rgba(220, 190, 120, 0.95)' : 'rgba(140, 140, 150, 0.85)';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3;
      const label = loc.name.length > 14 ? `${loc.name.slice(0, 12)}…` : loc.name;
      ctx.strokeText(label, sxp, syp - 10);
      ctx.fillText(label, sxp, syp - 10);
    }

    const [px, py] = worldToScreen(playerX, playerY, camX, camY, ppw, dw, dh);
    const ang = Math.atan2(facingDir.dy, facingDir.dx);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = '#ff4444';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-6, -7);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [camX, camY, zoomMul, playerX, playerY, facingDir, visitedLocations]);

  useEffect(() => {
    if (!visible) return;
    redraw();
  }, [visible, redraw]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const d = e.deltaY > 0 ? 0.92 : 1.09;
    setZoomMul(z => Math.min(8, Math.max(0.35, z * d)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { active: true, lx: e.clientX, ly: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lx;
    const dy = e.clientY - dragRef.current.ly;
    dragRef.current.lx = e.clientX;
    dragRef.current.ly = e.clientY;
    const display = displayRef.current;
    if (!display) return;
    const fit = Math.min(display.width, display.height) / MAP_W;
    const ppw = fit * zoomMul;
    setCamX(cx => cx - dx / ppw);
    setCamY(cy => cy - dy / ppw);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current.active = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[52] bg-ink/96 backdrop-blur-md pointer-events-auto flex flex-col items-center justify-center p-4"
      >
        <div className="w-full max-w-5xl flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-gold gold-glow">Realm Atlas</h2>
            <div className="flex items-center gap-3">
              <span className="font-mono-game text-[10px] text-mist/70">Scroll zoom · drag pan</span>
              <button
                type="button"
                className="px-2 py-0.5 border border-gold/25 font-mono-game text-[10px] text-gold hover:bg-gold/10"
                onClick={() => setZoomMul(z => Math.min(8, z * 1.25))}
              >
                +
              </button>
              <button
                type="button"
                className="px-2 py-0.5 border border-gold/25 font-mono-game text-[10px] text-gold hover:bg-gold/10"
                onClick={() => setZoomMul(z => Math.max(0.35, z / 1.25))}
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setOverlay('none')}
                className="font-mono-game text-xs text-mist hover:text-gold transition-colors cursor-pointer"
              >
                [ESC] Close
              </button>
            </div>
          </div>
          <p className="font-mono-game text-[10px] text-mist/45">
            Roads, ports, settlements, road camps, and cave mouths across the whole realm. Unvisited places show dimmer
            labels until you discover them.
          </p>
          <canvas
            ref={displayRef}
            width={920}
            height={560}
            className="w-full max-h-[72vh] border border-gold/20 bg-black/60 cursor-grab active:cursor-grabbing touch-none"
            style={{ imageRendering: 'pixelated' }}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>
        <canvas ref={cacheRef} className="hidden" width={CACHE_SIZE} height={CACHE_SIZE} aria-hidden />
      </motion.div>
    </AnimatePresence>
  );
}
