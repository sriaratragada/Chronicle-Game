import type { DayNightPhase } from './gameTypes';
import type { NpcGoal } from './goalSystem';

export type NpcJob = 'farmer' | 'merchant' | 'guard' | 'innkeeper' | 'smith' | 'priest' | 'sellsword' | 'bandit' | 'noble';

export interface SimNpc {
  id: string;
  name: string;
  job: NpcJob;
  homeLocation: string;
  currentLocation: string;
  x: number;
  y: number;
  disposition: number;
  schedule: NpcScheduleEntry[];
  goals: NpcGoal[];
}

export interface NpcScheduleEntry {
  phase: DayNightPhase;
  action: 'work' | 'sleep' | 'wander' | 'travel' | 'guard' | 'trade';
  targetLocation?: string;
}

const DEFAULT_SCHEDULES: Record<NpcJob, NpcScheduleEntry[]> = {
  farmer:    [{ phase: 'dawn', action: 'work' }, { phase: 'day', action: 'work' }, { phase: 'dusk', action: 'wander' }, { phase: 'night', action: 'sleep' }],
  merchant:  [{ phase: 'dawn', action: 'travel' }, { phase: 'day', action: 'trade' }, { phase: 'dusk', action: 'trade' }, { phase: 'night', action: 'sleep' }],
  guard:     [{ phase: 'dawn', action: 'guard' }, { phase: 'day', action: 'guard' }, { phase: 'dusk', action: 'guard' }, { phase: 'night', action: 'guard' }],
  innkeeper: [{ phase: 'dawn', action: 'work' }, { phase: 'day', action: 'work' }, { phase: 'dusk', action: 'work' }, { phase: 'night', action: 'work' }],
  smith:     [{ phase: 'dawn', action: 'work' }, { phase: 'day', action: 'work' }, { phase: 'dusk', action: 'wander' }, { phase: 'night', action: 'sleep' }],
  priest:    [{ phase: 'dawn', action: 'work' }, { phase: 'day', action: 'wander' }, { phase: 'dusk', action: 'work' }, { phase: 'night', action: 'sleep' }],
  sellsword: [{ phase: 'dawn', action: 'wander' }, { phase: 'day', action: 'wander' }, { phase: 'dusk', action: 'wander' }, { phase: 'night', action: 'sleep' }],
  bandit:    [{ phase: 'dawn', action: 'sleep' }, { phase: 'day', action: 'sleep' }, { phase: 'dusk', action: 'wander' }, { phase: 'night', action: 'wander' }],
  noble:     [{ phase: 'dawn', action: 'sleep' }, { phase: 'day', action: 'wander' }, { phase: 'dusk', action: 'wander' }, { phase: 'night', action: 'sleep' }],
};

export function createSimNpc(id: string, name: string, job: NpcJob, location: string, x: number, y: number): SimNpc {
  return {
    id, name, job, homeLocation: location, currentLocation: location, x, y,
    disposition: 0,
    schedule: DEFAULT_SCHEDULES[job] ?? DEFAULT_SCHEDULES.farmer,
    goals: [],
  };
}

export function tickNpc(npc: SimNpc, dayPhase: DayNightPhase): SimNpc {
  const next = { ...npc };

  // Goal-driven behavior takes priority over schedule
  const topGoal = npc.goals[0];
  if (topGoal) {
    switch (topGoal.type) {
      case 'flee':
        next.x += Math.floor(Math.random() * 5) - 2;
        next.y += Math.floor(Math.random() * 5) - 2;
        if (topGoal.targetLocation) next.currentLocation = topGoal.targetLocation;
        return next;
      case 'travel':
        if (topGoal.targetLocation) next.currentLocation = topGoal.targetLocation;
        return next;
      case 'patrol':
        next.x += Math.floor(Math.random() * 5) - 2;
        next.y += Math.floor(Math.random() * 5) - 2;
        return next;
      case 'wander':
      case 'socialize':
        next.x += Math.floor(Math.random() * 3) - 1;
        next.y += Math.floor(Math.random() * 3) - 1;
        return next;
      default:
        break;
    }
  }

  // Fallback to schedule
  const entry = npc.schedule.find(s => s.phase === dayPhase) ?? npc.schedule[0];
  switch (entry?.action) {
    case 'wander':
      next.x += Math.floor(Math.random() * 5) - 2;
      next.y += Math.floor(Math.random() * 5) - 2;
      break;
    case 'travel':
      if (entry.targetLocation) next.currentLocation = entry.targetLocation;
      break;
    default:
      break;
  }

  return next;
}
