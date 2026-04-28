import { getWeaponDamage, getTotalArmor, Inventory } from './craftingSystem';
import { SkillTree } from './skills';
import { WorldEntity, getEntitiesNear, removeEntity, EntityKind } from './worldEntities';

export interface KillLoot {
  items: { itemId: string; qty: number }[];
  /** Added directly to player gold (separate from gold_coin stacks) */
  gold: number;
}

export interface CombatResult {
  hit: boolean;
  damage: number;
  killed: boolean;
  targetId: string;
  xpGain: number;
  targetKind?: EntityKind;
  loot?: KillLoot;
}

const HUNTABLE_AND_HOSTILE: EntityKind[] = [
  'wolf', 'bandit', 'warband', 'bear', 'deer', 'sheep', 'rabbit', 'caravan',
];

/** Loot when a kill is confirmed (called with kind before entity removal). */
export function getKillLoot(kind: EntityKind, seed = 0): KillLoot {
  const r = (n: number) => ((seed * 9301 + 49297 + n * 233280) % 233280) / 233280;
  switch (kind) {
    case 'deer':
      return { items: [{ itemId: 'raw_meat', qty: 2 }, { itemId: 'leather', qty: 1 }], gold: 0 };
    case 'sheep':
      return { items: [{ itemId: 'raw_meat', qty: 1 }, { itemId: 'cloth', qty: 2 }], gold: 0 };
    case 'rabbit':
      return { items: [{ itemId: 'raw_meat', qty: 1 }], gold: 0 };
    case 'wolf':
      return { items: [{ itemId: 'leather', qty: 1 + (r(1) > 0.5 ? 1 : 0) }], gold: 0 };
    case 'bear':
      return { items: [{ itemId: 'raw_meat', qty: 2 + (r(2) > 0.4 ? 1 : 0) }, { itemId: 'leather', qty: 2 }], gold: 0 };
    case 'knight':
      return {
        items: [{ itemId: 'gold_coin', qty: 8 + Math.floor(r(2) * 14) }, { itemId: 'iron_ore', qty: 1 }],
        gold: 12 + Math.floor(r(3) * 18),
      };
    case 'bandit': {
      const coins = 5 + Math.floor(r(3) * 12);
      const extras = ['herb', 'cloth', 'salt'] as const;
      const ex = extras[Math.floor(r(4) * extras.length)];
      return { items: [{ itemId: 'gold_coin', qty: coins }, { itemId: ex, qty: 1 + Math.floor(r(5) * 2) }], gold: 8 + Math.floor(r(6) * 20) };
    }
    case 'warband':
      return {
        items: [
          { itemId: 'gold_coin', qty: 15 + Math.floor(r(7) * 25) },
          { itemId: 'iron_ore', qty: 1 + Math.floor(r(8) * 2) },
        ],
        gold: 25 + Math.floor(r(9) * 40),
      };
    case 'caravan':
      return {
        items: [
          { itemId: 'salt', qty: 2 + Math.floor(r(10) * 4) },
          { itemId: 'cloth', qty: 1 + Math.floor(r(11) * 3) },
          { itemId: 'spice', qty: Math.floor(r(12) * 2) },
        ],
        gold: 20 + Math.floor(r(13) * 55),
      };
    default:
      return { items: [], gold: 0 };
  }
}

export function computePlayerStrikeDamage(
  inventory: Inventory,
  skills: SkillTree,
  powerMul = 1,
  currentHealth?: number,
  maxHealth?: number,
): number {
  const baseDamage = getWeaponDamage(inventory);
  const skillBonus = Math.floor(skills.combat.level * 1.5);
  const hasPowerStrike = skills.combat.perks.includes('power_strike');
  // berserker perk: +30% damage when below 30% health
  const hasBerserker = skills.combat.perks.includes('berserker');
  const isBerserk = hasBerserker && currentHealth != null && maxHealth != null && maxHealth > 0
    && currentHealth / maxHealth < 0.3;
  return Math.max(1, Math.floor(
    (baseDamage + skillBonus)
    * (hasPowerStrike ? 1.2 : 1)
    * (isBerserk ? 1.3 : 1)
    * powerMul,
  ));
}

export function playerAttack(
  px: number, py: number,
  facingDx: number, facingDy: number,
  inventory: Inventory,
  skills: SkillTree,
): CombatResult | null {
  const attackRange = 3;
  const enemies = getEntitiesNear(px, py, attackRange)
    .filter(e => HUNTABLE_AND_HOSTILE.includes(e.kind));

  if (enemies.length === 0) return null;

  // Pick closest enemy in facing direction
  let best: WorldEntity | null = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    const dx = e.x - px, dy = e.y - py;
    const dot = dx * facingDx + dy * facingDy;
    if (dot < 0) continue; // behind player
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) { bestDist = dist; best = e; }
  }
  if (!best) {
    // Fallback: hit closest regardless of direction
    best = enemies.reduce((a, b) => {
      const da = (a.x - px) ** 2 + (a.y - py) ** 2;
      const db = (b.x - px) ** 2 + (b.y - py) ** 2;
      return da < db ? a : b;
    });
  }

  // Note: health not available in overworld attack context — berserker handled in battleStrikeAction
  const totalDamage = computePlayerStrikeDamage(inventory, skills, 1);

  best.hp -= totalDamage;
  const killed = best.hp <= 0;
  const targetKind = best.kind;
  let loot: KillLoot | undefined;
  if (killed) {
    loot = getKillLoot(best.kind, best.x * 1000 + best.y);
    removeEntity(best.id);
  }

  const xpGain = killed ? getKillXp(best.kind) : Math.floor(totalDamage * 0.5);

  return { hit: true, damage: totalDamage, killed, targetId: best.id, xpGain, targetKind, loot };
}

export function getKillXp(kind: string): number {
  switch (kind) {
    case 'deer': return 6;
    case 'sheep': return 5;
    case 'rabbit': return 4;
    case 'wolf': return 15;
    case 'knight': return 35;
    case 'bandit': return 25;
    case 'warband': return 50;
    case 'bear': return 30;
    case 'caravan': return 18;
    default: return 10;
  }
}

export function enemyAttackDamage(enemy: WorldEntity, playerArmor: number): number {
  let baseDmg = 5;
  switch (enemy.kind) {
    case 'wolf': baseDmg = 5; break;
    case 'knight': baseDmg = 10; break;
    case 'bandit': baseDmg = 8; break;
    case 'warband': baseDmg = 15; break;
    case 'bear': baseDmg = 12; break;
    case 'deer':
    case 'sheep':
    case 'rabbit':
      return 0;
  }
  return Math.max(1, baseDmg - Math.floor(playerArmor * 0.5));
}

export function getAggroRadius(enemy: WorldEntity): number {
  switch (enemy.kind) {
    case 'wolf': return 8;
    case 'knight': return 14;
    case 'bandit': return 12;
    case 'warband': return 15;
    case 'bear': return 6;
    case 'deer':
    case 'sheep':
    case 'rabbit':
      return 0;
    default: return 10;
  }
}
