import type { GameState, GameEvent, ChronicleEntry } from './gameTypes';
import type { Quest } from './questSystem';
import { createQuest, generateBountyQuest, generateFetchQuest } from './questSystem';

// ── Quest Synthesis ───────────────────────────────────────────────────────────

export interface QuestTemplate {
  id: string;
  condition: (state: GameState) => boolean;
  generate: (state: GameState) => Quest;
  cooldownTicks: number;
  maxActive: number;
  category: 'faction' | 'npc' | 'crisis' | 'exploration';
}

const AUREDIA_SETTLEMENTS = ['highmarch', 'ashenford', 'saltmoor', 'ironhold', 'graygate', 'crossroads', 'coldpeak'];
const FAR_SETTLEMENTS = ['korrath_citadel', 'vell_harbor', 'sarnak_hold', 'dustfall', 'frostmarch'];

function pickFrom<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length]!;
}

function timeSeed(state: GameState): number {
  return state.tick * 7 + state.worldTime;
}

export const QUEST_TEMPLATES: QuestTemplate[] = [
  // 1. Bandit crisis
  {
    id: 'bandit_crisis',
    condition: s => s.regionalModifiers.banditPressure > 0.55,
    generate: s => generateBountyQuest(
      `Bandit Captain ${pickFrom(['Grimscar', 'Ironteeth', 'Bloodhand', 'Mawkin'], timeSeed(s))}`,
      pickFrom(AUREDIA_SETTLEMENTS, timeSeed(s) + 1),
      80 + Math.floor(s.regionalModifiers.banditPressure * 60),
      ['banditry'],
    ),
    cooldownTicks: 60,
    maxActive: 1,
    category: 'crisis',
  },

  // 2. Drought supply chain
  {
    id: 'drought_supply',
    condition: s => s.regionalModifiers.drought > 0.5,
    generate: s => generateFetchQuest(
      'Bread', 'bread', 5,
      pickFrom(AUREDIA_SETTLEMENTS, timeSeed(s)),
      60 + Math.floor(s.regionalModifiers.drought * 50),
    ),
    cooldownTicks: 80,
    maxActive: 1,
    category: 'crisis',
  },

  // 3. Faction war messenger
  {
    id: 'faction_war_runner',
    condition: s => Object.values(s.factionStates).some(f => f.atWarWith.length > 0),
    generate: s => {
      const dest = pickFrom(FAR_SETTLEMENTS, timeSeed(s));
      return createQuest(
        `war_runner_${s.tick}`,
        'Carry Word to the Front',
        'A faction commander needs urgent dispatches delivered before the siege begins.',
        s.currentLocation,
        [
          { type: 'goto', description: `Travel to ${dest.replace(/_/g, ' ')}`, targetLocation: dest, completed: false },
          { type: 'goto', description: `Return to ${s.currentLocation.replace(/_/g, ' ')}`, targetLocation: s.currentLocation, completed: false },
        ],
        { gold: 90, reputation: { diplomacy: 5, conquest: 3 } },
      );
    },
    cooldownTicks: 70,
    maxActive: 1,
    category: 'faction',
  },

  // 4. Merchant escort
  {
    id: 'merchant_escort',
    condition: s => s.phase === 'playing',
    generate: s => {
      const dest = pickFrom(AUREDIA_SETTLEMENTS, timeSeed(s) + 3);
      return createQuest(
        `escort_${s.tick}`,
        'Escort the Merchant Convoy',
        `A merchant caravan heading to ${dest.replace(/_/g, ' ')} needs a sword arm.`,
        s.currentLocation,
        [
          { type: 'goto', description: `Escort to ${dest.replace(/_/g, ' ')}`, targetLocation: dest, completed: false },
        ],
        { gold: 50 + Math.floor(Math.random() * 40), reputation: { trade: 4 } },
      );
    },
    cooldownTicks: 50,
    maxActive: 2,
    category: 'npc',
  },

  // 5. NPC personal favor (for an NPC with high disposition)
  {
    id: 'npc_personal_favor',
    condition: s => s.npcs.some(n => n.disposition >= 60),
    generate: s => {
      const npc = s.npcs.find(n => n.disposition >= 60) ?? s.npcs[0]!;
      return generateFetchQuest('Wild Herb', 'herb', 3, npc.location, 35);
    },
    cooldownTicks: 90,
    maxActive: 1,
    category: 'npc',
  },

  // 6. Ruin artifact retrieval
  {
    id: 'ruin_intel',
    condition: s => s.visitedLocations.some(l => ['dustfall', 'ruins_of_aether', 'whisper_stones'].includes(l)),
    generate: s => createQuest(
      `ruin_intel_${s.tick}`,
      'Retrieve the Aetherik Fragment',
      'The Remnant Scholarium has commissioned the recovery of an artifact from the old ruins.',
      s.currentLocation,
      [
        { type: 'goto', description: 'Travel to the ruins', targetLocation: 'dustfall', completed: false },
        { type: 'fetch', description: 'Find the artifact fragment', targetItemId: 'void_sigil', targetQty: 1, completed: false },
        { type: 'goto', description: 'Return to the Scholarium contact', targetLocation: 'coldpeak', completed: false },
      ],
      { gold: 120, reputation: { arcane: 10, exploration: 5 }, xp: 80 },
    ),
    cooldownTicks: 120,
    maxActive: 1,
    category: 'exploration',
  },

  // 7. Storm rescue
  {
    id: 'storm_rescue',
    condition: s => s.regionalModifiers.stormSeverity > 0.6,
    generate: s => createQuest(
      `storm_rescue_${s.tick}`,
      'Rescue the Stranded Crew',
      'A fishing vessel was driven ashore by the storms. The crew needs to be found.',
      s.currentLocation,
      [
        { type: 'goto', description: 'Search the coastal village', targetLocation: 'saltmoor', completed: false },
        { type: 'goto', description: 'Return with survivors', targetLocation: s.currentLocation, completed: false },
      ],
      { gold: 65, reputation: { diplomacy: 6, trade: 3 } },
    ),
    cooldownTicks: 90,
    maxActive: 1,
    category: 'crisis',
  },

  // 8. Faction bounty chain (for ally factions)
  {
    id: 'faction_bounty_chain',
    condition: s => Object.values(s.factions).some(v => v >= 20),
    generate: s => {
      const target = `${pickFrom(['Warboss', 'Renegade', 'Deserter'], timeSeed(s))} ${pickFrom(['Krath', 'Vel', 'Morn', 'Sorn'], timeSeed(s) + 5)}`;
      return generateBountyQuest(target, pickFrom(AUREDIA_SETTLEMENTS, timeSeed(s) + 7), 100, ['border_war']);
    },
    cooldownTicks: 80,
    maxActive: 2,
    category: 'faction',
  },

  // 9. Legendary challenge (when reputable)
  {
    id: 'legendary_challenge',
    condition: s => Object.values(s.reputation).some(v => v >= 70),
    generate: s => {
      const dest = pickFrom(['ironhold', 'korrath_citadel', 'goldcrest'], timeSeed(s) + 9);
      return createQuest(
        `legend_challenge_${s.tick}`,
        'The Champion\'s Trial',
        'Word of your deeds has spread. A fortress commander has issued a personal challenge.',
        s.currentLocation,
        [
          { type: 'goto', description: `Travel to ${dest.replace(/_/g, ' ')}`, targetLocation: dest, completed: false },
          { type: 'kill', description: 'Defeat the Champion', targetEntityKind: 'warband', completed: false },
        ],
        { gold: 200, reputation: { conquest: 15, diplomacy: 5 }, xp: 100 },
      );
    },
    cooldownTicks: 150,
    maxActive: 1,
    category: 'exploration',
  },

  // 10. Scholar research errand
  {
    id: 'scholar_research',
    condition: s => s.reputation.arcane >= 20 || s.knownSpells.length > 0,
    generate: s => createQuest(
      `scholar_research_${s.tick}`,
      'Gather Arcane Reagents',
      'The Scholarium needs crystal shards and rare herbs for their research.',
      s.currentLocation,
      [
        { type: 'fetch', description: 'Gather 2 Crystal Shards', targetItemId: 'crystal', targetQty: 2, completed: false },
        { type: 'fetch', description: 'Gather 3 Moonpetal', targetItemId: 'rare_herb', targetQty: 3, completed: false },
        { type: 'goto', description: 'Deliver to Coldpeak', targetLocation: 'coldpeak', completed: false },
      ],
      { gold: 80, reputation: { arcane: 12, craft: 4 } },
    ),
    cooldownTicks: 100,
    maxActive: 1,
    category: 'faction',
  },
];

export function synthesizeQuests(
  state: GameState,
  cooldowns: Record<string, number>,
): { quests: Quest[]; newCooldowns: Record<string, number> } {
  const newQuests: Quest[] = [];
  const newCooldowns = { ...cooldowns };

  for (const template of QUEST_TEMPLATES) {
    // Check cooldown
    if ((cooldowns[template.id] ?? 0) > state.tick) continue;
    // Check max active
    const active = state.quests.filter(q => q.id.startsWith(template.id.split('_')[0]!) && q.state === 'active').length;
    if (active >= template.maxActive) continue;
    // Check condition
    if (!template.condition(state)) continue;

    try {
      const quest = template.generate(state);
      newQuests.push(quest);
      newCooldowns[template.id] = state.tick + template.cooldownTicks;
    } catch {
      // Skip if generation fails
    }
  }

  return { quests: newQuests, newCooldowns };
}

// ── Chronicle Arc Detection ───────────────────────────────────────────────────

export interface ChronicleArc {
  id: string;
  triggerCondition: (state: GameState, chronicle: ChronicleEntry[]) => boolean;
  generate: (state: GameState) => GameEvent;
  cooldownTicks: number;
  category: 'escalation' | 'resolution' | 'revelation' | 'turning_point';
}

function recentChronicleCount(chronicle: ChronicleEntry[], type: string, window = 20): number {
  return chronicle.slice(-window).filter(e => e.type === type).length;
}

export const CHRONICLE_ARCS: ChronicleArc[] = [
  // 1. War Escalation
  {
    id: 'war_escalation',
    category: 'escalation',
    cooldownTicks: 80,
    triggerCondition: (_, chronicle) => recentChronicleCount(chronicle, 'faction', 20) >= 3,
    generate: () => ({
      id: `arc_war_escalation_${Date.now()}`,
      title: 'The Wars Spread',
      narrative: 'Merchants whisper of closed roads and mustered armies. What began as border disputes has grown into something darker. The realm trembles.',
      location: 'graygate',
      oneTime: false,
      choices: [
        { id: 'monitor_war', text: '📜 Study the conflict maps', repEffects: { exploration: 4, diplomacy: 2 }, factionEffects: {}, npcEffects: [], resultText: 'You document the shifting fronts.', chronicleText: 'The traveler studied the spreading wars.', requiresRep: {} },
        { id: 'profit_war', text: '⚔️ Sell your sword to the highest bidder', repEffects: { conquest: 8, trade: 3 }, factionEffects: { iron: 5 }, npcEffects: [], resultText: 'Conflict means coin for those willing to work for it.', chronicleText: 'The traveler took up mercenary work in the wars.' },
        { id: 'seek_peace', text: '🕊️ Seek a neutral ground to broker talks', repEffects: { diplomacy: 12 }, factionEffects: { amber: 8 }, npcEffects: [], resultText: 'The work of peace is harder than war. But you begin.', chronicleText: 'The traveler attempted to broker peace between warring factions.' },
      ],
    }),
  },

  // 2. Legend Recognition
  {
    id: 'legend_recognition',
    category: 'turning_point',
    cooldownTicks: 100,
    triggerCondition: s => Object.values(s.reputation).some(v => v >= 65),
    generate: s => {
      const topAxis = Object.entries(s.reputation).sort(([,a],[,b])=>b-a)[0]!;
      return {
        id: `arc_legend_${Date.now()}`,
        title: 'Word Reaches the Capital',
        narrative: `A sealed message arrives bearing the crest of Highmarch. Word of a traveler — known for their ${topAxis[0]} — has reached the highest courts. They want to meet you.`,
        location: 'highmarch',
        oneTime: false,
        choices: [
          { id: 'accept_summons', text: '👑 Travel to the capital', repEffects: { diplomacy: 10, exploration: 3 }, factionEffects: { amber: 10 }, npcEffects: [], resultText: 'The gates of Highmarch open to you. Your reputation precedes you.', chronicleText: 'The traveler answered the capital\'s summons.' },
          { id: 'ignore_summons', text: '🚶 You answer to no crown', repEffects: { conquest: 5 }, factionEffects: { amber: -8 }, npcEffects: [], resultText: 'You walk on. Let them come to you, if they want you so badly.', chronicleText: 'The traveler ignored the royal summons.' },
        ],
      };
    },
  },

  // 3. Arcane Awakening
  {
    id: 'arcane_awakening',
    category: 'revelation',
    cooldownTicks: 120,
    triggerCondition: s => s.knownSpells.length >= 3 && s.reputation.arcane >= 40,
    generate: () => ({
      id: `arc_arcane_${Date.now()}`,
      title: 'The Scholarium Seeks You',
      narrative: 'A scholar in grey robes intercepts you on the road. "We have been watching your use of the old arts. The Scholarium has a proposal — and a warning."',
      location: 'coldpeak',
      oneTime: false,
      choices: [
        { id: 'join_scholarium', text: '🔮 Hear their proposal', repEffects: { arcane: 15, diplomacy: 5 }, factionEffects: { scholar: 15 }, npcEffects: [], resultText: 'The Scholarium opens its vaults. Ancient scrolls. Lost spells. A seat at their table.', chronicleText: 'The traveler accepted the Scholarium\'s invitation.' },
        { id: 'reject_scholarium', text: '🚫 Decline. Power needs no masters.', repEffects: { arcane: 5, conquest: 3 }, factionEffects: { scholar: -10 }, npcEffects: [], resultText: 'The scholar nods, unsurprised. "We will be watching."', chronicleText: 'The traveler refused the Scholarium.' },
      ],
    }),
  },

  // 4. Drought Famine
  {
    id: 'drought_famine',
    category: 'escalation',
    cooldownTicks: 90,
    triggerCondition: s => s.regionalModifiers.drought > 0.65,
    generate: () => ({
      id: `arc_famine_${Date.now()}`,
      title: 'The Great Famine Spreads',
      narrative: 'Fields lie cracked and grey. The village elders speak of a drought worse than any living memory. Food stores dwindle. Desperation grows.',
      location: 'ashenford',
      oneTime: false,
      choices: [
        { id: 'donate_food', text: '🍞 Give your food stores to the village', repEffects: { diplomacy: 12, trade: 4 }, factionEffects: { green: 15 }, npcEffects: [{ npcId: 'mira', disposition: 25, memory: 'Donated food during the famine' }], resultText: 'Faces light up. It won\'t last — but today, it helps.', chronicleText: 'The traveler donated food stores during the famine.' },
        { id: 'trade_routes', text: '⚖️ Open new trade routes for grain', repEffects: { trade: 15, exploration: 5 }, factionEffects: { amber: 10 }, npcEffects: [], resultText: 'You broker deals with distant granaries. The roads fill with wagons.', chronicleText: 'The traveler established new grain trade routes.' },
        { id: 'profit_famine', text: '💰 Buy cheap. The price will rise.', repEffects: { trade: 8 }, factionEffects: { amber: -5, green: -10 }, npcEffects: [], resultText: 'The numbers work. The looks on their faces do not leave you.', chronicleText: 'The traveler bought drought-cheapened goods.' },
      ],
    }),
  },

  // 5. Bandit Lord Rises
  {
    id: 'bandit_lord',
    category: 'escalation',
    cooldownTicks: 80,
    triggerCondition: s => s.regionalModifiers.banditPressure > 0.7,
    generate: () => ({
      id: `arc_bandit_lord_${Date.now()}`,
      title: 'A Warlord Unites the Brigands',
      narrative: 'The scattered bands are gone. In their place: a unified warband under a cunning leader called the Red Hand. They have taken the north road.',
      location: 'graygate',
      oneTime: false,
      choices: [
        { id: 'hunt_warlord', text: '⚔️ Hunt the Red Hand personally', repEffects: { conquest: 15, exploration: 5 }, factionEffects: { iron: 10 }, npcEffects: [], resultText: 'You track the warlord to their camp. Blood and smoke mark where they fell.', chronicleText: 'The traveler hunted down the Red Hand warlord.' },
        { id: 'negotiate_warlord', text: '🤝 Negotiate. A warlord can be bought.', repEffects: { diplomacy: 10, trade: 5 }, factionEffects: { ashen: 10 }, npcEffects: [], resultText: 'The Red Hand has a price. You pay it. For now, the roads are quiet.', chronicleText: 'The traveler negotiated with the Red Hand.' },
      ],
    }),
  },

  // 6. Faction Collapse
  {
    id: 'faction_collapse',
    category: 'turning_point',
    cooldownTicks: 100,
    triggerCondition: s => Object.values(s.factionStates).some(f => f.armySize < 15 && f.atWarWith.length > 0),
    generate: s => {
      const collapsing = Object.values(s.factionStates).find(f => f.armySize < 15 && f.atWarWith.length > 0);
      return {
        id: `arc_collapse_${Date.now()}`,
        title: `${collapsing?.name ?? 'A Kingdom'} Teeters on the Edge`,
        narrative: `${collapsing?.name ?? 'A kingdom'} is broken. Its armies scattered, its treasury empty. The end of a realm is not thunder — it is silence.`,
        location: 'highmarch',
        oneTime: false,
        choices: [
          { id: 'aid_collapsing', text: '🛡️ Fight for the collapsing faction', repEffects: { conquest: 10, diplomacy: 5 }, factionEffects: { iron: 8 }, npcEffects: [], resultText: 'You stand with the fallen. History will remember you — one way or another.', chronicleText: 'The traveler fought alongside a crumbling kingdom.' },
          { id: 'witness_collapse', text: '👁️ Bear witness', repEffects: { exploration: 4 }, factionEffects: {}, npcEffects: [], resultText: 'You watch. The world changes. You are changed too.', chronicleText: 'The traveler witnessed the fall of a kingdom.' },
        ],
      };
    },
  },

  // 7. Merchant King
  {
    id: 'merchant_king',
    category: 'turning_point',
    cooldownTicks: 120,
    triggerCondition: s => s.milestoneCounters.totalGoldEarned >= 3000,
    generate: () => ({
      id: `arc_merchant_${Date.now()}`,
      title: 'Known Across the Markets',
      narrative: 'The trade guilds have taken notice. Your name is on ledgers in three cities. A guild seat has been offered — an invitation to the inner circle of commerce.',
      location: 'saltmoor',
      oneTime: false,
      choices: [
        { id: 'accept_guild', text: '💰 Accept the guild seat', repEffects: { trade: 20, diplomacy: 5 }, factionEffects: { amber: 20 }, npcEffects: [{ npcId: 'guildmaster_renn', disposition: 30, memory: 'Accepted guild membership' }], resultText: 'A ring pressed into your palm. You are, officially, one of them.', chronicleText: 'The traveler accepted a seat in the Amber Compact trade guild.' },
        { id: 'decline_guild', text: '🚶 You trade alone', repEffects: { trade: 5, conquest: 3 }, factionEffects: { amber: -5 }, npcEffects: [], resultText: 'They nod. Respecting independence more than they expected to.', chronicleText: 'The traveler declined the guild seat.' },
      ],
    }),
  },

  // 8. The Iron March
  {
    id: 'dark_herald',
    category: 'escalation',
    cooldownTicks: 150,
    triggerCondition: s => s.tick >= 400 && s.season === 'dark' && s.reputation.conquest >= 50,
    generate: () => ({
      id: `arc_iron_march_${Date.now()}`,
      title: 'The Iron March Begins',
      narrative: 'Drums in the dark. The Iron Compact moves south — an army in winter. The Long Dark is their season. They have always known it.',
      location: 'ironhold',
      oneTime: false,
      choices: [
        { id: 'join_march', text: '⚔️ March with the Iron Compact', repEffects: { conquest: 20, diplomacy: -5 }, factionEffects: { iron: 25 }, npcEffects: [], resultText: 'Your breath fogs in the cold. Ahead, the army. Behind, everything you\'ve known.', chronicleText: 'The traveler joined the Iron March.' },
        { id: 'oppose_march', text: '🛡️ Oppose the march', repEffects: { diplomacy: 15, conquest: 5 }, factionEffects: { iron: -20, amber: 10, green: 15 }, npcEffects: [], resultText: 'You stand in the road. They will have to go through you.', chronicleText: 'The traveler stood against the Iron March.' },
        { id: 'escape_south', text: '🚶 Head south. Let the north burn.', repEffects: { exploration: 6 }, factionEffects: {}, npcEffects: [], resultText: 'It may not be noble. But it may be wise.', chronicleText: 'The traveler fled south as the Iron March began.' },
      ],
    }),
  },
];

const arcCooldowns = new Map<string, number>();

export function evaluateArcs(state: GameState): GameEvent | null {
  if (state.currentEvent) return null;
  for (const arc of CHRONICLE_ARCS) {
    const cooldown = arcCooldowns.get(arc.id) ?? 0;
    if (state.tick < cooldown) continue;
    if (!arc.triggerCondition(state, state.chronicle)) continue;
    arcCooldowns.set(arc.id, state.tick + arc.cooldownTicks);
    try {
      return arc.generate(state);
    } catch {
      continue;
    }
  }
  return null;
}
