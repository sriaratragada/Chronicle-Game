import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DialogueTree, DialogueOption } from '@/lib/dialogue';
import { useGameStore } from '@/lib/gameStore';
import { ITEMS } from '@/lib/items';
import { useShallow } from 'zustand/react/shallow';

interface Props {
  tree: DialogueTree;
  onClose: () => void;
  onEffect?: (option: DialogueOption) => void;
}

function getRelationshipTier(disposition: number): { label: string; color: string } {
  if (disposition >= 80) return { label: 'Allied', color: 'text-gold' };
  if (disposition >= 60) return { label: 'Trusted', color: 'text-emerald-400' };
  if (disposition >= 40) return { label: 'Friendly', color: 'text-sky-400' };
  if (disposition >= 20) return { label: 'Acquaintance', color: 'text-mist' };
  return { label: 'Stranger', color: 'text-mist/50' };
}

export default function DialogueView({ tree, onClose, onEffect }: Props) {
  const [currentNodeId, setCurrentNodeId] = useState(tree.startNodeId);
  const [showGifts, setShowGifts] = useState(false);

  const { inventory, npcs, minorNpcState } = useGameStore(
    useShallow(s => ({ inventory: s.inventory, npcs: s.npcs, minorNpcState: s.minorNpcState }))
  );
  const giftNpc = useGameStore(s => s.giftNpc);

  const node = tree.nodes[currentNodeId];

  // Resolve disposition from named NPC or minor NPC state
  const namedNpc = npcs.find(n => n.id === tree.npcId);
  const minorState = minorNpcState[tree.npcId];
  const disposition = namedNpc?.disposition ?? minorState?.disposition ?? 0;
  const tier = getRelationshipTier(disposition);

  // Giftable items: items with a value > 0, not weapons or armor
  const giftableItems = inventory.slots
    .filter((s): s is NonNullable<typeof s> => !!s && s.qty > 0)
    .map(s => ({ slot: s, def: ITEMS[s.itemId] }))
    .filter(({ def }) => def && (def.value ?? 0) > 0 && def.type !== 'weapon' && def.type !== 'armor' && def.type !== 'tool')
    .slice(0, 8);

  const handleOption = useCallback((option: DialogueOption) => {
    if (onEffect) onEffect(option);
    if (option.nextNodeId) {
      setCurrentNodeId(option.nextNodeId);
    } else {
      onClose();
    }
  }, [onClose, onEffect]);

  const handleGift = useCallback((itemId: string) => {
    giftNpc(tree.npcId, itemId);
    setShowGifts(false);
    onClose();
  }, [giftNpc, tree.npcId, onClose]);

  if (!node) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute bottom-12 left-4 right-4 z-50 max-w-2xl mx-auto pointer-events-auto"
    >
      <div className="bg-ink/95 border border-gold/20 backdrop-blur-md p-4 shadow-lg">
        {/* Speaker header with relationship tier */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-[1px] bg-gold/30" />
          <span className="font-display text-xs text-gold uppercase tracking-widest">{node.speaker}</span>
          <div className="flex-1 h-[1px] bg-gold/30" />
          <span className={`font-mono text-[9px] uppercase tracking-widest ${tier.color}`}>{tier.label}</span>
        </div>

        <p className="font-body text-sm text-parchment/90 leading-relaxed mb-3">{node.text}</p>

        {/* Dialogue options */}
        <div className="space-y-1.5">
          {node.options.map((option, idx) => (
            <button
              key={option.id}
              onClick={() => handleOption(option)}
              className="w-full text-left px-3 py-2 border border-gold/15 text-parchment/80 hover:border-gold/40 hover:bg-gold/5 hover:text-gold font-mono-game text-[11px] transition-all cursor-pointer"
            >
              <span className="text-gold/40 mr-2">[{idx + 1}]</span>
              {option.text}
            </button>
          ))}
          {/* Gift option (only when giftable items exist) */}
          {giftableItems.length > 0 && (
            <button
              onClick={() => setShowGifts(v => !v)}
              className="w-full text-left px-3 py-2 border border-gold/10 text-mist/60 hover:border-gold/30 hover:bg-gold/5 hover:text-mist font-mono-game text-[11px] transition-all cursor-pointer"
            >
              <span className="text-gold/30 mr-2">[G]</span>
              {showGifts ? 'Put it away.' : 'Offer a gift...'}
            </button>
          )}
        </div>

        {/* Gift picker */}
        <AnimatePresence>
          {showGifts && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="mt-2 pt-2 border-t border-gold/10">
                <p className="font-mono text-[10px] text-gold/50 uppercase tracking-widest mb-2">Choose a gift</p>
                <div className="grid grid-cols-2 gap-1">
                  {giftableItems.map(({ slot, def }) => (
                    <button
                      key={slot.itemId}
                      onClick={() => handleGift(slot.itemId)}
                      className="flex items-center gap-2 px-2 py-1.5 border border-gold/10 hover:border-gold/40 hover:bg-gold/5 transition-all cursor-pointer text-left"
                    >
                      <span className="text-sm">{def?.icon ?? '?'}</span>
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] text-parchment truncate">{def?.name ?? slot.itemId}</p>
                        <p className="font-mono text-[9px] text-gold/40">+{Math.max(2, Math.min(15, Math.floor((def?.value ?? 1) * 0.4)))} disposition</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
