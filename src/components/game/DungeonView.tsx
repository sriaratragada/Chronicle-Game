import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  generateDungeon,
  DUNGEON_W,
  DUNGEON_H,
  DUNGEON_TILE_NAMES,
  DungeonData,
  miningDropForTileByte,
  dungeonTileHash,
} from '@/lib/dungeonGen';
import { useGameStore } from '@/lib/gameStore';
import { addToInventory } from '@/lib/craftingSystem';
import { inventoryToHotbar } from '@/lib/gameStore';

/** Generate boss loot based on dungeon depth tier. Returns a list of [itemId, qty] pairs. */
function rollBossLoot(depthTier: number, seed: number): { itemId: string; qty: number }[] {
  const rng = (salt: number) => {
    let h = (seed ^ (salt * 2654435761)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    return (h >>> 0) / 0xffffffff;
  };
  const loot: { itemId: string; qty: number }[] = [];
  // Always: some gold ore and iron
  loot.push({ itemId: 'iron_ore', qty: 2 + depthTier });
  if (depthTier >= 2) loot.push({ itemId: 'gold_ore', qty: 1 + Math.floor(rng(1) * depthTier) });
  if (depthTier >= 3) loot.push({ itemId: 'crystal', qty: 1 + Math.floor(rng(2) * 2) });
  // Rare weapon drops
  if (depthTier >= 2 && rng(3) < 0.35) loot.push({ itemId: 'iron_sword', qty: 1 });
  if (depthTier >= 3 && rng(4) < 0.25) loot.push({ itemId: 'steel_sword', qty: 1 });
  if (depthTier >= 4 && rng(5) < 0.12) loot.push({ itemId: 'enchanted_blade', qty: 1 });
  // Health supplies
  if (rng(6) < 0.6) loot.push({ itemId: 'health_potion', qty: 1 });
  if (depthTier >= 2 && rng(7) < 0.4) loot.push({ itemId: 'health_potion', qty: 1 });
  return loot;
}

function exitDungeon() {
  useGameStore.getState().finalizeDungeonExit();
}

const TILE_SIZE = 4;
const GRAVITY = 0.4;
const JUMP_FORCE = -6;
const MOVE_SPEED = 2;
const MINE_COOLDOWN_MS = 280;

const BASE_COLORS: Record<string, [number, number, number]> = {
  air: [18, 18, 36],
  stone: [72, 72, 82],
  ore_iron: [118, 86, 58],
  ore_gold: [180, 160, 52],
  crystal: [92, 118, 180],
  exit: [52, 160, 72],
  entrance: [52, 112, 180],
};

const ENEMY_COLORS: Record<string, string> = {
  slime: '#44cc44',
  goblin: '#aa6644',
  bat: '#8866aa',
};

function tileSolidForPhysics(name: string): boolean {
  if (name === 'entrance' || name === 'exit' || name === 'air') return false;
  return name === 'stone' || name === 'ore_iron' || name === 'ore_gold' || name === 'crystal';
}

function tileMineable(name: string): boolean {
  return name === 'stone' || name === 'ore_iron' || name === 'ore_gold' || name === 'crystal';
}

export default function DungeonView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phase = useGameStore(s => s.phase);
  const activeCaveId = useGameStore(s => s.activeCaveId);
  const activeDungeonContinent = useGameStore(s => s.activeDungeonContinent);

  const dungeon = useMemo<DungeonData>(
    () => generateDungeon(activeCaveId ?? 1, activeDungeonContinent ?? 'auredia'),
    [activeCaveId, activeDungeonContinent],
  );

  const tilesRef = useRef<Uint8Array | null>(null);
  useLayoutEffect(() => {
    tilesRef.current = new Uint8Array(dungeon.tiles);
  }, [dungeon]);

  const playerRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, onGround: false });
  const keysRef = useRef(new Set<string>());
  const facingDxRef = useRef(1);
  const lastMineRef = useRef(0);
  const lastPickaxeHintRef = useRef(0);
  /** Per-enemy attack cooldown timestamps (keyed by enemy index). */
  const enemyCombatRef = useRef<Record<number, number>>({});

  useEffect(() => {
    const p = playerRef.current;
    p.x = dungeon.entranceX * TILE_SIZE;
    p.y = dungeon.entranceY * TILE_SIZE;
  }, [dungeon]);

  const tryMineAt = useCallback(
    (strikeTx: number, strikeTy: number) => {
      const tiles = tilesRef.current;
      if (!tiles) return;
      if (strikeTx < 0 || strikeTx >= DUNGEON_W || strikeTy < 0 || strikeTy >= DUNGEON_H) return;

      const state = useGameStore.getState();
      const hasPickaxe = state.inventory.equipment.mainhand?.itemId === 'pickaxe';
      if (!hasPickaxe) {
        const t = performance.now();
        if (t - lastPickaxeHintRef.current > 1400) {
          lastPickaxeHintRef.current = t;
          useGameStore.setState({ lastResult: 'Equip a pickaxe in your main hand to mine.' });
        }
        return;
      }

      const now = performance.now();
      if (now - lastMineRef.current < MINE_COOLDOWN_MS) return;
      lastMineRef.current = now;

      const idx = strikeTy * DUNGEON_W + strikeTx;
      const b = tiles[idx];
      const name = DUNGEON_TILE_NAMES[b] ?? 'stone';
      if (!tileMineable(name)) return;

      tiles[idx] = 0;
      const drop = miningDropForTileByte(b);
      if (drop) state.addItemToInventory(drop, 1);
      useGameStore.setState({ lastResult: null });
    },
    [],
  );

  useEffect(() => {
    if (phase !== 'dungeon') return;
    const onDown = (e: KeyboardEvent) => keysRef.current.add(e.key);
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'dungeon') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      canvas.dataset.pendingMine = JSON.stringify({ mx, my });
    };
    canvas.addEventListener('mousedown', onMouseDown);
    return () => canvas.removeEventListener('mousedown', onMouseDown);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'dungeon') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitDungeon();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'dungeon') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let animId: number;

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }
      const W = canvas.width;
      const H = canvas.height;
      const tiles = tilesRef.current;
      if (!tiles) {
        animId = requestAnimationFrame(render);
        return;
      }

      const p = playerRef.current;
      const keys = keysRef.current;

      if (keys.has('a') || keys.has('ArrowLeft')) {
        p.vx = -MOVE_SPEED;
        facingDxRef.current = -1;
      } else if (keys.has('d') || keys.has('ArrowRight')) {
        p.vx = MOVE_SPEED;
        facingDxRef.current = 1;
      } else p.vx = 0;

      if ((keys.has('w') || keys.has('ArrowUp') || keys.has(' ')) && p.onGround) {
        p.vy = JUMP_FORCE;
        p.onGround = false;
      }

      if (keys.has('f') || keys.has('F')) {
        const ptx = Math.floor(p.x / TILE_SIZE);
        const pty = Math.floor((p.y + TILE_SIZE * 0.5) / TILE_SIZE);
        tryMineAt(ptx + facingDxRef.current, pty);
      }

      p.vy += GRAVITY;
      p.x += p.vx;
      p.y += p.vy;

      const tileAt = (px: number, py: number) => {
        const tx = Math.floor(px / TILE_SIZE);
        const ty = Math.floor(py / TILE_SIZE);
        if (tx < 0 || tx >= DUNGEON_W || ty < 0 || ty >= DUNGEON_H) return 'stone';
        return DUNGEON_TILE_NAMES[tiles[ty * DUNGEON_W + tx]] ?? 'stone';
      };

      const isSolid = (tile: string) => tileSolidForPhysics(tile);

      if (p.vy > 0 && isSolid(tileAt(p.x + 2, p.y + TILE_SIZE))) {
        p.y = Math.floor(p.y / TILE_SIZE) * TILE_SIZE;
        p.vy = 0;
        p.onGround = true;
      }
      if (p.vy < 0 && isSolid(tileAt(p.x + 2, p.y))) {
        p.y = (Math.floor(p.y / TILE_SIZE) + 1) * TILE_SIZE;
        p.vy = 0;
      }
      if (p.vx > 0 && isSolid(tileAt(p.x + TILE_SIZE - 1, p.y + 2))) p.x = Math.floor(p.x / TILE_SIZE) * TILE_SIZE;
      if (p.vx < 0 && isSolid(tileAt(p.x, p.y + 2))) p.x = (Math.floor(p.x / TILE_SIZE) + 1) * TILE_SIZE;

      // ── Enemy bump-attack combat ──
      const nowCombat = performance.now();
      const COMBAT_CD = 900; // ms between hits per enemy
      const st = useGameStore.getState();
      let playerHealthAfterCombat = st.health;
      for (let ei = 0; ei < dungeon.enemies.length; ei++) {
        const enemy = dungeon.enemies[ei];
        if (!enemy || enemy.hp <= 0) continue;
        const ex = enemy.x * TILE_SIZE;
        const ey = enemy.y * TILE_SIZE;
        const overlapX = Math.abs(p.x - ex) < TILE_SIZE * 1.5;
        const overlapY = Math.abs(p.y - ey) < TILE_SIZE * 1.5;
        if (overlapX && overlapY) {
          const lastHit = enemyCombatRef.current[ei] ?? 0;
          if (nowCombat - lastHit >= COMBAT_CD) {
            enemyCombatRef.current[ei] = nowCombat;
            // Player strikes enemy
            const inv = st.inventory;
            const wpn = inv.equipment.mainhand?.itemId;
            const playerDmg = wpn === 'pickaxe' ? 18 : wpn === 'wooden_club' ? 12 : wpn === 'iron_sword' ? 20 : 8;
            enemy.hp = Math.max(0, enemy.hp - playerDmg);
            // Enemy strikes player
            const baseFoeDmg = enemy.kind === 'goblin' ? 8 : enemy.kind === 'bat' ? 4 : 6;
            const armor = Object.values(inv.equipment).reduce((sum, slot) => {
              if (!slot) return sum;
              // rough armor from item kind
              const id = slot.itemId;
              return sum + (id.includes('leather') ? 1 : id.includes('iron') ? 3 : id.includes('plate') ? 5 : 0);
            }, 0);
            const foeDmg = Math.max(1, baseFoeDmg - armor);
            playerHealthAfterCombat = Math.max(0, playerHealthAfterCombat - foeDmg);
          }
        }
        // Simple enemy patrol: move horizontally, bounce off walls
        if (dungeon.enemies[ei]!.hp > 0) {
          if (!enemy.vx) enemy.vx = (ei % 2 === 0 ? 0.025 : -0.025);
          enemy.x = (enemy.x + (enemy.vx ?? 0) + DUNGEON_W) % DUNGEON_W;
        }
      }
      if (playerHealthAfterCombat !== st.health) {
        const nextPhase = playerHealthAfterCombat <= 0 ? 'dead' : st.phase;
        useGameStore.setState({ health: playerHealthAfterCombat, phase: nextPhase });
      }

      // ── Exit tile ──
      if (tileAt(p.x + 2, p.y + 2) === 'exit') {
        // Mark bossDefeated + grant loot if all enemies are dead
        const allDead = dungeon.enemies.every(e => e.hp <= 0);
        if (allDead) {
          const cur = useGameStore.getState();
          if (cur.dungeonRun && !cur.dungeonRun.bossDefeated) {
            const { depthTier, caveId } = cur.dungeonRun;
            const loot = rollBossLoot(depthTier, caveId);
            let newInv = cur.inventory;
            for (const l of loot) {
              newInv = addToInventory(newInv, l.itemId, l.qty);
            }
            const lootDesc = loot.map(l => `${l.qty}× ${l.itemId.replace(/_/g, ' ')}`).join(', ');
            const lootEntry = {
              tick: cur.tick,
              season: cur.season,
              text: `Dungeon cleared (depth ${depthTier})! Claimed: ${lootDesc}.`,
              type: 'discovery' as const,
            };
            useGameStore.setState({
              dungeonRun: { ...cur.dungeonRun, bossDefeated: true },
              inventory: newInv,
              hotbar: inventoryToHotbar(newInv),
              chronicle: [...cur.chronicle.slice(-399), lootEntry],
              milestoneCounters: {
                ...cur.milestoneCounters,
                totalDungeonsCleared: (cur.milestoneCounters?.totalDungeonsCleared ?? 0) + 1,
              },
            });
          }
        }
        exitDungeon();
        return;
      }

      const camX = Math.max(0, Math.min(DUNGEON_W * TILE_SIZE - W, p.x - W / 2));
      const camY = Math.max(0, Math.min(DUNGEON_H * TILE_SIZE - H, p.y - H / 2));

      const pending = canvas.dataset.pendingMine;
      if (pending) {
        delete canvas.dataset.pendingMine;
        try {
          const { mx, my } = JSON.parse(pending) as { mx: number; my: number };
          const wx = mx + camX;
          const wy = my + camY;
          const pcx = p.x + TILE_SIZE * 0.35;
          const pcy = p.y + TILE_SIZE * 0.45;
          const ptx = Math.floor(p.x / TILE_SIZE);
          const pty = Math.floor((p.y + TILE_SIZE * 0.5) / TILE_SIZE);
          let stx = ptx;
          let sty = pty;
          if (Math.abs(wx - pcx) > Math.abs(wy - pcy)) stx = ptx + Math.sign(wx - pcx || facingDxRef.current);
          else sty = pty + Math.sign(wy - pcy);
          tryMineAt(stx, sty);
        } catch {
          /* ignore */
        }
      }

      ctx.fillStyle = '#06060c';
      ctx.fillRect(0, 0, W, H);

      const startTx = Math.max(0, Math.floor(camX / TILE_SIZE));
      const startTy = Math.max(0, Math.floor(camY / TILE_SIZE));
      const endTx = Math.min(DUNGEON_W, Math.ceil((camX + W) / TILE_SIZE));
      const endTy = Math.min(DUNGEON_H, Math.ceil((camY + H) / TILE_SIZE));
      const rs = dungeon.renderSeed;

      for (let ty = startTy; ty < endTy; ty++) {
        for (let tx = startTx; tx < endTx; tx++) {
          const idx = ty * DUNGEON_W + tx;
          const tile = DUNGEON_TILE_NAMES[tiles[idx]];
          const sx = tx * TILE_SIZE - camX;
          const sy = ty * TILE_SIZE - camY;

          if (tile === 'air') {
            if (ty < DUNGEON_H - 1) {
              const below = DUNGEON_TILE_NAMES[tiles[idx + DUNGEON_W]];
              if (below && below !== 'air') {
                ctx.fillStyle = 'rgba(0,0,0,0.38)';
                ctx.fillRect(sx, sy + TILE_SIZE - 2, TILE_SIZE, 2);
              }
            }
            continue;
          }

          const base = BASE_COLORS[tile] ?? [80, 80, 90];
          const n = dungeonTileHash(tx, ty, rs);
          const v = Math.floor((n - 0.5) * 18);
          const [r0, g0, b0] = base;
          let r = Math.min(255, Math.max(0, r0 + v));
          let g = Math.min(255, Math.max(0, g0 + v));
          let b = Math.min(255, Math.max(0, b0 + v));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

          if (ty > 0) {
            const above = DUNGEON_TILE_NAMES[tiles[idx - DUNGEON_W]];
            if (above === 'air') {
              ctx.fillStyle = `rgba(${Math.min(255, r + 35)},${Math.min(255, g + 35)},${Math.min(255, b + 40)},0.55)`;
              ctx.fillRect(sx, sy, TILE_SIZE, 1);
            }
          }
        }
      }

      for (const enemy of dungeon.enemies) {
        if (enemy.hp <= 0) continue;
        const sx = enemy.x * TILE_SIZE - camX;
        const sy = enemy.y * TILE_SIZE - camY;
        ctx.fillStyle = ENEMY_COLORS[enemy.kind] ?? '#ff0000';
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      }

      ctx.fillStyle = '#e8d490';
      ctx.fillRect(p.x - camX, p.y - camY, TILE_SIZE - 1, TILE_SIZE - 1);

      ctx.fillStyle = 'rgba(200,170,80,0.85)';
      ctx.font = '11px monospace';
      ctx.fillText('DUNGEON — WASD move · Space jump · F / click mine (pickaxe) · ESC exit', 10, 16);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [phase, dungeon, tryMineAt]);

  if (phase !== 'dungeon') return null;

  return (
    <div className="absolute inset-0 z-[200] bg-black">
      <canvas
        ref={canvasRef}
        width={800}
        height={400}
        className="w-full h-full cursor-crosshair"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
