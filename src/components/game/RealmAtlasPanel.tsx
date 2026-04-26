import { useCallback, useEffect, useRef, useState, memo } from 'react';
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
/** Slightly coarser sample = faster build; still reads detailed at atlas zoom. */
const TERRAIN_STEP = 14;
/** Max ms spent filling terrain per animation frame (keeps UI responsive). */
const TERRAIN_SLICE_MS = 12;

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

// ── Module singleton: never use display:none (breaks drawImage source in some browsers) ──
let atlasCacheCanvas: HTMLCanvasElement | null = null;
let atlasBuildPromise: Promise<HTMLCanvasElement> | null = null;
/** Latest progress handler so prefetch + panel share one build and the UI still updates. */
let atlasTerrainProgressCb: ((pct: number) => void) | null = null;

function drawAtlasOverlayLayers(ctx: CanvasRenderingContext2D): void {
  const S = CACHE_SIZE;

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

  ctx.strokeStyle = 'rgba(200, 175, 110, 0.55)';
  ctx.lineWidth = 1.4;
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
    ctx.fillStyle = '#c9a038';
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(130, 175, 130, 0.75)';
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
    ctx.strokeStyle = 'rgba(170, 240, 232, 0.85)';
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

/**
 * Builds atlas once per session; terrain is time-sliced across frames so E / G does not freeze the tab.
 */
function ensureAtlasCache(onProgress: (pct: number) => void): Promise<HTMLCanvasElement> {
  atlasTerrainProgressCb = onProgress;
  if (atlasCacheCanvas && atlasCacheCanvas.width === CACHE_SIZE) {
    return Promise.resolve(atlasCacheCanvas);
  }
  if (atlasBuildPromise) return atlasBuildPromise;

  atlasBuildPromise = new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = CACHE_SIZE;
    canvas.height = CACHE_SIZE;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      atlasBuildPromise = null;
      reject(new Error('2d context unavailable'));
      return;
    }

    let wy = 0;
    const S = CACHE_SIZE;

    const tick = () => {
      const t0 = performance.now();
      while (wy < MAP_H && performance.now() - t0 < TERRAIN_SLICE_MS) {
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
        wy += TERRAIN_STEP;
      }

      atlasTerrainProgressCb?.(Math.min(99, Math.round((wy / MAP_H) * 100)));

      if (wy >= MAP_H) {
        drawAtlasOverlayLayers(ctx);
        atlasCacheCanvas = canvas;
        atlasBuildPromise = null;
        atlasTerrainProgressCb?.(100);
        resolve(canvas);
        return;
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });

  return atlasBuildPromise;
}

/** Warm the terrain bitmap during idle time so opening the atlas (E) is usually instant. */
export function prefetchAtlasTerrainCache(): void {
  ensureAtlasCache(() => {
    /* progress shown when panel opens with ensureAtlasCache's callback */
  });
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

function RealmAtlasPanel() {
  const overlay = useGameStore(s => s.overlay);
  const phase = useGameStore(s => s.phase);
  const setOverlay = useGameStore(s => s.setOverlay);
  const playerX = useGameStore(s => s.playerX);
  const playerY = useGameStore(s => s.playerY);
  const facingDir = useGameStore(s => s.facingDir);
  const visitedLocations = useGameStore(s => s.visitedLocations);

  const displayRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ active: boolean; lx: number; ly: number }>({ active: false, lx: 0, ly: 0 });

  const [camX, setCamX] = useState(() => playerX);
  const [camY, setCamY] = useState(() => playerY);
  const [zoomMul, setZoomMul] = useState(1);
  const [atlasReady, setAtlasReady] = useState(!!atlasCacheCanvas);
  const [buildPct, setBuildPct] = useState(0);

  const visible = overlay === 'map' && (phase === 'playing' || phase === 'sailing');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setAtlasReady(!!atlasCacheCanvas);
    setBuildPct(atlasCacheCanvas ? 100 : 0);

    ensureAtlasCache(pct => {
      if (!cancelled) setBuildPct(pct);
    })
      .then(() => {
        if (cancelled) return;
        setAtlasReady(true);
        setBuildPct(100);
      })
      .catch(() => {
        if (!cancelled) setAtlasReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const redraw = useCallback(() => {
    const display = displayRef.current;
    const cache = atlasCacheCanvas;
    if (!display || !cache || !atlasReady) return;
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

    if (srcW > 0 && srcH > 0) {
      const dstX = ((sx - sx0) / sw) * dw;
      const dstY = ((sy - sy0) / sh) * dh;
      const dstW = (srcW / sw) * dw;
      const dstH = (srcH / sh) * dh;
      ctx.drawImage(cache, sx, sy, srcW, srcH, dstX, dstY, dstW, dstH);
    }

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
      const label = loc.name.length > 18 ? `${loc.name.slice(0, 16)}…` : loc.name;
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
  }, [camX, camY, zoomMul, playerX, playerY, facingDir, visitedLocations, atlasReady]);

  useEffect(() => {
    if (!visible || !atlasReady) return;
    redraw();
  }, [visible, atlasReady, redraw]);

  const onWheel = (e: React.WheelEvent) => {
    if (!atlasReady) return;
    e.preventDefault();
    const d = e.deltaY > 0 ? 0.92 : 1.09;
    setZoomMul(z => Math.min(8, Math.max(0.35, z * d)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!atlasReady) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { active: true, lx: e.clientX, ly: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!atlasReady || !dragRef.current.active) return;
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
                className="px-2 py-0.5 border border-gold/25 font-mono-game text-[10px] text-gold hover:bg-gold/10 disabled:opacity-40"
                disabled={!atlasReady}
                onClick={() => setZoomMul(z => Math.min(8, z * 1.25))}
              >
                +
              </button>
              <button
                type="button"
                className="px-2 py-0.5 border border-gold/25 font-mono-game text-[10px] text-gold hover:bg-gold/10 disabled:opacity-40"
                disabled={!atlasReady}
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
          <div className="relative w-full border border-gold/20 rounded bg-black/40 max-h-[72vh]">
            {!atlasReady && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-ink/90 rounded">
                <p className="font-mono-game text-xs text-gold">Drawing realm terrain…</p>
                <div className="w-48 h-1.5 bg-ash/40 rounded overflow-hidden">
                  <div
                    className="h-full bg-gold/70 transition-[width] duration-150"
                    style={{ width: `${buildPct}%` }}
                  />
                </div>
                <p className="font-mono-game text-[10px] text-mist/60">{buildPct}%</p>
              </div>
            )}
            <canvas
              ref={displayRef}
              width={920}
              height={560}
              className={`w-full max-h-[72vh] block touch-none ${atlasReady ? 'cursor-grab active:cursor-grabbing' : 'cursor-wait pointer-events-none opacity-40'}`}
              style={{ imageRendering: 'pixelated' }}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(RealmAtlasPanel);
