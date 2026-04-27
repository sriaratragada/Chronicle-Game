import { useRef, useEffect } from 'react';
import { useGameStore } from '@/lib/gameStore';
import { MAP_W, MAP_H, LOCATION_COORDS, getContinentAt, getSettlementMeta } from '@/lib/mapGenerator';
import { getCoastalPortMarkers } from '@/lib/coastalPorts';
import { getHamlets } from '@/lib/hamlets';
import { LOCATIONS } from '@/lib/gameData';
import { getEntitiesNear } from '@/lib/worldEntities';

const MM_SIZE = 200;
const SAMPLE_STEP = 25;

const CONTINENT_COLORS: Record<string, string> = { auredia: '#3a5a2a', trivalen: '#5a4a3a', uloren: '#2a3a4a' };

const CONNECTIONS: [string, string][] = [
  ['highmarch','ashenford'], ['highmarch','millhaven'], ['highmarch','graygate'], ['highmarch','brightwater'],
  ['ashenford','crossroads'], ['ashenford','saltmoor'], ['saltmoor','graygate'], ['saltmoor','oakshire'],
  ['ironhold','crossroads'], ['ironhold','coldpeak'], ['ironhold','brightwater'],
  ['thornwick','graygate'], ['thornwick','goldcrest'], ['graygate','oakshire'], ['graygate','goldcrest'],
  ['crossroads','millhaven'], ['brightwater','millhaven'],
  ['korrath_citadel','frostmarch'], ['korrath_citadel','deepmine'], ['korrath_citadel','dustfall'],
  ['vell_harbor','sunfield'], ['vell_harbor','coral_cove'], ['sunfield','badlands'],
  ['sarnak_hold','windridge'], ['sarnak_hold','dustplain'], ['dustplain','dustfall'],
  ['dustfall','marshend'], ['marshend','badlands'], ['marshend','sunfield'],
];

export default function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerX = useGameStore(s => s.playerX);
  const playerY = useGameStore(s => s.playerY);
  const visitedLocations = useGameStore(s => s.visitedLocations);
  const facingDir = useGameStore(s => s.facingDir);
  const clearedCaves = useGameStore(s => s.clearedCaves);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, MM_SIZE, MM_SIZE);

    // Continent terrain (higher resolution sampling)
    for (let wy = 0; wy < MAP_H; wy += SAMPLE_STEP) {
      for (let wx = 0; wx < MAP_W; wx += SAMPLE_STEP) {
        const continent = getContinentAt(wx, wy);
        if (continent) {
          const sx = (wx / MAP_W) * MM_SIZE;
          const sy = (wy / MAP_H) * MM_SIZE;
          const sw = (SAMPLE_STEP / MAP_W) * MM_SIZE;
          const sh = (SAMPLE_STEP / MAP_H) * MM_SIZE;
          ctx.fillStyle = CONTINENT_COLORS[continent] ?? '#333';
          ctx.fillRect(sx, sy, sw + 0.5, sh + 0.5);
        }
      }
    }

    // Ports & coastal landings (anchors)
    ctx.fillStyle = 'rgba(80, 160, 220, 0.85)';
    for (const [id, c] of Object.entries(LOCATION_COORDS)) {
      const meta = getSettlementMeta(id);
      if (meta?.type === 'port' || id === 'vell_harbor') {
        const sx = (c.x / MAP_W) * MM_SIZE;
        const sy = (c.y / MAP_H) * MM_SIZE;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 3);
        ctx.lineTo(sx + 3.5, sy + 2.5);
        ctx.lineTo(sx - 3.5, sy + 2.5);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(80, 160, 220, 0.45)';
    for (const m of getCoastalPortMarkers()) {
      const sx = (m.x / MAP_W) * MM_SIZE;
      const sy = (m.y / MAP_H) * MM_SIZE;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 2.2);
      ctx.lineTo(sx + 2.5, sy + 1.8);
      ctx.lineTo(sx - 2.5, sy + 1.8);
      ctx.closePath();
      ctx.fill();
    }

    // Road network
    ctx.strokeStyle = 'rgba(140,120,80,0.3)';
    ctx.lineWidth = 0.5;
    for (const [a, b] of CONNECTIONS) {
      const ca = LOCATION_COORDS[a], cb = LOCATION_COORDS[b];
      if (!ca || !cb) continue;
      ctx.beginPath();
      ctx.moveTo((ca.x / MAP_W) * MM_SIZE, (ca.y / MAP_H) * MM_SIZE);
      ctx.lineTo((cb.x / MAP_W) * MM_SIZE, (cb.y / MAP_H) * MM_SIZE);
      ctx.stroke();
    }

    // All settlements (visited = gold, unvisited = grey '?')
    ctx.font = '7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const loc of LOCATIONS) {
      const coord = LOCATION_COORDS[loc.id];
      if (!coord) continue;
      const sx = (coord.x / MAP_W) * MM_SIZE;
      const sy = (coord.y / MAP_H) * MM_SIZE;
      const visited = visitedLocations.includes(loc.id);
      if (visited) {
        ctx.fillStyle = '#c9a84c';
        ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(200,170,80,0.6)';
        ctx.fillText(loc.name.slice(0, 6), sx, sy - 5);
      } else {
        ctx.fillStyle = 'rgba(100,100,100,0.4)';
        ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(100,100,100,0.3)';
        ctx.fillText('?', sx, sy - 4);
      }
    }

    // Hamlets (nearby road camps)
    for (const h of getHamlets()) {
      if (Math.hypot(h.x - playerX, h.y - playerY) > 720) continue;
      const hx = (h.x / MAP_W) * MM_SIZE;
      const hy = (h.y / MAP_H) * MM_SIZE;
      ctx.fillStyle = 'rgba(130,160,120,0.45)';
      ctx.fillRect(hx - 0.5, hy - 0.5, 1.2, 1.2);
    }

    // Nearby entity dots (enemies in red, animals in green, boats in blue, caves dark)
    const nearEnts = getEntitiesNear(playerX, playerY, 500);
    for (const ent of nearEnts) {
      const esx = (ent.x / MAP_W) * MM_SIZE;
      const esy = (ent.y / MAP_H) * MM_SIZE;
      if (ent.kind === 'cave_entrance') {
        ctx.save();
        ctx.translate(esx, esy);
        if (clearedCaves[ent.id]) {
          // Grey X — dungeon already cleared
          ctx.strokeStyle = 'rgba(120, 120, 120, 0.55)';
          ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(2, 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(2, -2); ctx.lineTo(-2, 2); ctx.stroke();
        } else {
          // Teal diamond — uncleared dungeon
          ctx.fillStyle = 'rgba(48, 190, 175, 0.95)';
          ctx.strokeStyle = 'rgba(160, 240, 230, 0.85)';
          ctx.lineWidth = 0.45;
          ctx.beginPath();
          ctx.moveTo(0, 2.2);
          ctx.lineTo(-2.2, 0);
          ctx.lineTo(0, -2.2);
          ctx.lineTo(2.2, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      if (['wolf', 'bandit', 'warband', 'bear'].includes(ent.kind)) ctx.fillStyle = 'rgba(200,50,50,0.6)';
      else if (['boat'].includes(ent.kind)) ctx.fillStyle = 'rgba(80,130,200,0.6)';
      else if (['horse'].includes(ent.kind)) ctx.fillStyle = 'rgba(180,140,60,0.6)';
      else if (['caravan'].includes(ent.kind)) ctx.fillStyle = 'rgba(200,180,80,0.6)';
      else if (ent.kind === 'cooking_fire') ctx.fillStyle = 'rgba(255,120,40,0.65)';
      else if (ent.kind === 'settlement_npc' || ent.kind === 'hamlet_npc') ctx.fillStyle = 'rgba(200,190,160,0.55)';
      else continue;
      ctx.fillRect(esx - 0.5, esy - 0.5, 1.5, 1.5);
    }

    // Player arrow
    const px = (playerX / MAP_W) * MM_SIZE;
    const py = (playerY / MAP_H) * MM_SIZE;
    const angle = Math.atan2(facingDir.dy, facingDir.dx);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-2, -2.5);
    ctx.lineTo(-2, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.stroke();

  }, [playerX, playerY, visitedLocations, facingDir, clearedCaves]);

  return (
    <div className="absolute top-3 right-3 z-30 pointer-events-auto">
      <canvas
        ref={canvasRef}
        width={MM_SIZE}
        height={MM_SIZE}
        className="border border-gold/20 bg-ink/80 backdrop-blur-sm opacity-80 hover:opacity-100 transition-opacity"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
