import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { PLOT_PRICES } from '@/lib/housing';

function BuildPanel() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const currentLocation = useGameStore(s => s.currentLocation);
  const housing = useGameStore(s => s.housing);
  const gold = useGameStore(s => s.gold);
  const purchasePlotAction = useGameStore(s => s.purchasePlotAction);

  if (overlay !== 'build') return null;

  const plotPrice = PLOT_PRICES[currentLocation];
  const plot = housing.plots[currentLocation];
  const owned = plot?.purchased;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-ink/95 backdrop-blur-md overflow-auto pointer-events-auto">
        <div className="max-w-lg mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl text-gold gold-glow">Housing</h2>
            <button onClick={() => setOverlay('none')} className="font-mono-game text-xs text-mist hover:text-gold transition-colors cursor-pointer">[ESC] Close</button>
          </div>
          {plotPrice ? (
            <div className="border border-gold/10 p-4 text-center">
              <p className="font-display text-sm text-parchment mb-2">
                {owned ? 'Your Plot' : 'Plot Available'} in {currentLocation.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </p>
              {owned ? (
                <>
                  <p className="font-mono-game text-[10px] text-rep-craft mb-2">Purchased — 16×16 grid</p>
                  <p className="font-mono-game text-[10px] text-mist/50">Furniture: {plot?.furniture.length ?? 0} placed</p>
                  <p className="font-mono-game text-[9px] text-mist/30 mt-3">Place furniture by crafting workbenches and beds, then using them here.</p>
                </>
              ) : (
                <>
                  <p className="font-mono-game text-[10px] text-gold mb-4">Price: {plotPrice}g — You have {gold}g</p>
                  <button
                    onClick={() => purchasePlotAction(currentLocation)}
                    disabled={gold < plotPrice}
                    className={`px-6 py-2 border font-mono-game text-xs cursor-pointer transition-all ${gold >= plotPrice ? 'border-gold/30 text-gold hover:bg-gold/10' : 'border-gold/10 text-mist/30 cursor-not-allowed'}`}
                  >Purchase Plot</button>
                </>
              )}
            </div>
          ) : (
            <div className="border border-gold/10 p-4 text-center">
              <p className="font-body text-sm text-mist/50 italic">No plots available in this location.</p>
              <p className="font-mono-game text-[10px] text-mist/30 mt-2">Plots can be purchased in Highmarch, Vell Harbor, and Korrath Citadel.</p>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(BuildPanel);
