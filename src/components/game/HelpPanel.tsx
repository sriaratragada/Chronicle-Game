import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';

export default function HelpPanel() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);

  const keybinds = [
    { key: 'W/↑', desc: 'Move Up', alt: 'Arrow keys also work. 2× speed on horse.' },
    { key: 'A/←', desc: 'Move Left', alt: 'Arrow keys also work' },
    { key: 'S/↓', desc: 'Move Down', alt: 'Arrow keys also work' },
    { key: 'D/→', desc: 'Move Right', alt: 'Arrow keys also work' },
    { key: 'E', desc: 'Interact / Eat', alt: 'Boats, horses, caves, caravan escort, camp fire stash, gather, eat' },
    { key: 'Tent', desc: 'Travel Tent (hotbar)', alt: 'Pitch a fire & camp stash. Cook meat at the fire or with a portable stove.' },
    { key: 'J', desc: 'Attack', alt: 'Melee attack in facing direction' },
    { key: '1–6', desc: 'Select Slot', alt: 'Hotbar slot (left side)' },
    { key: 'I', desc: 'Inventory', alt: 'Backpack, equipment, stats' },
    { key: 'K', desc: 'Crafting', alt: 'Recipe list with material counts' },
    { key: 'L', desc: 'Skills', alt: 'Skill trees, XP, perks' },
    { key: 'Q', desc: 'Quests', alt: 'Quest log & bounty boards' },
    { key: 'F', desc: 'Factions', alt: 'Kingdom politics & standings' },
    { key: 'M', desc: 'Market / Shop', alt: 'Buy and sell at any settlement' },
    { key: 'B', desc: 'Build / Housing', alt: 'Purchase plots in capitals' },
    { key: 'T', desc: 'Fast Travel', alt: 'Teleport to visited locations' },
    { key: 'G', desc: 'Realm Atlas', alt: 'Full world map (pan, zoom). Or select Realm Atlas in the hotbar and press E' },
    { key: 'P', desc: 'Player Panel', alt: 'Reputation & faction standing' },
    { key: 'C', desc: 'Chronicle', alt: 'Event history log' },
    { key: 'F5', desc: 'Save/Load', alt: 'Save or load game (4 slots)' },
    { key: '? / H', desc: 'Help Panel', alt: 'This menu' },
    { key: 'ESC', desc: 'Close Panel', alt: 'Dismiss overlays' },
  ];

  return (
    <AnimatePresence>
      {overlay === 'help' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-ink/95 backdrop-blur-sm flex flex-col items-center justify-center p-4"
          onClick={() => setOverlay('none')}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="max-w-2xl w-full bg-ink border border-gold/15 p-8"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl text-parchment tracking-[0.1em]">Controls</h2>
              <button
                onClick={() => setOverlay('none')}
                className="text-mist/60 hover:text-parchment transition-colors text-sm font-mono"
              >
                [ESC]
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-gold/10 mb-6" />

            {/* Keybinds Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {keybinds.map((bind, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -10 : 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15, delay: 0.05 + i * 0.02 }}
                  className="flex items-start gap-3"
                >
                  {/* Key badge */}
                  <div className="flex-shrink-0">
                    <span className="inline-block bg-gold/10 border border-gold/20 px-2.5 py-1 rounded font-mono text-xs text-gold font-bold min-w-[60px] text-center">
                      {bind.key}
                    </span>
                  </div>

                  {/* Description */}
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-xs text-parchment leading-tight">
                      {bind.desc}
                    </p>
                    <p className="text-[9px] text-mist/50 italic leading-tight mt-0.5">
                      {bind.alt}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gold/10">
              <p className="font-display text-[10px] text-gold/80 uppercase tracking-wider mb-1">Minimap</p>
              <p className="text-[9px] text-mist/55 leading-relaxed">
                Cyan triangles mark harbours and coastal boat landings (not every settlement). Use them to plan sea crossings.
              </p>
            </div>

            {/* Footer hint */}
            <div className="mt-8 pt-6 border-t border-gold/10">
              <p className="text-[9px] text-mist/40 text-center">
                Press <span className="font-mono bg-gold/5 px-1">ESC</span> or click to close
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
