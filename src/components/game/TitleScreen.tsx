import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { useEffect, useRef } from 'react';
import { MAP_W, MAP_H, LOCATION_COORDS, getContinentAt } from '@/lib/mapGenerator';
import { getHamlets } from '@/lib/hamlets';
import { LOCATIONS } from '@/lib/gameData';

const CONTINENT_COLORS: Record<string, string> = {
  auredia: '#2a4a2a',
  trivalen: '#4a3a28',
  uloren: '#1a2a38',
};

const ROADS: [string, string][] = [
  ['highmarch', 'ashenford'], ['highmarch', 'millhaven'], ['highmarch', 'graygate'], ['highmarch', 'brightwater'],
  ['ashenford', 'crossroads'], ['ashenford', 'saltmoor'], ['saltmoor', 'graygate'], ['saltmoor', 'oakshire'],
  ['ironhold', 'crossroads'], ['ironhold', 'coldpeak'], ['ironhold', 'brightwater'],
  ['thornwick', 'graygate'], ['thornwick', 'goldcrest'], ['graygate', 'oakshire'], ['graygate', 'goldcrest'],
  ['crossroads', 'millhaven'], ['brightwater', 'millhaven'],
  ['korrath_citadel', 'frostmarch'], ['korrath_citadel', 'deepmine'], ['korrath_citadel', 'dustfall'],
  ['vell_harbor', 'sunfield'], ['vell_harbor', 'coral_cove'], ['sunfield', 'badlands'],
  ['sarnak_hold', 'windridge'], ['sarnak_hold', 'dustplain'], ['dustplain', 'dustfall'],
  ['dustfall', 'marshend'], ['marshend', 'badlands'], ['marshend', 'sunfield'],
];

function drawWorldPreview(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, w, h);

  for (let cy = 0; cy < h; cy += 2) {
    for (let cx = 0; cx < w; cx += 2) {
      const wx = Math.floor((cx / w) * MAP_W);
      const wy = Math.floor((cy / h) * MAP_H);
      const cont = getContinentAt(wx, wy);
      if (cont) {
        ctx.fillStyle = CONTINENT_COLORS[cont] ?? '#222';
        ctx.fillRect(cx, cy, 2.5, 2.5);
      }
    }
  }

  ctx.strokeStyle = 'rgba(160,140,90,0.25)';
  ctx.lineWidth = 1;
  for (const [a, b] of ROADS) {
    const ca = LOCATION_COORDS[a];
    const cb = LOCATION_COORDS[b];
    if (!ca || !cb) continue;
    ctx.beginPath();
    ctx.moveTo((ca.x / MAP_W) * w, (ca.y / MAP_H) * h);
    ctx.lineTo((cb.x / MAP_W) * w, (cb.y / MAP_H) * h);
    ctx.stroke();
  }

  for (const loc of LOCATIONS) {
    const c = LOCATION_COORDS[loc.id];
    if (!c) continue;
    const sx = (c.x / MAP_W) * w;
    const sy = (c.y / MAP_H) * h;
    ctx.fillStyle = 'rgba(200,170,90,0.55)';
    ctx.beginPath();
    ctx.arc(sx, sy, loc.type === 'city' || loc.id.includes('highmarch') || loc.id.includes('harbor') || loc.id.includes('hold') ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
  }

  let hCount = 0;
  for (const ham of getHamlets()) {
    if (hCount++ > 400) break;
    const sx = (ham.x / MAP_W) * w;
    const sy = (ham.y / MAP_H) * h;
    ctx.fillStyle = 'rgba(100,130,95,0.35)';
    ctx.fillRect(sx, sy, 1, 1);
  }

  ctx.font = '11px system-ui,sans-serif';
  ctx.fillStyle = 'rgba(200,190,170,0.35)';
  ctx.fillText('Auredia', (2100 / MAP_W) * w, (4800 / MAP_H) * h);
  ctx.fillText('Trivalen', (6000 / MAP_W) * w, (4800 / MAP_H) * h);
  ctx.fillText('Uloren', (9000 / MAP_W) * w, (5000 / MAP_H) * h);
}

export default function TitleScreen() {
  const startGame = useGameStore(s => s.startGame);
  const bootError = useGameStore(s => s.bootError);
  const clearBootError = useGameStore(s => s.clearBootError);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      startGame();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startGame]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const paint = () => {
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      if (w < 2 || h < 2) return;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      drawWorldPreview(ctx, w, h);
    };
    paint();
    window.addEventListener('resize', paint);
    return () => window.removeEventListener('resize', paint);
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center text-center overflow-hidden bg-ink">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-50" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-transparent to-ink/90 pointer-events-none" />

      {bootError ? (
        <div
          className="relative z-20 mx-auto max-w-lg px-6 py-3 text-left border border-rose-500/40 bg-rose-950/80 text-rose-100/95 text-sm font-body rounded-sm"
          role="alert"
        >
          <p className="font-display text-xs tracking-widest text-rose-200/90 uppercase mb-1">Could not start the world</p>
          <p className="font-mono text-[11px] text-rose-100/80 break-words">{bootError}</p>
          <button
            type="button"
            onClick={() => clearBootError()}
            className="mt-3 text-[11px] font-mono text-gold/90 underline underline-offset-2 hover:text-gold"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <motion.div
        className="relative z-10 flex flex-col items-center gap-6 px-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5 }}
      >
        <motion.p
          className="font-mono text-[11px] tracking-[0.4em] text-gold uppercase"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          A Living World Awaits
        </motion.p>
        <motion.h1
          className="font-display text-5xl md:text-7xl text-parchment gold-glow"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 80 }}
        >
          Chronicle
          <br />
          <span className="text-gold">of Aethermoor</span>
        </motion.h1>
        <motion.p
          className="font-body text-mist/70 max-w-md text-sm leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          Ten thousand tiles of kingdoms, trade roads, and forgotten ruins — ticking forward whether you move or not.
        </motion.p>
        <motion.button
          type="button"
          onClick={() => startGame()}
          className="mt-4 px-10 py-3 border-2 border-gold/40 bg-gold/5 font-display text-sm tracking-widest text-gold uppercase hover:bg-gold/15 hover:border-gold/60 transition-all cursor-pointer"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Enter the World
        </motion.button>
        <p className="font-mono text-[10px] tracking-wider text-mist/40">Enter or Space</p>
      </motion.div>
    </div>
  );
}
