import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '@/lib/gameStore';

// ──────────────────────────────────────────────────────────────────────────────
// Scene definitions
// ──────────────────────────────────────────────────────────────────────────────

interface Scene {
  title: string;
  body: string;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
}

function drawScene0(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // Drifting gold particles + continent silhouette
  const seed = 42;
  for (let i = 0; i < 80; i++) {
    const px = ((((seed * i * 127 + 1) % 1000) / 1000) * w + t * (8 + (i % 5))) % w;
    const py = ((((seed * i * 251 + 3) % 1000) / 1000) * h + t * (3 + (i % 3) * 0.5)) % h;
    const alpha = 0.15 + 0.2 * Math.sin(t * 0.7 + i);
    ctx.fillStyle = `rgba(220,180,60,${alpha})`;
    const r = 0.8 + (i % 3) * 0.6;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
  }
  // Continent silhouette
  const cx = w * 0.5, cy = h * 0.48;
  const pulse = 0.92 + 0.08 * Math.sin(t * 0.4);
  ctx.strokeStyle = 'rgba(200,170,60,0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 2; a += 0.08) {
    const nr = (80 + 30 * Math.sin(a * 3.1 + seed) + 20 * Math.sin(a * 5.7 + seed * 0.3)) * pulse;
    const x = cx + Math.cos(a) * nr * (w / 900);
    const y = cy + Math.sin(a) * nr * (h / 600) * 0.7;
    a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke();
  // Title glow
  const tg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.35);
  tg.addColorStop(0, 'rgba(200,160,40,0.06)'); tg.addColorStop(1, 'rgba(200,160,40,0)');
  ctx.fillStyle = tg; ctx.fillRect(0, 0, w, h);
}

function drawScene1(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // Glowing road with settlement dots appearing left→right
  const ry = h * 0.5;
  const roadLen = w * 0.7;
  const rx0 = w * 0.15;
  // Road
  ctx.strokeStyle = 'rgba(180,155,90,0.35)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(rx0, ry); ctx.lineTo(rx0 + roadLen, ry); ctx.stroke();
  ctx.strokeStyle = 'rgba(220,190,110,0.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(rx0, ry); ctx.lineTo(rx0 + roadLen, ry); ctx.stroke();
  // Settlement dots
  const towns = [0.05, 0.25, 0.5, 0.75, 0.95];
  towns.forEach((frac, i) => {
    const appear = Math.max(0, Math.min(1, (t * 0.5 - i * 0.4)));
    if (appear <= 0) return;
    const tx = rx0 + roadLen * frac;
    const pulse = 1 + 0.15 * Math.sin(t * 1.5 + i);
    const gr = ctx.createRadialGradient(tx, ry, 0, tx, ry, 18 * pulse);
    gr.addColorStop(0, `rgba(220,190,80,${0.5 * appear})`); gr.addColorStop(1, 'rgba(220,190,80,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(tx, ry, 18 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(240,210,100,${appear})`; ctx.beginPath(); ctx.arc(tx, ry, 4 * appear, 0, Math.PI * 2); ctx.fill();
  });
  // Moving traveler dot
  const trav = (t * 0.08) % 1;
  const tavX = rx0 + roadLen * trav;
  ctx.fillStyle = 'rgba(200,230,200,0.8)'; ctx.beginPath(); ctx.arc(tavX, ry, 3, 0, Math.PI * 2); ctx.fill();
}

function drawScene2(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // Scattered POI glyphs with colored halos
  const pois: { x: number; y: number; color: string; label: string; delay: number }[] = [
    { x: 0.18, y: 0.35, color: 'rgba(160,150,220,0.8)', label: 'Chapel', delay: 0 },
    { x: 0.55, y: 0.25, color: 'rgba(170,60,200,0.8)', label: 'Monster Lair', delay: 0.5 },
    { x: 0.80, y: 0.52, color: 'rgba(100,200,140,0.8)', label: 'Standing Stone', delay: 1.0 },
    { x: 0.35, y: 0.65, color: 'rgba(160,130,80,0.8)', label: 'Ruins', delay: 1.5 },
    { x: 0.68, y: 0.70, color: 'rgba(200,80,80,0.8)', label: 'Knight Camp', delay: 2.0 },
  ];
  pois.forEach(({ x, y, color, label, delay }) => {
    const appear = Math.max(0, Math.min(1, (t * 0.45 - delay)));
    if (appear <= 0) return;
    const px = w * x, py = h * y;
    const pulse = 1 + 0.2 * Math.sin(t * 1.2 + delay);
    const gr = ctx.createRadialGradient(px, py, 0, px, py, 28 * pulse);
    const col = color.replace('0.8', `${0.3 * appear}`);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, py, 28 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color.replace('0.8', `${appear}`);
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
    if (appear > 0.7) {
      ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = color.replace('0.8', `${(appear - 0.7) / 0.3 * 0.7}`);
      ctx.fillText(label, px, py - 10);
    }
    // Off-screen arrow indicator
    const arrowAngle = Math.atan2(py - h * 0.5, px - w * 0.5);
    const eax = w * 0.5 + Math.cos(arrowAngle) * (w * 0.42 - 15);
    const eay = h * 0.5 + Math.sin(arrowAngle) * (h * 0.42 - 15);
    ctx.save(); ctx.translate(eax, eay); ctx.rotate(arrowAngle + Math.PI / 2);
    ctx.fillStyle = color.replace('0.8', `${appear * 0.55}`);
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-4, 3); ctx.lineTo(4, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
}

function drawScene3(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // Sun/moon arc + seasonal color + caravan
  const sunPhase = (t * 0.15) % 1;
  const sunAngle = sunPhase * Math.PI;
  const arcCx = w * 0.5, arcBy = h * 0.62;
  const arcRx = w * 0.3, arcRy = h * 0.22;
  // Arc track
  ctx.strokeStyle = 'rgba(180,160,100,0.2)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(arcCx, arcBy, arcRx, arcRy, 0, Math.PI, 0); ctx.stroke();
  // Sun or moon
  const sx = arcCx - Math.cos(sunAngle) * arcRx;
  const sy = arcBy - Math.sin(sunAngle) * arcRy;
  const isNight = sunPhase > 0.75 || sunPhase < 0.1;
  const bodyColor = isNight ? 'rgba(200,220,255,0.9)' : 'rgba(255,220,80,0.9)';
  const glowColor = isNight ? 'rgba(200,220,255,' : 'rgba(255,200,50,';
  const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, isNight ? 14 : 22);
  gr.addColorStop(0, glowColor + '0.25)'); gr.addColorStop(1, glowColor + '0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, isNight ? 14 : 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = bodyColor; ctx.beginPath(); ctx.arc(sx, sy, isNight ? 6 : 10, 0, Math.PI * 2); ctx.fill();
  // Road
  ctx.strokeStyle = 'rgba(180,155,90,0.3)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.65); ctx.lineTo(w * 0.9, h * 0.65); ctx.stroke();
  // Caravan
  const caravFrac = (t * 0.06) % 1;
  const cx2 = w * 0.1 + (w * 0.8) * caravFrac;
  ctx.fillStyle = 'rgba(180,140,80,0.85)'; ctx.fillRect(cx2 - 12, h * 0.65 - 6, 24, 10);
  ctx.fillStyle = 'rgba(220,180,100,0.6)'; ctx.fillRect(cx2 - 8, h * 0.65 - 11, 16, 6);
}

function drawScene4(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // Player silhouette with radiating light
  const cx = w * 0.5, cy = h * 0.5;
  const pulse = 1 + 0.1 * Math.sin(t * 1.5);
  // Radial light rays
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + t * 0.15;
    const r0 = 30, r1 = 80 + 20 * Math.sin(t * 0.8 + i);
    const alpha = 0.06 + 0.04 * Math.sin(t * 1.2 + i * 0.7);
    ctx.strokeStyle = `rgba(220,190,80,${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
  }
  // Outer glow
  const og = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60 * pulse);
  og.addColorStop(0, 'rgba(200,170,50,0.12)'); og.addColorStop(1, 'rgba(200,170,50,0)');
  ctx.fillStyle = og; ctx.beginPath(); ctx.arc(cx, cy, 60 * pulse, 0, Math.PI * 2); ctx.fill();
  // Player silhouette — simple stylized shape
  const z = 22 * pulse;
  ctx.fillStyle = 'rgba(200,175,120,0.9)';
  // Body
  ctx.beginPath(); ctx.moveTo(cx - z * 0.65, cy - z * 1.4); ctx.lineTo(cx - z * 0.8, cy + z * 0.35); ctx.lineTo(cx + z * 0.8, cy + z * 0.35); ctx.lineTo(cx + z * 0.65, cy - z * 1.4); ctx.closePath(); ctx.fill();
  // Head
  ctx.beginPath(); ctx.arc(cx, cy - z * 1.85, z * 0.42, 0, Math.PI * 2); ctx.fill();
  // Hat brim
  ctx.fillStyle = 'rgba(140,110,50,0.85)';
  ctx.beginPath(); ctx.ellipse(cx, cy - z * 2.2, z * 0.52, z * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(cx - z * 0.35, cy - z * 2.55, z * 0.7, z * 0.35);
}

const SCENES: Scene[] = [
  {
    title: 'A Living World',
    body: 'Ten thousand tiles of kingdoms, roads, and forgotten places — ticking forward whether you move or not.',
    draw: drawScene0,
  },
  {
    title: 'Explore',
    body: 'Follow roads between settlements. Each town has merchants, factions, and secrets waiting to be found.',
    draw: drawScene1,
  },
  {
    title: 'The Wilderness Holds Secrets',
    body: 'Ruins, chapels, monster lairs, and standing stones lie beyond the roads. Watch the screen edges for direction arrows.',
    draw: drawScene2,
  },
  {
    title: 'Trade & Survive',
    body: 'Caravans travel the roads. Seasons change. Stay fed. The world keeps moving whether you do or not.',
    draw: drawScene3,
  },
  {
    title: 'Begin Your Chronicle',
    body: 'Every choice is recorded. Every road walked leaves a mark. What will be written of your journey?',
    draw: drawScene4,
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export default function TutorialOverlay() {
  const dismissTutorial = useGameStore(s => s.dismissTutorial);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startTsRef = useRef<number>(0);
  const sceneStartRef = useRef<number>(0);
  const [scene, setScene] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  const SCENE_HOLD_MS = 4800;
  const FADE_OUT_MS = 500;

  const dismiss = useCallback(() => {
    setFadeOut(true);
    setTimeout(() => dismissTutorial(), FADE_OUT_MS);
  }, [dismissTutorial]);

  const next = useCallback(() => {
    if (scene < SCENES.length - 1) {
      setScene(s => s + 1);
      sceneStartRef.current = performance.now() - startTsRef.current;
    } else {
      dismiss();
    }
  }, [scene, dismiss]);

  // Keyboard handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { dismiss(); return; }
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss, next]);

  // RAF draw loop + auto-advance
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    startTsRef.current = performance.now();
    sceneStartRef.current = 0;

    const tick = (ts: number) => {
      const elapsed = ts - startTsRef.current;
      const sceneElapsed = elapsed - sceneStartRef.current;

      // Auto-advance
      if (sceneElapsed > SCENE_HOLD_MS) {
        sceneStartRef.current = elapsed;
        setScene(prev => {
          if (prev >= SCENES.length - 1) { dismiss(); return prev; }
          return prev + 1;
        });
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#080610';
      ctx.fillRect(0, 0, w, h);

      // Scene draw
      const t = elapsed * 0.001;
      setScene(s => { SCENES[s]?.draw(ctx, w, h, t); return s; });

      // Cross-fade overlay at scene boundaries
      const sceneProg = sceneElapsed / SCENE_HOLD_MS;
      if (sceneProg > 0.85) {
        const fadeAlpha = (sceneProg - 0.85) / 0.15;
        ctx.fillStyle = `rgba(8,6,16,${fadeAlpha * 0.8})`;
        ctx.fillRect(0, 0, w, h);
      } else if (sceneProg < 0.08) {
        const fadeAlpha = 1 - sceneProg / 0.08;
        ctx.fillStyle = `rgba(8,6,16,${fadeAlpha * 0.8})`;
        ctx.fillRect(0, 0, w, h);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dismiss]); // eslint-disable-line react-hooks/exhaustive-deps — intentional: scene changes re-trigger draw via setScene callback

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onResize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const currentScene = SCENES[scene]!;

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col overflow-hidden transition-opacity duration-500 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
      onClick={next}
    >
      {/* Canvas background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
      />

      {/* Cinematic letterbox bars */}
      <div className="absolute top-0 left-0 right-0 h-[8vh] bg-black z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-[8vh] bg-black z-10 pointer-events-none" />

      {/* Skip button */}
      <button
        className="absolute top-[10vh] right-6 z-20 font-mono text-xs text-mist/30 hover:text-mist/60 transition-colors pointer-events-auto"
        onClick={e => { e.stopPropagation(); dismiss(); }}
        type="button"
      >
        skip ›
      </button>

      {/* Bottom UI — text + controls */}
      <div className="absolute bottom-[10vh] left-0 right-0 z-20 flex flex-col items-center gap-2 px-4 pointer-events-none">
        <p
          key={`title-${scene}`}
          className="font-display text-xl tracking-[0.22em] text-gold animate-fade-in"
          style={{ animation: 'fadeIn 0.6s ease both' }}
        >
          {currentScene.title}
        </p>
        <p
          key={`body-${scene}`}
          className="font-mono text-sm text-mist/65 max-w-lg text-center leading-relaxed"
          style={{ animation: 'fadeIn 0.8s ease 0.15s both' }}
        >
          {currentScene.body}
        </p>

        {/* Progress dots */}
        <div className="flex gap-2 mt-2">
          {SCENES.map((_, i) => (
            <span
              key={i}
              className={`h-[3px] rounded-full transition-all duration-500 ${i === scene ? 'w-6 bg-gold' : 'w-3 bg-gold/25'}`}
            />
          ))}
        </div>

        {/* Action button */}
        <div className="mt-3 pointer-events-auto">
          {scene < SCENES.length - 1 ? (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); next(); }}
              className="font-display text-xs tracking-widest uppercase text-gold/55 hover:text-gold/90 transition-colors"
            >
              Next ›
            </button>
          ) : (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); dismiss(); }}
              className="px-8 py-2 border border-gold/40 bg-gold/5 font-display text-xs tracking-widest uppercase text-gold hover:bg-gold/15 hover:border-gold/60 transition-all"
            >
              Enter the World
            </button>
          )}
        </div>
      </div>

      {/* Inline keyframe for fade-in */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
