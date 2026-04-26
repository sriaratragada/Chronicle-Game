import type { FactionState } from './factionSystem';
import type { RegionalModifiers } from './regionalState';

export type FactionStrategyAction =
  | { type: 'declare_war'; targetId: string }
  | { type: 'make_peace'; targetId: string }
  | { type: 'send_trade_caravan'; fromId: string; toId: string }
  | { type: 'capture_territory'; locationId: string };

const PEACE_ARMY_THRESHOLD = 20;
const PEACE_TREASURY_THRESHOLD = 500;
const WAR_ADVANTAGE_RATIO = 1.4;
const WAR_TREASURY_MIN = 2000;
const WAR_TENSION_MIN = 0.4;
const TRADE_TREASURY_MIN = 3000;

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

  // Seek peace if critically low on army or treasury
  if (atWar && (faction.armySize < PEACE_ARMY_THRESHOLD || faction.treasury < PEACE_TREASURY_THRESHOLD)) {
    for (const enemyId of faction.atWarWith) {
      actions.push({ type: 'make_peace', targetId: enemyId });
    }
    decisionCooldowns.set(faction.id, worldTime + 48);
    return actions;
  }

  // Consider war declaration if strong enough and world is tense
  if (!atWar && faction.treasury >= WAR_TREASURY_MIN && modifiers.warTension >= WAR_TENSION_MIN) {
    for (const [otherId, other] of Object.entries(allFactions)) {
      if (otherId === faction.id) continue;
      if (other.atWarWith.includes(faction.id)) continue; // already at war
      // Only attack weaker neighbors sharing contested territory
      const sharesBorder = faction.territory.some(t =>
        allFactions[otherId]?.territory.some(ot => isAdjacentTerritory(t, ot))
      );
      if (!sharesBorder) continue;
      const ratio = other.armySize > 0 ? faction.armySize / other.armySize : 99;
      if (ratio >= WAR_ADVANTAGE_RATIO && faction.morale >= 60) {
        actions.push({ type: 'declare_war', targetId: otherId });
        decisionCooldowns.set(faction.id, worldTime + 72);
        return actions;
      }
    }
  }

  // Send trade caravan when flush with cash and at peace
  if (!atWar && faction.treasury >= TRADE_TREASURY_MIN && actions.length === 0) {
    // Find faction with lowest morale to trade with (diplomatic gesture)
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

/** Simple adjacency: treat all territories as potentially adjacent (continent-scale) */
function isAdjacentTerritory(_a: string, _b: string): boolean {
  return true; // Simplified — in a full impl would check map distance
}

/** Apply all strategy actions to a faction states map, returns updated map + list of chronicle summaries */
export function applyFactionStrategyActions(
  factions: Record<string, FactionState>,
  actions: FactionStrategyAction[],
  { declareWar, makePeace, captureTerritory }: {
    declareWar: (f: Record<string, FactionState>, a: string, b: string) => Record<string, FactionState>;
    makePeace: (f: Record<string, FactionState>, a: string, b: string) => Record<string, FactionState>;
    captureTerritory: (f: Record<string, FactionState>, w: string, l: string, loc: string) => Record<string, FactionState>;
  },
): { factions: Record<string, FactionState>; events: Array<{ type: 'war' | 'peace' | 'trade'; summary: string; attacker: string; target: string }> } {
  let current = factions;
  const events: Array<{ type: 'war' | 'peace' | 'trade'; summary: string; attacker: string; target: string }> = [];

  for (const action of actions) {
    if (action.type === 'declare_war') {
      current = declareWar(current, action.targetId.includes('from') ? '' : Object.keys(factions).find(id => factions[id]?.atWarWith !== undefined) ?? '', action.targetId);
      const attacker = Object.values(factions).find(f => {
        const a = actions.find(ac => ac.type === 'declare_war');
        return a ? !f.atWarWith.includes(action.targetId) : false;
      });
      const att = attacker ?? Object.values(factions)[0]!;
      const def = factions[action.targetId];
      if (def) {
        current = declareWar(current, att.id, action.targetId);
        events.push({ type: 'war', summary: `${att.name} declared war on ${def.name}.`, attacker: att.id, target: action.targetId });
      }
    } else if (action.type === 'make_peace') {
      const seeker = Object.values(current).find(f => f.atWarWith.includes(action.targetId));
      if (seeker) {
        current = makePeace(current, seeker.id, action.targetId);
        const other = factions[action.targetId];
        if (other) events.push({ type: 'peace', summary: `${seeker.name} made peace with ${other.name}.`, attacker: seeker.id, target: action.targetId });
      }
    } else if (action.type === 'send_trade_caravan') {
      const from = factions[action.fromId];
      const to = factions[action.toId];
      if (from && to) {
        events.push({ type: 'trade', summary: `${from.name} sent a trade delegation to ${to.name}.`, attacker: action.fromId, target: action.toId });
      }
    } else if (action.type === 'capture_territory') {
      // Find which faction owns the territory
      const loser = Object.values(current).find(f => f.territory.includes(action.locationId));
      const winner = Object.values(current).find(f => f.atWarWith.includes(loser?.id ?? ''));
      if (winner && loser) {
        current = captureTerritory(current, winner.id, loser.id, action.locationId);
        events.push({ type: 'war', summary: `${winner.name} captured ${action.locationId} from ${loser.name}.`, attacker: winner.id, target: loser.id });
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
    const actions = evaluateFactionStrategy(faction, factions, modifiers, worldTime);
    allActions.push(...actions);
  }
  return allActions;
}
