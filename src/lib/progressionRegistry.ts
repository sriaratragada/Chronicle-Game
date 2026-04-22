import type { SimEvent } from './gameTypes';

/** Milestone metadata (expand when progression ships). */
export const MILESTONES: Record<string, { id: string; label: string }> = {};

/** Stub: returns no unlocks; future implementation scans `simEventLog` and flags. */
export function evaluateMilestones(_events: SimEvent[], _flags: Record<string, unknown>): string[] {
  return [];
}
