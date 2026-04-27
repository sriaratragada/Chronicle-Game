import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RegionalModifiers } from '@/lib/regionalState';

interface Condition {
  key: keyof Omit<RegionalModifiers, 'lastChronicleBand'>;
  icon: string;
  label: string;
  descLow: string;
  descHigh: string;
  barColor: (v: number) => string;
}

const CONDITIONS: Condition[] = [
  {
    key: 'warTension',
    icon: '⚔',
    label: 'War Tension',
    descLow: 'Border friction rising. Trivalen prices climb.',
    descHigh: 'Open conflict looms. Mercenaries flock to contested roads.',
    barColor: v => v > 0.6 ? 'bg-blood' : 'bg-amber-500/80',
  },
  {
    key: 'drought',
    icon: '🌾',
    label: 'Drought',
    descLow: "Dry season strains Auredia's fields. Grain grows dear.",
    descHigh: 'Crops wither. Prices spike. Farmers work through dusk.',
    barColor: v => v > 0.6 ? 'bg-amber-600' : 'bg-yellow-700/70',
  },
  {
    key: 'banditPressure',
    icon: '💀',
    label: 'Banditry',
    descLow: 'Road crime climbing. Caravans take guarded routes.',
    descHigh: 'Bandit lords rule the trade lines. Merchants hide wagons.',
    barColor: v => v > 0.6 ? 'bg-rose-700' : 'bg-rose-600/70',
  },
  {
    key: 'stormSeverity',
    icon: '⛈',
    label: 'Storm Seas',
    descLow: 'Rough waters slow sea trade. Fish harder to land.',
    descHigh: 'Harbour masters close the gates. No ships dare leave.',
    barColor: v => v > 0.5 ? 'bg-blue-700' : 'bg-sky-600/70',
  },
];

const SHOW_THRESHOLD = 0.28;

interface Props {
  modifiers: RegionalModifiers;
}

function WorldConditions({ modifiers }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const active = CONDITIONS.filter(c => modifiers[c.key] > SHOW_THRESHOLD);
  if (active.length === 0) return null;

  return (
    <div className="flex items-center gap-2 border-l border-gold/10 pl-3">
      {active.map(c => {
        const v = modifiers[c.key];
        const isHigh = v > 0.55;
        return (
          <div
            key={c.key}
            className="relative flex items-center gap-1 cursor-default"
            onMouseEnter={() => setHovered(c.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className={`text-[10px] leading-none ${isHigh ? 'animate-pulse' : 'opacity-70'}`}>
              {c.icon}
            </span>
            <div className="w-10 h-1 bg-ash/60 overflow-hidden rounded-full border border-gold/10">
              <div
                className={`h-full rounded-full transition-all duration-700 ${c.barColor(v)}`}
                style={{ width: `${Math.round(v * 100)}%` }}
              />
            </div>

            <AnimatePresence>
              {hovered === c.key && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full mb-2 left-0 z-50 min-w-[180px] bg-ink/98 border border-gold/20 px-3 py-2 shadow-xl pointer-events-none"
                >
                  <p className="font-mono text-[8px] text-gold uppercase tracking-widest mb-1">
                    {c.label} — {Math.round(v * 100)}%
                  </p>
                  <p className="font-body text-[10px] text-mist/75 leading-snug">
                    {isHigh ? c.descHigh : c.descLow}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export default memo(WorldConditions);
