import type { FactionState } from './factionSystem';
import type { RegionalModifiers } from './regionalState';

export type FactionStrategyAction =
  | { type: 'declare_war'; targetId: string; attackerId: string }
  | { type: 'make_peace'; targetId: string }
  | { type: 'send_trade_caravan'; fromId: string; toId: string }
  | { type: 'capture_territory'; locationId: string; attackerId: string };

const PEACE_ARMY_THRESHOLD = 20;
const PEACE_TREASURY_THRESHOLD = 500;
const WAR_ADVANTAGE_RATIO = 1.4;
const WAR_TREASURY_MIN = 2000;
const WAR_TENSION_MIN = 0.4;
const TRADE_TREASURY_MIN = 3000;
const CAPTURE_ARMY_RATIO = 1.5;
const CAPTURE_CHANCE = 0.15;

/** Per-faction cooldowns (worldTime) to rate-limit decisions */
const decisionCooldowns = new Map<string, number>();

export function evaluateFactionStrategy(
  faction: FactionState,
  allFactions: Record<string, FactionState>,
  modifiers: RegionalModifiers,
  worldTime: number,
): FactionStrategyAction[] {
  const actions: FactionStrategyAction[] = [];
  const cooldown = decisionCooldowns.get(faction.id) ?? 0;
  if (worldTime < cooldown) return actions;

  const atWar = faction.atWarWith.length > 0;

  // ── Seek peace if critically low on army or treasury ──
  if (atWar && (faction.armySize < PEACE_ARMY_THRESHOLD || faction.treasury < PEACE_TREASURY_THRESHOLD)) {
    for (const enemyId of faction.atWarWith) {
      actions.push({ type: 'make_peace', targetId: enemyId });
    }
    decisionCooldowns.set(faction.id, worldTime + 48);
    return actions;
  }

  // ── Opportunistic territory capture when at war and dominant ──
  if (atWar && faction.armySize > 0) {
    for (const enemyId of faction.atWarWith) {
      const enemy = allFactions[enemyId];
      if (!enemy) continue;
      const ratio = enemy.armySize > 0 ? faction.armySize / enemy.armySize : 99;
      if (ratio >= CAPTURE_ARMY_RATIO && Math.random() < CAPTURE_CHANCE && enemy.territory.length > 0) {
        const target = enemy.territory[Math.floor(Math.random() * enemy.territory.length)]!;
        actions.push({ type: 'capture_territory', locationId: target, attackerId: faction.id });
        decisionCooldowns.set(faction.id, worldTime + 24);
        return actions;
      }
    }
  }

  // ── Consider war declaration if strong enough and world is tense ──
  if (!atWar && faction.treasury >= WAR_TREASURY_MIN && modifiers.warTension >= WAR_TENSION_MIN) {
    for (const [otherId, other] of Object.entries(allFactions)) {
      if (otherId === faction.id) continue;
      if (other.atWarWith.includes(faction.id)) continue;
      const ratio = other.armySize > 0 ? faction.armySize / other.armySize : 99;
      if (ratio >= WAR_ADVANTAGE_RATIO && faction.morale >= 60) {
        // FIX: attackerId is now a first-class field — no inference needed
        actions.push({ type: 'declare_war', targetId: otherId, attackerId: faction.id });
        decisionCooldowns.set(faction.id, worldTime + 72);
        return actions;
      }
    }
  }

  // ── Send trade caravan when flush with cash and at peace ──
  if (!atWar && faction.treasury >= TRADE_TREASURY_MIN && actions.length === 0) {
    const partner = Object.values(allFactions)
      .filter(f => f.id !== faction.id && f.atWarWith.length === 0)
      .sort((a, b) => a.treasury - b.treasury)[0];
    if (partner) {
      actions.push({ type: 'send_trade_caravan', fromId: faction.id, toId: partner.id });
      decisionCooldowns.set(faction.id, worldTime + 36);
    }
  }

  return actions;
}

export function applyFactionStrategyActions(
  factions: Record<string, FactionState>,
  actions: FactionStrategyAction[],
  {
    declareWar,
    makePeace,
    captureTerritory,
    spawnCaravan,
  }: {
    declareWar: (f: Record<string, FactionState>, a: string, b: string) => Record<string, FactionState>;
    makePeace: (f: Record<string, FactionState>, a: string, b: string) => Record<string, FactionState>;
    captureTerritory: (f: Record<string, FactionState>, w: string, l: string, loc: string) => Record<string, FactionState>;
    spawnCaravan?: (fromId: string, toId: string, factions: Record<string, FactionState>) => void;
  },
): {
  factions: Record<string, FactionState>;
  events: Array<{ type: 'war' | 'peace' | 'trade'; summary: string; attacker: string; target: string }>;
} {
  let current = factions;
  const events: Array<{ type: 'war' | 'peace' | 'trade'; summary: string; attacker: string; target: string }> = [];

  for (const action of actions) {
    if (action.type === 'declare_war') {
      // FIX: Use attackerId directly — no more broken inference loop
      const att = current[action.attackerId];
      const def = current[action.targetId];
      if (att && def) {
        current = declareWar(current, action.attackerId, action.targetId);
        events.push({
          type: 'war',
          summary: `${att.name} declared war on ${def.name}.`,
          attacker: action.attackerId,
          target: action.targetId,
        });
      }
    } else if (action.type === 'make_peace') {
      const seeker = Object.values(current).find(f => f.atWarWith.includes(action.targetId));
      if (seeker) {
        current = makePeace(current, seeker.id, action.targetId);
        const other = current[action.targetId];
        if (other) {
          events.push({
            type: 'peace',
            summary: `${seeker.name} made peace with ${other.name}.`,
            attacker: seeker.id,
            target: action.targetId,
          });
        }
      }
    } else if (action.type === 'send_trade_caravan') {
      const from = current[action.fromId];
      const to = current[action.toId];
      if (from && to) {
        spawnCaravan?.(action.fromId, action.toId, current);
        events.push({
          type: 'trade',
          summary: `${from.name} sent a trade delegation to ${to.name}.`,
          attacker: action.fromId,
          target: action.toId,
        });
      }
    } else if (action.type === 'capture_territory') {
      // FIX: use attackerId directly as winner; loser is whoever owns the territory
      const winner = current[action.attackerId];
      const loser = Object.values(current).find(f => f.territory.includes(action.locationId));
      if (winner && loser && loser.id !== winner.id) {
        current = captureTerritory(current, winner.id, loser.id, action.locationId);
        events.push({
          type: 'war',
          summary: `${winner.name} captured ${action.locationId} from ${loser.name}.`,
          attacker: winner.id,
          target: loser.id,
        });
      }
    }
  }

  return { factions: current, events };
}

/** Collect all faction strategy actions across all factions */
export function evaluateAllFactionStrategies(
  factions: Record<string, FactionState>,
  modifiers: RegionalModifiers,
  worldTime: number,
): FactionStrategyAction[] {
  const allActions: FactionStrategyAction[] = [];
  for (const faction of Object.values(factions)) {
    allActions.push(...evaluateFactionStrategy(faction, factions, modifiers, worldTime));
  }
  return allActions;
}
