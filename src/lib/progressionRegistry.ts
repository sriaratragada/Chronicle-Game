import type { GameState, Reputation } from './gameTypes';
import type { SkillTree } from './skills';

export interface MilestoneReward {
  gold?: number;
  skillXp?: { skill: keyof SkillTree; amount: number };
  repBoost?: Partial<Reputation>;
  text: string;
}

export interface MilestoneDefinition {
  id: string;
  label: string;
  description: string;
  category: 'explorer' | 'warrior' | 'merchant' | 'craftsman' | 'diplomat' | 'scholar' | 'survivor';
  icon: string;
  reward: MilestoneReward;
  check: (state: GameState) => boolean;
}

export const MILESTONE_LIST: MilestoneDefinition[] = [
  // --- Explorer ---
  {
    id: 'first_steps', label: 'First Steps', description: 'Visit 3 different locations.',
    category: 'explorer', icon: '🗺️',
    reward: { gold: 15, text: '+15 gold' },
    check: s => s.visitedLocations.length >= 3,
  },
  {
    id: 'wayfarer', label: 'Wayfarer', description: 'Visit 7 different locations.',
    category: 'explorer', icon: '🧭',
    reward: { gold: 30, repBoost: { exploration: 5 }, text: '+30 gold, +5 exploration' },
    check: s => s.visitedLocations.length >= 7,
  },
  {
    id: 'realm_walker', label: 'Realm Walker', description: 'Visit 15 different locations.',
    category: 'explorer', icon: '🌍',
    reward: { gold: 80, repBoost: { exploration: 10 }, text: '+80 gold, +10 exploration' },
    check: s => s.visitedLocations.length >= 15,
  },
  {
    id: 'night_traveler', label: 'Night Traveler', description: 'Survive 200 game ticks.',
    category: 'explorer', icon: '🌙',
    reward: { gold: 20, text: '+20 gold' },
    check: s => s.tick >= 200,
  },
  {
    id: 'veteran', label: 'Veteran', description: 'Survive 600 game ticks.',
    category: 'explorer', icon: '⏳',
    reward: { gold: 60, skillXp: { skill: 'diplomacy', amount: 50 }, text: '+60 gold, +50 diplomacy XP' },
    check: s => s.tick >= 600,
  },

  // --- Warrior ---
  {
    id: 'first_blood', label: 'First Blood', description: 'Kill your first enemy.',
    category: 'warrior', icon: '⚔️',
    reward: { gold: 10, skillXp: { skill: 'combat', amount: 20 }, text: '+10 gold, +20 combat XP' },
    check: s => s.milestoneCounters.totalKills >= 1,
  },
  {
    id: 'hunter', label: 'Hunter', description: 'Kill 10 enemies.',
    category: 'warrior', icon: '🗡️',
    reward: { gold: 25, repBoost: { conquest: 5 }, text: '+25 gold, +5 conquest' },
    check: s => s.milestoneCounters.totalKills >= 10,
  },
  {
    id: 'slayer', label: 'Slayer', description: 'Kill 50 enemies.',
    category: 'warrior', icon: '💀',
    reward: { gold: 80, repBoost: { conquest: 10 }, skillXp: { skill: 'combat', amount: 100 }, text: '+80 gold, +10 conquest, +100 combat XP' },
    check: s => s.milestoneCounters.totalKills >= 50,
  },
  {
    id: 'warlord', label: 'Warlord', description: 'Kill 150 enemies.',
    category: 'warrior', icon: '🏹',
    reward: { gold: 200, repBoost: { conquest: 20 }, skillXp: { skill: 'combat', amount: 250 }, text: '+200 gold, +20 conquest, +250 combat XP' },
    check: s => s.milestoneCounters.totalKills >= 150,
  },
  {
    id: 'dungeon_delver', label: 'Dungeon Delver', description: 'Complete a dungeon run.',
    category: 'warrior', icon: '🕳️',
    reward: { gold: 40, skillXp: { skill: 'combat', amount: 60 }, text: '+40 gold, +60 combat XP' },
    check: s => s.milestoneCounters.totalDungeonsCleared >= 1,
  },
  {
    id: 'cave_lord', label: 'Cave Lord', description: 'Complete 5 dungeon runs.',
    category: 'warrior', icon: '🐉',
    reward: { gold: 120, repBoost: { conquest: 15 }, skillXp: { skill: 'combat', amount: 150 }, text: '+120 gold, +15 conquest, +150 combat XP' },
    check: s => s.milestoneCounters.totalDungeonsCleared >= 5,
  },

  // --- Merchant ---
  {
    id: 'coin_touched', label: 'Coin Touched', description: 'Earn 100 gold from kills and sales.',
    category: 'merchant', icon: '🪙',
    reward: { gold: 15, text: '+15 gold' },
    check: s => s.milestoneCounters.totalGoldEarned >= 100,
  },
  {
    id: 'trader', label: 'Trader', description: 'Earn 500 gold from kills and sales.',
    category: 'merchant', icon: '💰',
    reward: { gold: 50, repBoost: { trade: 5 }, text: '+50 gold, +5 trade' },
    check: s => s.milestoneCounters.totalGoldEarned >= 500,
  },
  {
    id: 'merchant_prince', label: 'Merchant Prince', description: 'Earn 2000 gold from kills and sales.',
    category: 'merchant', icon: '👑',
    reward: { gold: 200, repBoost: { trade: 15 }, skillXp: { skill: 'diplomacy', amount: 100 }, text: '+200 gold, +15 trade, +100 diplomacy XP' },
    check: s => s.milestoneCounters.totalGoldEarned >= 2000,
  },
  {
    id: 'market_regular', label: 'Market Regular', description: 'Make 15 trade transactions.',
    category: 'merchant', icon: '🏪',
    reward: { gold: 25, repBoost: { trade: 3 }, text: '+25 gold, +3 trade' },
    check: s => s.milestoneCounters.totalTradeTransactions >= 15,
  },
  {
    id: 'deal_maker', label: 'Deal Maker', description: 'Make 50 trade transactions.',
    category: 'merchant', icon: '🤝',
    reward: { gold: 80, repBoost: { trade: 10 }, skillXp: { skill: 'diplomacy', amount: 75 }, text: '+80 gold, +10 trade, +75 diplomacy XP' },
    check: s => s.milestoneCounters.totalTradeTransactions >= 50,
  },

  // --- Craftsman ---
  {
    id: 'tinkerer', label: 'Tinkerer', description: 'Craft 5 items.',
    category: 'craftsman', icon: '🔨',
    reward: { skillXp: { skill: 'crafting', amount: 30 }, text: '+30 crafting XP' },
    check: s => s.milestoneCounters.totalItemsCrafted >= 5,
  },
  {
    id: 'artisan', label: 'Artisan', description: 'Craft 20 items.',
    category: 'craftsman', icon: '⚒️',
    reward: { gold: 30, skillXp: { skill: 'crafting', amount: 80 }, repBoost: { craft: 5 }, text: '+30 gold, +80 crafting XP, +5 craft' },
    check: s => s.milestoneCounters.totalItemsCrafted >= 20,
  },
  {
    id: 'master_crafter', label: 'Master Crafter', description: 'Craft 50 items.',
    category: 'craftsman', icon: '🛠️',
    reward: { gold: 80, skillXp: { skill: 'crafting', amount: 200 }, repBoost: { craft: 15 }, text: '+80 gold, +200 crafting XP, +15 craft' },
    check: s => s.milestoneCounters.totalItemsCrafted >= 50,
  },
  {
    id: 'forger', label: 'Forger', description: 'Reach crafting skill level 5.',
    category: 'craftsman', icon: '⚙️',
    reward: { gold: 50, repBoost: { craft: 10 }, text: '+50 gold, +10 craft' },
    check: s => s.skills.crafting.level >= 5,
  },

  // --- Diplomat ---
  {
    id: 'first_ally', label: 'First Ally', description: 'Reach +20 standing with any faction.',
    category: 'diplomat', icon: '🤲',
    reward: { gold: 20, repBoost: { diplomacy: 5 }, text: '+20 gold, +5 diplomacy' },
    check: s => Object.values(s.factions).some(v => v >= 20),
  },
  {
    id: 'politically_minded', label: 'Politically Minded', description: 'Reach 25 in any reputation axis.',
    category: 'diplomat', icon: '📜',
    reward: { gold: 30, repBoost: { diplomacy: 8 }, text: '+30 gold, +8 diplomacy' },
    check: s => Object.values(s.reputation).some(v => v >= 25),
  },
  {
    id: 'well_regarded', label: 'Well Regarded', description: 'Reach 50 in any reputation axis.',
    category: 'diplomat', icon: '🌟',
    reward: { gold: 75, repBoost: { diplomacy: 15 }, text: '+75 gold, +15 diplomacy' },
    check: s => Object.values(s.reputation).some(v => v >= 50),
  },
  {
    id: 'legend_dip', label: 'Legend', description: 'Reach 80 in any reputation axis.',
    category: 'diplomat', icon: '🏆',
    reward: { gold: 150, repBoost: { diplomacy: 20 }, skillXp: { skill: 'diplomacy', amount: 200 }, text: '+150 gold, +20 diplomacy, +200 diplomacy XP' },
    check: s => Object.values(s.reputation).some(v => v >= 80),
  },

  // --- Scholar ---
  {
    id: 'student', label: 'Student', description: 'Reach level 3 in any skill.',
    category: 'scholar', icon: '📚',
    reward: { gold: 15, text: '+15 gold' },
    check: s => Object.values(s.skills).some(b => b.level >= 3),
  },
  {
    id: 'adept', label: 'Adept', description: 'Reach level 6 in any skill.',
    category: 'scholar', icon: '🎓',
    reward: { gold: 50, text: '+50 gold' },
    check: s => Object.values(s.skills).some(b => b.level >= 6),
  },
  {
    id: 'master_skill', label: 'Master', description: 'Reach level 8 in any skill.',
    category: 'scholar', icon: '🏅',
    reward: { gold: 100, text: '+100 gold' },
    check: s => Object.values(s.skills).some(b => b.level >= 8),
  },
  {
    id: 'renaissance', label: 'Renaissance', description: 'Reach level 3 in all four skills.',
    category: 'scholar', icon: '✨',
    reward: { gold: 120, repBoost: { arcane: 10 }, text: '+120 gold, +10 arcane' },
    check: s => s.skills.combat.level >= 3 && s.skills.stealth.level >= 3 && s.skills.diplomacy.level >= 3 && s.skills.crafting.level >= 3,
  },

  // --- Survivor ---
  {
    id: 'adventurer', label: 'Adventurer', description: 'Complete 5 quests.',
    category: 'survivor', icon: '📋',
    reward: { gold: 50, repBoost: { diplomacy: 5 }, text: '+50 gold, +5 diplomacy' },
    check: s => s.quests.filter(q => q.state === 'completed').length >= 5,
  },
  {
    id: 'champion', label: 'Champion', description: 'Complete 15 quests.',
    category: 'survivor', icon: '🛡️',
    reward: { gold: 150, repBoost: { conquest: 10, diplomacy: 10 }, skillXp: { skill: 'combat', amount: 200 }, text: '+150 gold, +10 conquest & diplomacy, +200 combat XP' },
    check: s => s.quests.filter(q => q.state === 'completed').length >= 15,
  },
];

export const MILESTONES: Record<string, MilestoneDefinition> = Object.fromEntries(
  MILESTONE_LIST.map(m => [m.id, m])
);

/** Returns ids of milestones that should now be unlocked but aren't yet in `state.milestonesUnlocked`. */
export function evaluateMilestones(state: GameState): string[] {
  const already = new Set(state.milestonesUnlocked);
  return MILESTONE_LIST.filter(m => !already.has(m.id) && m.check(state)).map(m => m.id);
}
