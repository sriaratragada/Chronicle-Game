export type QuestStepType = 'goto' | 'kill' | 'fetch' | 'talk' | 'deliver';

export interface QuestStep {
  type: QuestStepType;
  description: string;
  targetLocation?: string;
  targetEntityKind?: string;
  targetNpcId?: string;
  targetItemId?: string;
  targetQty?: number;
  completed: boolean;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  giverNpcId?: string;
  giverLocation: string;
  steps: QuestStep[];
  rewards: { gold?: number; xp?: number; itemId?: string; itemQty?: number; reputation?: Record<string, number> };
  state: 'active' | 'completed' | 'failed';
  chainNextId?: string;
}

export function createQuest(id: string, title: string, description: string, giverLocation: string, steps: QuestStep[], rewards: Quest['rewards']): Quest {
  return { id, title, description, giverLocation, steps, rewards, state: 'active' };
}

export function getActiveStep(quest: Quest): QuestStep | null {
  return quest.steps.find(s => !s.completed) ?? null;
}

export function advanceQuest(quest: Quest, stepIndex: number): Quest {
  const next = { ...quest, steps: quest.steps.map((s, i) => i === stepIndex ? { ...s, completed: true } : s) };
  if (next.steps.every(s => s.completed)) next.state = 'completed';
  return next;
}

export function failQuest(quest: Quest): Quest {
  return { ...quest, state: 'failed' };
}

// Sample quests generated from world state
export function generateBountyQuest(
  targetName: string,
  targetLocation: string,
  reward: number,
  regionalTags: string[] = [],
): Quest {
  const tag = regionalTags[0] ?? 'routine';
  const flavor =
    tag === 'banditry'
      ? `Trade roads are hot—bandits cluster near ${targetLocation}. `
      : tag === 'border_war'
        ? `Mustering armies draw sellswords; trouble near ${targetLocation}. `
        : tag === 'drought'
          ? `Hungry roads make desperate folk—sightings near ${targetLocation}. `
          : tag === 'storms'
            ? `Harbor delays push smugglers inland toward ${targetLocation}. `
            : '';
  return createQuest(
    `bounty_${targetName}_${Date.now()}`,
    `Hunt: ${targetName}`,
    `${flavor}A bounty has been posted for ${targetName}, last seen near ${targetLocation}.`.trim(),
    targetLocation,
    [
      { type: 'goto', description: `Travel to ${targetLocation}`, targetLocation, completed: false },
      { type: 'kill', description: `Defeat ${targetName}`, targetEntityKind: 'bandit', completed: false },
      { type: 'goto', description: 'Return to the bounty board', targetLocation, completed: false },
    ],
    { gold: reward, xp: 50 },
  );
}

export function createChainedQuest(prev: Quest, next: Quest): Quest {
  return { ...prev, chainNextId: next.id };
}

export function generateFetchQuest(itemName: string, itemId: string, qty: number, giverLocation: string, reward: number): Quest {
  return createQuest(
    `fetch_${itemId}_${Date.now()}`,
    `Gather: ${qty}× ${itemName}`,
    `Collect ${qty} ${itemName} and bring them back.`,
    giverLocation,
    [
      { type: 'fetch', description: `Gather ${qty}× ${itemName}`, targetItemId: itemId, targetQty: qty, completed: false },
      { type: 'goto', description: `Return to ${giverLocation}`, targetLocation: giverLocation, completed: false },
    ],
    { gold: reward, xp: 30 },
  );
}
