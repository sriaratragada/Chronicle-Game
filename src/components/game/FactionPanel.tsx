import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { KINGDOM_LORE } from '@/lib/worldLore';

const FACTION_COLORS: Record<string, string> = { auredia_crown: '#c9a84c', korrath: '#8a4444', vell: '#4488aa', sarnak: '#7a6a3a' };

function FactionPanel() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const factionStates = useGameStore(s => s.factionStates);

  if (overlay !== 'faction') return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-ink/95 backdrop-blur-md overflow-auto pointer-events-auto">
        <div className="max-w-2xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl text-gold gold-glow">Kingdoms & Factions</h2>
            <button onClick={() => setOverlay('none')} className="font-mono-game text-xs text-mist hover:text-gold transition-colors cursor-pointer">[ESC] Close</button>
          </div>
          <div className="space-y-4">
            {Object.entries(KINGDOM_LORE).map(([id, lore]) => {
              const fs = factionStates[id];
              return (
                <div key={id} className="border border-gold/10 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: FACTION_COLORS[id] ?? '#666' }} />
                    <span className="font-display text-sm text-parchment">{lore.name}</span>
                  </div>
                  <p className="font-mono-game text-[10px] text-mist/60 italic mb-1">"{lore.motto}"</p>
                  <p className="font-body text-[11px] text-mist/70 leading-relaxed mb-2">{lore.description}</p>
                  <p className="font-mono-game text-[9px] text-gold/50">Ruler: {lore.ruler}</p>
                  {fs && (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] font-mono-game">
                      <div className="text-center border border-gold/5 p-1"><span className="text-mist/40">Treasury</span><br/><span className="text-gold">{fs.treasury}g</span></div>
                      <div className="text-center border border-gold/5 p-1"><span className="text-mist/40">Army</span><br/><span className="text-gold">{fs.armySize}</span></div>
                      <div className="text-center border border-gold/5 p-1"><span className="text-mist/40">Territory</span><br/><span className="text-gold">{fs.territory.length}</span></div>
                      <div className="col-span-2 border border-gold/5 p-1"><span className="text-mist/40">Morale</span> <span className="text-gold">{fs.morale}%</span></div>
                      <div className="border border-gold/5 p-1">{fs.atWarWith.length > 0 ? <span className="text-blood">At war: {fs.atWarWith.join(', ')}</span> : <span className="text-rep-diplomacy">At peace</span>}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(FactionPanel);
