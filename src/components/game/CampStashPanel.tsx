import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { ITEMS } from '@/lib/items';

function CampStashPanel() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const campStash = useGameStore(s => s.campStash);
  const inventory = useGameStore(s => s.inventory);
  const moveFromCampToBackpack = useGameStore(s => s.moveFromCampToBackpack);
  const moveFromBackpackToCamp = useGameStore(s => s.moveFromBackpackToCamp);

  if (overlay !== 'camp') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[55] bg-ink/95 backdrop-blur-md overflow-auto pointer-events-auto"
      >
        <div className="max-w-4xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl text-gold gold-glow">Field stash</h2>
            <button
              type="button"
              onClick={() => setOverlay('none')}
              className="font-mono-game text-xs text-mist hover:text-gold transition-colors cursor-pointer"
            >
              [ESC] Close
            </button>
          </div>
          <p className="font-mono-game text-[10px] text-mist/60 mb-6">
            Click a camp slot to pull it to your backpack. Click a backpack slot (6–30) to deposit into the first empty camp slot.
          </p>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-display text-sm text-parchment/70 uppercase tracking-wider mb-3">Camp</h3>
              <div className="grid grid-cols-6 gap-1">
                {campStash.slots.map((slot, i) => {
                  const def = slot ? ITEMS[slot.itemId] : null;
                  return (
                    <button
                      type="button"
                      key={`c-${i}`}
                      disabled={!slot}
                      onClick={() => slot && moveFromCampToBackpack(i)}
                      className="border border-gold/10 bg-ink/50 w-14 h-14 flex flex-col items-center justify-center hover:border-gold/40 disabled:opacity-30 transition-colors cursor-pointer"
                    >
                      {def ? (
                        <>
                          <span className="text-lg">{def.icon}</span>
                          {slot!.qty > 1 && (
                            <span className="font-mono text-[8px] text-gold/70">{slot!.qty}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-[8px] text-mist/15">{i + 1}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="font-display text-sm text-parchment/70 uppercase tracking-wider mb-3">Backpack</h3>
              <div className="grid grid-cols-6 gap-1">
                {inventory.slots.map((slot, i) => {
                  const def = slot ? ITEMS[slot.itemId] : null;
                  const canSend = i >= 6 && !!slot;
                  return (
                    <button
                      type="button"
                      key={`b-${i}`}
                      disabled={!canSend}
                      onClick={() => canSend && moveFromBackpackToCamp(i)}
                      className={`border w-14 h-14 flex flex-col items-center justify-center transition-colors ${
                        i < 6 ? 'border-gold/5 bg-ink/30 opacity-40 cursor-default' : 'border-gold/10 bg-ink/50 hover:border-gold/40 cursor-pointer disabled:opacity-30'
                      }`}
                      title={i < 6 ? 'Hotbar row — use slots below for camp' : def?.name}
                    >
                      {def ? (
                        <>
                          <span className="text-lg">{def.icon}</span>
                          {slot!.qty > 1 && (
                            <span className="font-mono text-[8px] text-gold/70">{slot!.qty}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-[8px] text-mist/15">{i + 1}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(CampStashPanel);
