import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';

interface CodexChapter {
  id: string;
  title: string;
  icon: string;
  sections: { heading: string; body: string }[];
}

const CHAPTERS: CodexChapter[] = [
  {
    id: 'lore',
    title: 'World Lore',
    icon: '🌍',
    sections: [
      {
        heading: 'The World of Aethermoor',
        body: `Aethermoor is a fractured continent forged from three great landmasses — Auredia, Trivalen, and Uloren — each scarred by centuries of war, trade, and forgotten magic. The world does not pause for heroes. Caravans roll, harvests fail, and factions rise and fall whether you act or not.`,
      },
      {
        heading: 'Auredia — The Green Realm',
        body: `The westernmost continent, blanketed in deep forest and farmland. Ruled by the Amber Compact of trade-lords from the city of Highmarch. The Iron Compact — soldiers and smiths — garrisons the interior. The Green Covenant tends the ancient forests and the ley-lines beneath them. Ashenford sits at the heart of Auredia, a crossroads town where most travelers begin their chronicle.`,
      },
      {
        heading: 'Trivalen — The Merchant Sea',
        body: `A warm, fractious continent of port cities and desert trade routes. The Tide Brotherhood dominates the harbors. Vell Harbor is its jewel — a city where fortunes are made and throats are slit with equal efficiency. The interior is dry badlands patrolled by Sarnak raiders.`,
      },
      {
        heading: 'Uloren — The Iron North',
        body: `Korrath's domain. Cold, mineral-rich, and fiercely independent. The Korrath Citadel controls the deep mines of Deepmine and Frostmarch. Scholars from the Order of Scholars make pilgrimages here seeking ruins of a civilization that predates all three current kingdoms.`,
      },
      {
        heading: 'The Factions',
        body: `Six factions vie for influence across Aethermoor:\n\n• Amber Compact — Traders and merchants. High standing = cheaper prices.\n• Iron Compact — Soldiers and smiths. High standing = bonus combat XP.\n• Green Covenant — Druids and farmers. High standing = extra resource yields.\n• Order of Scholars — Arcane researchers. High standing = arcane XP bonuses.\n• Ashen Brotherhood — Smugglers and thieves. Standing affects black market access.\n• Tide Brotherhood — Sailors and pirates. Standing affects sea travel and rare goods.`,
      },
      {
        heading: 'The Chronicle',
        body: `Every significant act you take is recorded in the Chronicle — your personal history in this world. Seasons pass, battles are fought, and trades are struck. When you die, the Chronicle remains as the epitaph of your journey. Some say the Chronicle itself shapes the world — that written history bleeds into the land's memory.`,
      },
    ],
  },
  {
    id: 'basics',
    title: 'Basic Instructions',
    icon: '📋',
    sections: [
      {
        heading: 'Getting Started',
        body: `You begin in Ashenford with bare hands, a waterskin, a tent kit, a realm map, and this codex. Your first priority is to gather wood and craft a weapon — bare hands deal very little damage.\n\n1. Walk near a tree and press E to gather wood.\n2. Gather 3 wood, then open Crafting (K) to craft a Wooden Club.\n3. Equip the club from your Inventory (I).\n4. Hunt an animal — face it and press J to attack.`,
      },
      {
        heading: 'Health & Hunger',
        body: `Your health bar (red) decreases when enemies attack you. Your hunger bar (orange/yellow) drains slowly over time. If hunger reaches zero, health begins to drain.\n\nTo restore hunger: cook raw meat (from hunting) at a campfire or using a Portable Stove. Berries restore a small amount immediately. Cooked Meat is your primary food source early on.`,
      },
      {
        heading: 'Survival Priority Order',
        body: `Early game priority:\n1. Make a weapon (wooden club from 3 wood)\n2. Hunt for food (deer, sheep, rabbit)\n3. Cook meat (campfire or portable stove)\n4. Gather resources (wood, stone, iron ore)\n5. Craft better equipment\n6. Explore settlements and take quests`,
      },
      {
        heading: 'Death & Consequence',
        body: `If your health reaches zero, the game ends and your Chronicle is displayed in full. There is no respawn. Each run is a new Chronicle. Choose your battles carefully — a wolf pack or bandit warband can kill an unprepared traveler in seconds.`,
      },
    ],
  },
  {
    id: 'navigation',
    title: 'Navigation & Travel',
    icon: '🧭',
    sections: [
      {
        heading: 'Movement',
        body: `Move with WASD or Arrow Keys. Hold the key to walk continuously. On horseback, movement speed doubles. In Admin Mode (activated with G on the title screen), movement is 8× speed and all terrain is passable.`,
      },
      {
        heading: 'The Realm Map',
        body: `Press M or use the Realm Atlas from your hotbar (E) to open the detailed world map. It shows named settlements, cave systems, hamlets, and roads. The fog of war clears as you explore — visited locations remain visible forever.`,
      },
      {
        heading: 'Fast Travel',
        body: `Open the Fast Travel panel (T key or the travel button in the overlay) to jump directly to any previously-visited settlement. Travel costs time (ticks) and hunger proportional to distance. In Admin Mode, all locations are available regardless of whether you've visited them.`,
      },
      {
        heading: 'Location Discovery',
        body: `Named settlements appear on your map when you get close. Hamlets are smaller — they show on the Realm Atlas but don't count as major locations. Cave entrances appear as teal hexagons on the world map and can be entered for dungeon runs.`,
      },
      {
        heading: 'Off-Screen Arrows',
        body: `Small directional arrows appear at the edges of your screen pointing toward:\n• Named settlements (white/gold arrows)\n• Wilderness POIs like ruins, chapels, and lairs (colored arrows)\n\nFollow these arrows to discover points of interest you cannot yet see.`,
      },
      {
        heading: 'The Minimap',
        body: `The minimap in the bottom-right corner shows a zoomed-out view of your local area. It updates in real-time as you move. Use it for orientation when exploring unfamiliar territory.`,
      },
    ],
  },
  {
    id: 'kingdoms',
    title: 'Continents & Kingdoms',
    icon: '🏰',
    sections: [
      {
        heading: 'Auredia — Key Locations',
        body: `• Ashenford — Starting town. Traders, a quest board, basic merchants.\n• Highmarch — Largest city in Auredia. Amber Compact headquarters. Best market prices.\n• Ironhold — Iron Compact fortress. Best smithed weapons and armor.\n• Crossroads — Junction hamlet. Caravans pass through constantly.\n• Saltmoor — Coastal village. Salt exports and tide routes.\n• Graygate — Mountain pass town. Access to Uloren trade.\n• Thornwick — Forest settlement. Green Covenant ties. Herbs abundant.\n• Goldcrest — Prosperous mining town. Iron ore surplus.`,
      },
      {
        heading: 'Trivalen — Key Locations',
        body: `• Vell Harbor — Largest port. Best trade good prices. Tide Brotherhood stronghold.\n• Sunfield — Agricultural hub. Grain, salt, and spice.\n• Coral Cove — Fishing village and smuggler haven.\n• Badlands — Harsh interior. Sarnak raiders patrol. High risk, high reward.\n• Marshend — Swamp village. Herbs and rare reagents.`,
      },
      {
        heading: 'Uloren — Key Locations',
        body: `• Korrath Citadel — Iron north capital. Military presence heavy. Best iron and steel.\n• Deepmine — Deep ore veins. Dungeon access.\n• Frostmarch — Northernmost outpost. Cold and hostile.\n• Dustfall — Desert crossing. Caravans and mercenaries.\n• Dustplain — Open steppe. Little shelter.\n• Windridge — Scholar outpost. Scrolls and arcane knowledge.`,
      },
      {
        heading: 'Kingdom Simulation',
        body: `The four kingdoms (Auredia Crown, Korrath, Vell, and Sarnak) simulate ongoing conflict independent of the player. Territories expand and contract based on military power, trade wealth, and diplomatic relations. Chronicle entries report major kingdom events. Your faction standing can influence kingdom dynamics through your choices.`,
      },
    ],
  },
  {
    id: 'resources',
    title: 'Resources & Gathering',
    icon: '⛏️',
    sections: [
      {
        heading: 'World Resources',
        body: `Five resource types appear as entities on the world map:\n\n• Trees (green canopy) — Press E to gather Wood. Used in nearly every crafting recipe.\n• Rocks (grey boulders) — Press E to mine Stone. Used for construction and tools.\n• Iron Nodes (brown-orange streaks) — Press E to mine Iron Ore. Requires a Pickaxe for full yield.\n• Herb Patches (small green plants) — Press E to gather Herbs. Used in cooking and alchemy.\n• Berry Bushes (small red berries) — Press E to pick Berries. Instant minor food restoration.`,
      },
      {
        heading: 'Green Covenant Bonus',
        body: `If your faction standing with the Green Covenant is 50 or higher, gathering from herb patches and berry bushes yields one extra item. The Green Covenant values careful stewardship of natural resources.`,
      },
      {
        heading: 'Animal Hunting',
        body: `Deer, sheep, and rabbit can be killed for Raw Meat and Leather. Face the animal and press J to attack. They do not fight back.\n\n• Deer — 2 raw meat, 1 leather\n• Sheep — 1 raw meat, 2 cloth\n• Rabbit — 1 raw meat\n\nWolves and bears drop leather when killed but actively fight back. Approach with caution.`,
      },
      {
        heading: 'Cooking & Food',
        body: `Raw Meat must be cooked before it provides meaningful nutrition. Find a campfire near a settlement, or craft and use a Portable Stove (requires Portable Stove in inventory + Cooking skill).\n\nOpen the Crafting panel (K) when near a cooking fire to see available recipes. Cooked Meat restores 25 hunger. Spiced Meat (with salt) restores 40.`,
      },
    ],
  },
  {
    id: 'combat',
    title: 'Combat & Skills',
    icon: '⚔️',
    sections: [
      {
        heading: 'Overworld Combat (J key)',
        body: `Press J to strike the nearest enemy within 3 tiles. Your character faces the last direction you moved. Enemies in front take priority; if none are ahead, the closest enemy is hit instead.\n\nDamage = (Weapon base + Combat level × 1.5) × perk multipliers.`,
      },
      {
        heading: 'Turn-Based Battle',
        body: `Bandits and warbands trigger a turn-based battle screen when adjacent. You have four actions:\n• Strike — Deal full weapon damage\n• Power Strike — Deal 150% damage (costs extra action economy)\n• Guard — Reduce next enemy hit by 50%\n• Flee — 60% chance to escape, consuming a turn`,
      },
      {
        heading: 'Dungeon Combat',
        body: `Inside cave dungeons, combat is real-time bump-based. Walk into an enemy to attack. Each enemy type has its own cooldown. Clear all enemies to unlock the dungeon exit reward.`,
      },
      {
        heading: 'Skill Tree',
        body: `Press K to open the Skills panel. Six skill trees:\n• Combat — Increases damage per level. Perks: Power Strike, Berserker (damage below 30% HP), Thick Skin (+3 armor).\n• Crafting — Increases recipe success. Perks: Efficient Craft (20% free material chance), Master Smith.\n• Stealth — Reduces enemy aggro radius. Perks: Light Foot (−35% aggro), Shadow Walk.\n• Diplomacy — Improves NPC reactions. Perks: Silver Tongue (−10% buy prices), Reputation Bonus (×1.5 rep gains).\n• Survival — Slows hunger decay. Perks: Iron Stomach, Forager.\n• Arcane — Unlocks spell casting. Perks: Mana Well, Alchemist (×1.5 potion effects).`,
      },
      {
        heading: 'Arcane Magic',
        body: `Find spell scrolls from merchants, quest rewards, or dungeon chests. Use a scroll to learn the spell permanently. Cast spells from the Arcane panel (U key).\n\n• Flame Bolt — Damages an enemy in overworld or battle.\n• Mend — Restores 25 HP.\n• Shadow Step — Teleports you 14 tiles in your facing direction.\n• Reveal — Clears fog of war in a 200-tile radius.\n• Tremor — Damages all enemies in a wide radius.`,
      },
    ],
  },
  {
    id: 'economy',
    title: 'Trade & Economy',
    icon: '🪙',
    sections: [
      {
        heading: 'Markets',
        body: `Every major settlement has a market. Open a shop by pressing E near a merchant NPC. Prices fluctuate based on regional supply and demand — a region producing surplus grain will sell it cheaply but pay well for iron.`,
      },
      {
        heading: 'Trade Routes',
        body: `The most profitable trading strategy is to find surplus goods in one region (low buy price) and sell them in a region with a deficit (high sell price). Use the Chronicle's market intelligence reports to track price movements over time.`,
      },
      {
        heading: 'Caravans',
        body: `Merchant caravans travel between settlements autonomously. You can escort caravans for payment — stand near a caravan and accept the escort quest. When the caravan reaches its destination, payment is made automatically.`,
      },
      {
        heading: 'Faction Discounts',
        body: `• Amber Compact standing ≥ 1: Purchase prices reduced up to 8% (scales with standing).\n• Silver Tongue perk: Additional −10% on all purchases.\n• Both bonuses stack for significant savings.`,
      },
      {
        heading: 'Gold & Wealth',
        body: `Gold is earned from: quest rewards, selling goods, escort jobs, looting bandits, and finding coins in dungeons. Gold coin items in your inventory can be spent directly. Quest reward gold is added to your gold total.`,
      },
    ],
  },
  {
    id: 'quests',
    title: 'Quests & Progression',
    icon: '📜',
    sections: [
      {
        heading: 'Quest Types',
        body: `Quests are generated dynamically based on your location, faction, and reputation. Four step types:\n\n• Goto — Travel to a specific location.\n• Kill — Defeat a certain number of enemy types.\n• Fetch — Gather or carry a specific item (auto-completes when you have enough).\n• Talk — Speak to a specific NPC (walk near them and press E).\n• Deliver — Carry an item to a destination.`,
      },
      {
        heading: 'Quest Rewards',
        body: `Completing a quest grants:\n• Gold (added directly to your gold total)\n• XP (distributed to the relevant skill)\n• Items (added to inventory)\n• Faction reputation changes\n\nA toast notification confirms completion. Check your Chronicle for a full record.`,
      },
      {
        heading: 'Bounty Boards',
        body: `Major settlements have bounty boards offering kill and delivery contracts. These refresh over time. They are one of the most reliable sources of income early on.`,
      },
      {
        heading: 'Reputation System',
        body: `Six reputation axes track your overall character:\n• Conquest, Trade, Craft, Diplomacy, Exploration, Arcane\n\nHigh conquest rep unlocks warrior titles. High trade rep unlocks merchant titles. Reputation gates certain events and dialogue options.`,
      },
      {
        heading: 'Milestones',
        body: `Milestones are one-time achievements that permanently alter your title or grant bonuses:\n• First kill, first dungeon cleared, 100 gold earned, 10 items crafted, etc.\n\nCheck your Character panel (P) to see current milestones and counters.`,
      },
      {
        heading: 'The Chronicle Arc',
        body: `Every 200 ticks or so, a major Chronicle arc event fires — a turning point in your story. These events reflect the state of the world at that moment: kingdom wars, faction power shifts, or environmental changes. They are permanent entries in your Chronicle.`,
      },
    ],
  },
  {
    id: 'housing',
    title: 'Camps & Housing',
    icon: '⛺',
    sections: [
      {
        heading: 'Tent & Camp',
        body: `Use a Tent Kit from your hotbar (press E with it selected) on open ground to pitch a camp. A camp gives you:\n• A Camp Stash — a separate shared inventory for long-term storage.\n• A cooking fire for preparing food nearby.`,
      },
      {
        heading: 'Camp Stash',
        body: `The camp stash persists between sessions (if you save). Use it to store excess resources, trade goods, and equipment you are not currently using. Access the stash from within camp range by pressing E near the campfire.`,
      },
      {
        heading: 'Housing (Future)',
        body: `The housing system allows you to build permanent structures in settlements you have high standing with. Crafting benches, storage, and quest boards can be built. This system expands as your reputation grows.`,
      },
    ],
  },
  {
    id: 'tips',
    title: 'Tips & Secrets',
    icon: '💡',
    sections: [
      {
        heading: 'Early Game Tips',
        body: `• Always keep at least 1 Cooked Meat in your hotbar before leaving a settlement.\n• Avoid warbands (groups of 3+ red figures) until you have iron equipment.\n• Wolves will chase you if you walk too close — keep your distance until you have a decent weapon.\n• The first cave you enter will match your current continent's dungeon theme.`,
      },
      {
        heading: 'Combat Tips',
        body: `• Guard (in battle) before enemy strikes you are not confident you can survive.\n• The Berserker perk makes you deal +30% damage below 30% HP — risky but powerful.\n• Shadow Step lets you escape combat by teleporting away — learn it early.\n• Bandits drop gold and misc items. Warbands drop more. Caravans drop trade goods.`,
      },
      {
        heading: 'Economy Tips',
        body: `• Salt is cheap in coastal towns and expensive inland. A few stacks pay for full iron armor.\n• Escort every caravan you find early — easy gold for just walking nearby.\n• Upgrade to Amber Compact standing as fast as possible for the buy price reduction.`,
      },
      {
        heading: 'Hidden Mechanics',
        body: `• Seasons affect terrain and market prices. Winter (dark) makes food scarce and expensive.\n• Enemy aggro radii shrink with Light Foot perk — you can slip past wolves at night.\n• Shadow Step can be used out of combat to quickly cross rivers or mountains.\n• The Reveal spell is invaluable for scouting dungeon layouts before entering.`,
      },
      {
        heading: 'Admin Mode',
        body: `Press G on the title screen to toggle Admin Mode. This gives:\n• 8× movement speed (works on all terrain — mountains, water, etc.)\n• All settlement fast-travel locations available regardless of discovery\n• A green ⚡ ADMIN badge in the top-right during gameplay\n\nAdmin Mode resets each session (you must press G again after returning to the title screen).`,
      },
    ],
  },
];

function CodexPanel() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const [activeChapter, setActiveChapter] = useState('lore');

  if (overlay !== 'codex') return null;

  const chapter = CHAPTERS.find(c => c.id === activeChapter) ?? CHAPTERS[0];

  return (
    <AnimatePresence>
      <motion.div
        key="codex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 z-50 flex bg-ink/97 backdrop-blur-md overflow-hidden pointer-events-auto"
      >
        {/* Sidebar — table of contents */}
        <div className="w-52 flex-shrink-0 border-r border-gold/15 flex flex-col overflow-y-auto">
          <div className="px-4 py-5 border-b border-gold/15">
            <p className="font-display text-base text-gold gold-glow tracking-wider">📖 Realm Codex</p>
            <p className="font-mono text-[9px] text-mist/40 mt-1">Chronicle of Aethermoor</p>
          </div>
          <nav className="flex-1 py-2">
            {CHAPTERS.map(ch => (
              <button
                key={ch.id}
                onClick={() => setActiveChapter(ch.id)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors cursor-pointer ${
                  ch.id === activeChapter
                    ? 'bg-gold/10 border-l-2 border-gold text-gold'
                    : 'border-l-2 border-transparent text-mist/60 hover:text-mist hover:bg-gold/5'
                }`}
              >
                <span className="text-sm">{ch.icon}</span>
                <span className="font-mono text-[10px] tracking-wide">{ch.title}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-gold/15">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{chapter.icon}</span>
              <h2 className="font-display text-xl text-parchment tracking-wide">{chapter.title}</h2>
            </div>
            <button
              onClick={() => setOverlay('none')}
              className="font-mono-game text-[10px] text-mist/50 hover:text-gold transition-colors cursor-pointer px-3 py-1 border border-gold/15 hover:border-gold/35"
            >
              [ESC] Close
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-7">
            {chapter.sections.map(sec => (
              <div key={sec.heading}>
                <h3 className="font-display text-sm text-gold/90 tracking-wider mb-2 pb-1 border-b border-gold/10">
                  {sec.heading}
                </h3>
                <div className="space-y-1">
                  {sec.body.split('\n').map((line, i) => (
                    <p key={i} className={`font-body text-[12px] leading-relaxed ${line.startsWith('•') ? 'ml-3 text-mist/75' : 'text-mist/80'}`}>
                      {line || <br />}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer navigation */}
          <div className="border-t border-gold/10 px-8 py-3 flex items-center justify-between">
            <button
              onClick={() => {
                const idx = CHAPTERS.findIndex(c => c.id === activeChapter);
                if (idx > 0) setActiveChapter(CHAPTERS[idx - 1].id);
              }}
              disabled={CHAPTERS[0].id === activeChapter}
              className="font-mono text-[10px] text-mist/40 hover:text-mist/80 disabled:opacity-20 cursor-pointer"
            >
              ← Prev
            </button>
            <p className="font-mono text-[9px] text-mist/30">
              {CHAPTERS.findIndex(c => c.id === activeChapter) + 1} / {CHAPTERS.length}
            </p>
            <button
              onClick={() => {
                const idx = CHAPTERS.findIndex(c => c.id === activeChapter);
                if (idx < CHAPTERS.length - 1) setActiveChapter(CHAPTERS[idx + 1].id);
              }}
              disabled={CHAPTERS[CHAPTERS.length - 1].id === activeChapter}
              className="font-mono text-[10px] text-mist/40 hover:text-mist/80 disabled:opacity-20 cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(CodexPanel);
