import type { GameState, DayNightPhase } from './gameTypes';
import type { SimNpc, NpcJob } from './npcAI';

export type GoalType = 'travel' | 'work' | 'trade' | 'rest' | 'socialize' | 'flee' | 'patrol';

export interface NpcGoal {
  type: GoalType;
  targetLocation?: string;
  targetNpcId?: string;
  priority: number;
  expiresAt?: number;
  reason: string;
}

export function pickTopGoal(goals: NpcGoal[]): NpcGoal | null {
  if (goals.length === 0) return null;
  return goals.reduce((best, g) => g.priority > best.priority ? g : best);
}

function jobBaseGoals(job: NpcJob, homeLocation: string, dayPhase: DayNightPhase): NpcGoal[] {
  const goals: NpcGoal[] = [];
  switch (job) {
    case 'merchant':
      if (dayPhase === 'dawn') goals.push({ type: 'travel', targetLocation: homeLocation, priority: 6, reason: 'Opening trade for the day' });
      else if (dayPhase === 'day' || dayPhase === 'dusk') goals.push({ type: 'trade', targetLocation: homeLocation, priority: 7, reason: 'Conducting trade' });
      else goals.push({ type: 'rest', priority: 5, reason: 'Resting after market hours' });
      break;
    case 'farmer':
      if (dayPhase === 'dawn' || dayPhase === 'day') goals.push({ type: 'work', targetLocation: homeLocation, priority: 7, reason: 'Tending the fields' });
      else if (dayPhase === 'dusk') goals.push({ type: 'socialize', priority: 4, reason: 'Evening in the village' });
      else goals.push({ type: 'rest', priority: 6, reason: 'Sleeping before dawn work' });
      break;
    case 'guard':
      goals.push({ type: 'patrol', targetLocation: homeLocation, priority: 8, reason: 'Standing watch' });
      break;
    case 'sellsword':
      if (dayPhase === 'day' || dayPhase === 'dusk') goals.push({ type: 'patrol', priority: 5, reason: 'Looking for work' });
      else goals.push({ type: 'rest', priority: 4, reason: 'Resting between contracts' });
      break;
    case 'smith':
      if (dayPhase === 'dawn' || dayPhase === 'day') goals.push({ type: 'work', targetLocation: homeLocation, priority: 7, reason: 'Working the forge' });
      else goals.push({ type: 'rest', priority: 5, reason: 'Cooling down after the forge' });
      break;
    case 'innkeeper':
      goals.push({ type: 'work', targetLocation: homeLocation, priority: 8, reason: 'Running the inn' });
      break;
    case 'priest':
      if (dayPhase === 'dawn' || dayPhase === 'dusk') goals.push({ type: 'work', targetLocation: homeLocation, priority: 7, reason: 'Performing rites' });
      else goals.push({ type: 'socialize', priority: 4, reason: 'Tending to the community' });
      break;
    case 'bandit':
      if (dayPhase === 'night' || dayPhase === 'dusk') goals.push({ type: 'patrol', priority: 8, reason: 'Stalking the roads' });
      else goals.push({ type: 'rest', priority: 7, reason: 'Hiding from sight' });
      break;
    case 'noble':
      if (dayPhase === 'day') goals.push({ type: 'socialize', priority: 6, reason: 'Holding court' });
      else if (dayPhase === 'dusk') goals.push({ type: 'socialize', priority: 5, reason: 'Evening entertainments' });
      else goals.push({ type: 'rest', priority: 6, reason: 'Retiring to chambers' });
      break;
    default:
      goals.push({ type: 'work', priority: 3, reason: 'Daily duties' });
  }
  return goals;
}

export function evaluateNpcGoals(npc: SimNpc, state: GameState): NpcGoal[] {
  const { regionalModifiers, dayNightPhase, worldTime } = state;
  const goals: NpcGoal[] = jobBaseGoals(npc.job, npc.homeLocation, dayNightPhase);

  // Crisis overrides — high priority reactive goals
  if (regionalModifiers.banditPressure > 0.5 && (npc.job === 'farmer' || npc.job === 'merchant')) {
    goals.push({ type: 'flee', targetLocation: npc.homeLocation, priority: 10, expiresAt: worldTime + 20, reason: 'Bandits on the roads — seeking safety' });
  }
  if (regionalModifiers.warTension > 0.6 && npc.job === 'sellsword') {
    goals.push({ type: 'patrol', priority: 9, reason: 'War tension — hired sword on edge' });
  }
  if (regionalModifiers.drought > 0.6 && npc.job === 'farmer') {
    goals.push({ type: 'work', targetLocation: npc.homeLocation, priority: 9, reason: 'Drought threatens harvest — working harder' });
  }

  // Filter expired goals
  const valid = goals.filter(g => g.expiresAt === undefined || g.expiresAt > worldTime);
  return valid.sort((a, b) => b.priority - a.priority);
}

/** Describe top goal for use in Gemini prompts */
export function describeTopGoal(goals: NpcGoal[]): string {
  const top = pickTopGoal(goals);
  if (!top) return 'No particular goal right now';
  return top.reason;
}
