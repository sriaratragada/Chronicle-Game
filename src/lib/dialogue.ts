import { INITIAL_NPCS } from './gameData';

export interface DialogueOption {
  id: string;
  text: string;
  requiresRep?: Record<string, number>;
  nextNodeId?: string;
  effects?: {
    reputation?: Record<string, number>;
    faction?: Record<string, number>;
    giveItem?: { itemId: string; qty: number };
    startQuest?: string;
    /** Opens trail inn shop; `npcId` on tree must be the market id (`road_inn_*`). */
    openRoadInnShop?: boolean;
  };
  exitText?: string;
}

export interface DialogueNode {
  id: string;
  speaker: string;
  text: string;
  options: DialogueOption[];
}

export interface DialogueTree {
  npcId: string;
  startNodeId: string;
  nodes: Record<string, DialogueNode>;
}

// Templates for job-based NPCs
export function genericDialogue(npcId: string, name: string, job: string): DialogueTree {
  const greetings: Record<string, string> = {
    farmer: `${name} wipes dirt from their hands. "Aye? What d'you need?"`,
    merchant: `${name} looks up from their ledger. "Buying or selling?"`,
    guard: `${name} adjusts their grip on the spear. "State your business."`,
    innkeeper: `${name} polishes a mug. "Sit down, stranger. What'll it be?"`,
    smith: `${name} sets down the hammer. "Looking for something forged?"`,
  };

  return {
    npcId,
    startNodeId: 'greet',
    nodes: {
      greet: {
        id: 'greet',
        speaker: name,
        text: greetings[job] ?? `${name} regards you quietly.`,
        options: [
          { id: 'ask_news', text: 'What news?', nextNodeId: 'news' },
          { id: 'ask_trade', text: 'Can we trade?', nextNodeId: 'trade' },
          { id: 'leave', text: 'Farewell.', exitText: `${name} nods.` },
        ],
      },
      news: {
        id: 'news',
        speaker: name,
        text: '"Not much happens here that the road doesn\'t bring. Keep your wits about you."',
        options: [
          { id: 'back', text: 'I see. Anything else?', nextNodeId: 'greet' },
          { id: 'leave2', text: 'Thanks. Farewell.', exitText: `${name} returns to their work.` },
        ],
      },
      trade: {
        id: 'trade',
        speaker: name,
        text: job === 'merchant' ? '"Let\'s see what you\'ve got."' : '"I\'m no merchant, but try the market."',
        options: [
          { id: 'back2', text: 'I\'ll look around.', nextNodeId: 'greet' },
          { id: 'leave3', text: 'Thanks.', exitText: `${name} nods.` },
        ],
      },
    },
  };
}

// ── Road Inn identity generation ───────────────────────────────────────────
function innHash(id: string, salt: number): number {
  let h = salt | 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return (Math.abs(h) & 0x7fffffff) / 0x7fffffff;
}

const INN_PREFIXES = [
  'The Ancient', 'The Amber', 'The Dusty', 'The Golden', 'The Iron',
  'The Silent', "The Wanderer's", 'The Broken', 'The Hollow', 'The Black',
  'The Mossy', 'The Crooked', "The Traveler's", 'The Last', 'The Half-Empty',
];
const INN_NOUNS = [
  'Flask', 'Boot', 'Lantern', 'Wheel', 'Mule',
  'Hearth', 'Chalice', 'Kettle', 'Sow', 'Ox',
  'Crown', 'Spur', 'Barrel', 'Crow', 'Coin',
];
const KEEPER_NAMES = [
  'Aldric', 'Marta', 'Desmond', 'Lena', 'Rufus',
  'Orla', 'Gwynn', 'Torben', 'Bessa', 'Cort',
  'Yenna', 'Harwick', 'Sable', 'Ros', 'Edwyn',
];

const INN_GREETINGS = [
  (n: string) => `${n} grunts without looking up. "Ale's two coppers. Don't start trouble."`,
  (n: string) => `${n} waves you over with a warm grin. "Come in! Fire's hot and the stew's fresh."`,
  (n: string) => `${n} eyes you from behind the bar. "Road-worn, are you. Sit down, then."`,
  (n: string) => `${n} sets down a heavy mug. "You look half-dead. What do you need?"`,
  (n: string) => `${n} leans forward conspiratorially. "You chose a good evening to stop. Interesting company tonight."`,
  (n: string) => `${n} offers a slow nod. "This inn's stood forty years. Good beds, no questions asked."`,
  (n: string) => `${n} is scrubbing the bar with a rag. "Stranger. Don't get blood on the floor."`,
  (n: string) => `${n} looks up from the ledger. "Board and bed or just a drink? I don't run charity."`,
];

const INN_RUMORS = [
  '"Merchant caravan rolled through yesterday. Soldiers were three days behind — never a good sign."',
  '"A rider in dark colors stopped last night. Paid in gold, said nothing, left before dawn."',
  '"They say the eastern road is watched. Bandits or toll collectors — hard to tell the difference."',
  '"Had a scholar through last week. Kept asking about old ruins. Tipped well, didn\'t stay."',
  '"The weather\'s wrong for the season. Old Gram says it hasn\'t been this dry since the war."',
  '"Word is a warband broke apart east of here. Dangerous men looking for work. Stay sharp."',
  '"A peddler told me the capital\'s gates were shut last market-day. Something\'s brewing up north."',
  '"There was a fire at a hamlet south of here. Nobody hurt, but the granary\'s gone."',
  '"Three knights rode through last night heading north. No banner. No explanation."',
  '"I\'ve had three caravans skip this road in a fortnight. Something\'s scared the merchants off."',
  '"An old woman came through yesterday. Said the standing stones were humming. Mad, probably."',
  '"Someone paid me to ask travelers if they\'d seen a man with a red scarf. I didn\'t ask why."',
];

export interface InnProfile {
  name: string;
  keeperName: string;
  greeting: string;
  rumor: string;
}

export function getInnProfile(innId: string): InnProfile {
  const h1 = innHash(innId, 1337);
  const h2 = innHash(innId, 2741);
  const h3 = innHash(innId, 9871);
  const h4 = innHash(innId, 5023);
  const h5 = innHash(innId, 7777);

  const name = `${INN_PREFIXES[Math.floor(h1 * INN_PREFIXES.length)]} ${INN_NOUNS[Math.floor(h2 * INN_NOUNS.length)]}`;
  const keeperName = KEEPER_NAMES[Math.floor(h3 * KEEPER_NAMES.length)]!;
  const greetingFn = INN_GREETINGS[Math.floor(h4 * INN_GREETINGS.length)]!;

  return {
    name,
    keeperName,
    greeting: greetingFn(keeperName),
    rumor: INN_RUMORS[Math.floor(h5 * INN_RUMORS.length)]!,
  };
}

/** Trail-side inn: unique name + rumor per location (shop opened via dialogue effect). */
export function roadInnDialogue(innMarketId: string): DialogueTree {
  const p = getInnProfile(innMarketId);
  return {
    npcId: innMarketId,
    startNodeId: 'greet',
    nodes: {
      greet: {
        id: 'greet',
        speaker: p.keeperName,
        text: p.greeting,
        options: [
          {
            id: 'supplies',
            text: 'I need supplies.',
            effects: { openRoadInnShop: true },
            exitText: `${p.keeperName} slides the ledger aside and unlocks the storeroom.`,
          },
          { id: 'news', text: 'What\'s the road saying?', nextNodeId: 'news' },
          { id: 'leave', text: 'Just passing through.', exitText: `"Safe roads, stranger." ${p.keeperName} returns to work.` },
        ],
      },
      news: {
        id: 'news',
        speaker: p.keeperName,
        text: p.rumor,
        options: [
          { id: 'ask_more', text: 'Any other news?', nextNodeId: 'news2' },
          { id: 'back', text: 'Good to know. Supplies?', nextNodeId: 'greet' },
          { id: 'leave2', text: 'Farewell.', exitText: `${p.keeperName} nods once.` },
        ],
      },
      news2: {
        id: 'news2',
        speaker: p.keeperName,
        text: '"That\'s all I know. I keep my ears open and my mouth shut — mostly. Anything else?"',
        options: [
          { id: 'back2', text: 'Let me see your supplies.', nextNodeId: 'greet' },
          { id: 'leave3', text: 'Thank you. Farewell.', exitText: `${p.keeperName} raises a hand in farewell.` },
        ],
      },
    },
  };
}

// Core NPC dialogue trees
export const DIALOGUE_TREES: Record<string, DialogueTree> = {
  mira: {
    npcId: 'mira',
    startNodeId: 'greet',
    nodes: {
      greet: {
        id: 'greet', speaker: 'Mira',
        text: 'Mira looks up from the grain sacks. "Back again? The fields don\'t tend themselves, but I\'ve a moment."',
        options: [
          { id: 'ask_village', text: 'How\'s the village?', nextNodeId: 'village' },
          { id: 'ask_bandits', text: 'Any bandit trouble?', nextNodeId: 'bandits' },
          { id: 'leave', text: 'Just passing through.', exitText: 'Mira returns to her work without a word.' },
        ],
      },
      village: {
        id: 'village', speaker: 'Mira',
        text: '"Ashenford endures. The harvest was thin last season, but we manage. We always manage."',
        options: [
          { id: 'offer_help', text: 'Need any help?', nextNodeId: 'help', effects: { reputation: { diplomacy: 2 } } },
          { id: 'back', text: 'Tell me more.', nextNodeId: 'greet' },
        ],
      },
      bandits: {
        id: 'bandits', speaker: 'Mira',
        text: '"The north road\'s been quiet lately, but I don\'t trust it. They always come back."',
        options: [
          { id: 'volunteer', text: 'I\'ll keep an eye out.', exitText: 'Mira looks grateful. "Be careful."', effects: { reputation: { conquest: 3 } } },
          { id: 'back2', text: 'Anything else?', nextNodeId: 'greet' },
        ],
      },
      help: {
        id: 'help', speaker: 'Mira',
        text: '"If you\'re handy, we could use wood for fence repairs. Bring me 5 and I\'ll make it worth your while."',
        options: [
          { id: 'accept_quest', text: 'Consider it done.', exitText: 'Mira nods firmly. "I\'ll be here."', effects: { startQuest: 'mira_fence_repair' } },
          { id: 'decline', text: 'Maybe later.', exitText: '"Suit yourself."' },
        ],
      },
    },
  },
  innkeeper_bryn: genericDialogue('innkeeper_bryn', 'Bryn', 'innkeeper'),
  guildmaster_renn: genericDialogue('guildmaster_renn', 'Guildmaster Renn', 'merchant'),
};

function jobFromNpcTitle(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('guild') || t.includes('broker')) return 'merchant';
  if (t.includes('captain') || t.includes('watch') || t.includes('sergeant') || t.includes('commander')) return 'guard';
  if (t.includes('innkeeper') || t.includes('inn')) return 'innkeeper';
  if (t.includes('archivist') || t.includes('astronomer')) return 'merchant';
  return 'farmer';
}

export function getDialogueTree(npcId: string): DialogueTree | undefined {
  if (DIALOGUE_TREES[npcId]) return DIALOGUE_TREES[npcId];
  const n = INITIAL_NPCS.find(x => x.id === npcId);
  if (!n) return undefined;
  return genericDialogue(npcId, n.name, jobFromNpcTitle(n.title));
}
