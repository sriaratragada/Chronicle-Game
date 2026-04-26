import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { ITEMS } from '@/lib/items';

const EQUIP_SLOTS = ['mainhand', 'offhand', 'helm', 'chest', 'legs', 'boots', 'amulet'];

function InventoryPanel() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const inventory = useGameStore(s => s.inventory);
  const gold = useGameStore(s => s.gold);
  const equipItemAction = useGameStore(s => s.equipItemAction);
  const unequipItemAction = useGameStore(s => s.unequipItemAction);

  if (overlay !== 'inventory') return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-ink/95 backdrop-blur-md overflow-auto pointer-events-auto">
        <div className="max-w-3xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl text-gold gold-glow">Inventory</h2>
            <div className="flex items-center gap-4">
              <span className="font-mono-game text-[11px] text-gold">🪙 {gold}g</span>
              <button onClick={() => setOverlay('none')} className="font-mono-game text-xs text-mist hover:text-gold transition-colors cursor-pointer">[ESC] Close</button>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-display text-sm text-parchment/70 uppercase tracking-wider mb-3">Equipment</h3>
            <div className="grid grid-cols-4 gap-2">
              {EQUIP_SLOTS.map(slot => {
                const equipped = inventory.equipment[slot];
                const def = equipped ? ITEMS[equipped.itemId] : null;
                return (
                  <div key={slot} className="border border-gold/10 bg-ink/50 p-2 text-center min-h-[60px] flex flex-col items-center justify-center cursor-pointer hover:border-gold/30 transition-colors"
                    onClick={() => equipped && unequipItemAction(slot)}>
                    <span className="font-mono-game text-[8px] text-mist/40 uppercase">{slot}</span>
                    {def ? (
                      <>
                        <span className="text-lg mt-1">{def.icon}</span>
                        <span className="font-mono-game text-[9px] text-parchment">{def.name}</span>
                        {def.damage && <span className="font-mono-game text-[8px] text-blood">⚔ {def.damage}</span>}
                        {def.armor && <span className="font-mono-game text-[8px] text-blue-400">🛡 {def.armor}</span>}
                      </>
                    ) : <span className="text-lg mt-1 text-mist/20">—</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="font-display text-sm text-parchment/70 uppercase tracking-wider mb-3">Backpack</h3>
            <div className="grid grid-cols-6 gap-1">
              {inventory.slots.map((slot, i) => {
                const def = slot ? ITEMS[slot.itemId] : null;
                return (
                  <div key={i} className="border border-gold/10 bg-ink/50 w-14 h-14 flex flex-col items-center justify-center cursor-pointer hover:border-gold/30 transition-colors relative"
                    onClick={() => slot && def?.equipSlot && equipItemAction(i)}
                    title={def ? `${def.name}: ${def.description}` : ''}>
                    {def ? (
                      <>
                        <span className="text-lg">{def.icon}</span>
                        {slot!.qty > 1 && <span className="absolute bottom-0.5 right-1 font-mono text-[8px] text-gold/70">{slot!.qty}</span>}
                      </>
                    ) : <span className="text-[8px] text-mist/15">{i + 1}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(InventoryPanel);
