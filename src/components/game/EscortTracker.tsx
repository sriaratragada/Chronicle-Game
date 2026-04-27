import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { getEntityById } from '@/lib/worldEntities';
import { LOCATIONS } from '@/lib/gameData';

function EscortTracker() {
  const escortCaravanId = useGameStore(s => s.escortCaravanId);
  const playerX = useGameStore(s => s.playerX);
  const playerY = useGameStore(s => s.playerY);

  if (!escortCaravanId) return null;

  const caravan = getEntityById(escortCaravanId);
  if (!caravan) return null;

  const destId = caravan.data.dest as string | undefined;
  const cargo = (caravan.data.cargo as string | undefined) ?? 'goods';
  const destLoc = LOCATIONS.find(l => l.id === destId);
  const dist = Math.round(Math.hypot(caravan.x - playerX, caravan.y - playerY));
  const isNear = dist < 20;

  return (
    <AnimatePresence>
      <motion.div
        key="escort"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="absolute top-16 left-1/2 -translate-x-1/2 z-[55] flex items-center gap-2 px-3 py-1.5 bg-ink/95 border border-gold/25 backdrop-blur-sm pointer-events-none"
      >
        <span className="text-[11px]">🐂</span>
        <div className="flex flex-col">
          <span className="font-mono text-[8px] text-gold uppercase tracking-widest">Escorting Caravan</span>
          <span className="font-body text-[10px] text-mist/80">
            {cargo} → {destLoc?.name ?? destId ?? '?'}
            <span className="text-mist/50 ml-2">{dist} tiles away</span>
          </span>
        </div>
        {isNear && (
          <span className="font-mono text-[8px] text-amber-400 animate-pulse border border-amber-400/30 px-1 py-0.5">
            NEAR
          </span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(EscortTracker);
