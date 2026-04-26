import { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { listSlots, saveToSlot, loadFromSlot, deleteSlot, SaveSlotInfo } from '@/lib/saveSystem';

function SaveLoadPanel() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const phase = useGameStore(s => s.phase);
  const [slots, setSlots] = useState<SaveSlotInfo[]>([]);
  const [mode, setMode] = useState<'save' | 'load'>('save');

  useEffect(() => {
    if (overlay === 'saveload') setSlots(listSlots());
  }, [overlay]);

  if (overlay !== 'saveload') return null;

  const handleSave = (slot: number) => {
    saveToSlot(slot);
    setSlots(listSlots());
  };

  const handleLoad = (slot: number) => {
    if (loadFromSlot(slot)) setOverlay('none');
  };

  const handleDelete = (slot: number) => {
    deleteSlot(slot);
    setSlots(listSlots());
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 bg-ink/95 backdrop-blur-md overflow-auto pointer-events-auto"
      >
        <div className="max-w-lg mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl text-gold gold-glow">Save / Load</h2>
            <button onClick={() => setOverlay('none')} className="font-mono-game text-xs text-mist hover:text-gold transition-colors cursor-pointer">[ESC] Close</button>
          </div>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode('save')}
              className={`flex-1 py-2 border font-mono-game text-xs uppercase tracking-wider cursor-pointer transition-all ${mode === 'save' ? 'border-gold bg-gold/10 text-gold' : 'border-gold/20 text-mist/50 hover:text-mist'}`}
            >Save</button>
            <button
              onClick={() => setMode('load')}
              className={`flex-1 py-2 border font-mono-game text-xs uppercase tracking-wider cursor-pointer transition-all ${mode === 'load' ? 'border-gold bg-gold/10 text-gold' : 'border-gold/20 text-mist/50 hover:text-mist'}`}
            >Load</button>
          </div>

          <div className="space-y-2">
            {slots.map(slot => (
              <div key={slot.slot} className="border border-gold/10 p-3 flex items-center justify-between">
                <div>
                  <span className="font-mono-game text-[10px] text-mist/50">Slot {slot.slot + 1}</span>
                  {slot.exists ? (
                    <div>
                      <p className="font-display text-xs text-parchment">{slot.playerTitle}</p>
                      <p className="font-mono-game text-[9px] text-mist/50">{slot.location} — {slot.season} T{slot.tick}</p>
                      <p className="font-mono-game text-[8px] text-mist/30">{new Date(slot.timestamp).toLocaleString()}</p>
                    </div>
                  ) : (
                    <p className="font-mono-game text-[10px] text-mist/30 italic">Empty</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {mode === 'save' && (
                    <button onClick={() => handleSave(slot.slot)} className="px-3 py-1 border border-gold/20 font-mono-game text-[10px] text-gold hover:bg-gold/10 cursor-pointer">
                      {slot.exists ? 'Overwrite' : 'Save'}
                    </button>
                  )}
                  {mode === 'load' && slot.exists && (
                    <button onClick={() => handleLoad(slot.slot)} className="px-3 py-1 border border-gold/20 font-mono-game text-[10px] text-gold hover:bg-gold/10 cursor-pointer">Load</button>
                  )}
                  {slot.exists && (
                    <button onClick={() => handleDelete(slot.slot)} className="px-2 py-1 border border-blood/20 font-mono-game text-[10px] text-blood/60 hover:bg-blood/10 cursor-pointer">×</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(SaveLoadPanel);
