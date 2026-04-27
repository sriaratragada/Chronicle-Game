import { memo } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { LOCATIONS } from '@/lib/gameData';
import { LOCATION_COORDS } from '@/lib/mapGenerator';

interface SeaLabel { threshold: number; label: string; color: string; }

const SEA_LABELS: SeaLabel[] = [
  { threshold: 0.7, label: 'Violent Seas', color: 'text-rose-400' },
  { threshold: 0.5, label: 'Rough Waters', color: 'text-amber-400' },
  { threshold: 0.3, label: 'Choppy Swell', color: 'text-yellow-300' },
  { threshold: 0,   label: 'Calm Seas',    color: 'text-sky-300'   },
];

function SailingOverlay() {
  const phase = useGameStore(s => s.phase);
  const playerX = useGameStore(s => s.playerX);
  const playerY = useGameStore(s => s.playerY);
  const regional = useGameStore(s => s.regionalModifiers);

  if (phase !== 'sailing') return null;

  const storm = regional.stormSeverity;
  const sea = SEA_LABELS.find(s => storm >= s.threshold) ?? SEA_LABELS[SEA_LABELS.length - 1]!;
  const speedMult = Math.max(0.4, 1 - storm * 0.6);

  const ports = LOCATIONS.filter(l => l.type === 'port');
  let nearestPort: (typeof LOCATIONS)[number] | undefined;
  let nearestDist = Infinity;
  for (const p of ports) {
    const c = LOCATION_COORDS[p.id];
    if (!c) continue;
    const d = Math.hypot(c.x - playerX, c.y - playerY);
    if (d < nearestDist) { nearestDist = d; nearestPort = p; }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute top-14 left-1/2 -translate-x-1/2 z-[55] flex items-center gap-4 px-4 py-2 bg-ink/95 border border-sky-900/50 backdrop-blur-sm pointer-events-none"
    >
      <span className="text-[13px]">⛵</span>
      <div className="flex flex-col gap-0.5">
        <span className={`font-mono text-[9px] uppercase tracking-widest ${sea.color}`}>{sea.label}</span>
        <span className="font-body text-[10px] text-mist/70">
          Speed ×{speedMult.toFixed(1)}
          {nearestPort && (
            <span className="ml-2 text-mist/50">
              · {nearestPort.name} {Math.round(nearestDist)} tiles
            </span>
          )}
        </span>
      </div>
      <span className="font-mono text-[8px] text-sky-400/60 border border-sky-400/20 px-1 py-0.5">
        E to disembark
      </span>
    </motion.div>
  );
}

export default memo(SailingOverlay);
