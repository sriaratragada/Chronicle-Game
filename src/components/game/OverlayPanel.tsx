import { useEffect } from 'react';
import { useGameStore } from '@/lib/gameStore';
import { REP_LABELS, FACTION_INFO, SEASON_NAMES, SEASON_ICONS, LOCATIONS } from '@/lib/gameData';
import { motion, AnimatePresence } from 'framer-motion';

export default function OverlayPanel() {
  const phase = useGameStore(s => s.phase);
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const reputation = useGameStore(s => s.reputation);
  const factions = useGameStore(s => s.factions);
  const playerTitle = useGameStore(s => s.playerTitle);
  const tick = useGameStore(s => s.tick);
  const season = useGameStore(s => s.season);
  const chronicle = useGameStore(s => s.chronicle);
  const visitedLocations = useGameStore(s => s.visitedLocations);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') setOverlay('none');
      if (e.key === 'p' || e.key === 'P') setOverlay(overlay === 'player' ? 'none' : 'player');
      if (e.key === 'c' || e.key === 'C') setOverlay(overlay === 'chronicle' ? 'none' : 'chronicle');
      if (e.key === 'i' || e.key === 'I') setOverlay(overlay === 'inventory' ? 'none' : 'inventory');
      if (e.key === 'k' || e.key === 'K') setOverlay(overlay === 'crafting' ? 'none' : 'crafting');
      if (e.key === 'l' || e.key === 'L') setOverlay(overlay === 'skills' ? 'none' : 'skills');
      if (e.key === 'q' || e.key === 'Q') setOverlay(overlay === 'quests' ? 'none' : 'quests');
      if (e.key === 'f' || e.key === 'F') setOverlay(overlay === 'faction' ? 'none' : 'faction');
      if (e.key === 'm' || e.key === 'M') setOverlay(overlay === 'shop' ? 'none' : 'shop');
      if (e.key === 'b' || e.key === 'B') setOverlay(overlay === 'build' ? 'none' : 'build');
      if (e.key === 't' || e.key === 'T') setOverlay(overlay === 'fasttravel' ? 'none' : 'fasttravel');
      if ((e.key === 'g' || e.key === 'G') && (phase === 'playing' || phase === 'sailing')) {
        setOverlay(overlay === 'map' ? 'none' : 'map');
      }
      if (e.key === 'F5') { e.preventDefault(); setOverlay(overlay === 'saveload' ? 'none' : 'saveload'); }
      if (e.key === 'z' || e.key === 'Z') setOverlay(overlay === 'arcane' ? 'none' : 'arcane');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [overlay, setOverlay, phase]);

  const typeColors: Record<string, string> = {
    action: 'text-gold', world: 'text-mist', npc: 'text-parchment',
    faction: 'text-blood', discovery: 'text-rep-exploration', environment: 'text-rep-craft',
  };

  return (
    <AnimatePresence>
      {(overlay === 'player' || overlay === 'chronicle') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 z-50 bg-ink/95 backdrop-blur-md overflow-auto pointer-events-auto"
        >
          <div className="max-w-2xl mx-auto p-8">
            {/* Close button */}
            <button
              onClick={() => setOverlay('none')}
              className="absolute top-4 right-4 font-mono-game text-xs text-mist hover:text-gold transition-colors cursor-pointer"
            >
              [ESC] Close
            </button>

            {overlay === 'player' && (
              <>
                {/* Header */}
                <div className="text-center mb-8">
                  <h2 className="font-display text-2xl text-gold gold-glow mb-1">{playerTitle}</h2>
                  <p className="font-mono-game text-[10px] text-mist uppercase tracking-widest">
                    {SEASON_ICONS[season]} {SEASON_NAMES[season]} · Tick {tick} · {visitedLocations.length}/{LOCATIONS.length} discovered
                  </p>
                </div>

                {/* Reputation */}
                <div className="mb-8">
                  <h3 className="font-display text-sm text-parchment/70 uppercase tracking-wider mb-4">Reputation</h3>
                  <div className="space-y-3">
                    {Object.entries(REP_LABELS).map(([key, info]) => (
                      <div key={key}>
                        <div className="flex justify-between mb-1">
                          <span className="font-mono-game text-[10px] text-mist uppercase">{info.label}</span>
                          <span className="font-mono-game text-[10px] text-gold">{reputation[key as keyof typeof reputation]}</span>
                        </div>
                        <div className="h-1 bg-ash rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full ${info.color} rounded-full`}
                            initial={{ width: 0 }}
                            animate={{ width: `${reputation[key as keyof typeof reputation]}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Factions */}
                <div>
                  <h3 className="font-display text-sm text-parchment/70 uppercase tracking-wider mb-4">Factions</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(FACTION_INFO).map(([key, info]) => {
                      const val = factions[key as keyof typeof factions];
                      return (
                        <div key={key} className="flex items-center gap-2 p-2 border border-gold/5">
                          <span>{info.icon}</span>
                          <span className="font-mono-game text-[10px] text-mist flex-1">{info.name}</span>
                          <span className={`font-mono-game text-[10px] ${val > 0 ? 'text-rep-diplomacy' : val < 0 ? 'text-blood' : 'text-mist/40'}`}>
                            {val > 0 ? '+' : ''}{val}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {overlay === 'chronicle' && (
              <>
                <div className="text-center mb-8">
                  <h2 className="font-display text-2xl text-gold gold-glow mb-1">The Chronicle</h2>
                  <p className="font-mono-game text-[10px] text-mist uppercase tracking-widest">
                    {chronicle.length} entries · {playerTitle}
                  </p>
                </div>

                <div className="space-y-3">
                  {[...chronicle].reverse().map((entry, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-l-2 border-gold/10 pl-3 py-1"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs">{SEASON_ICONS[entry.season]}</span>
                        <span className="font-mono-game text-[9px] text-mist">T{entry.tick}</span>
                        <span className={`font-mono-game text-[8px] uppercase tracking-wider ${typeColors[entry.type] || 'text-mist'}`}>
                          {entry.type}
                        </span>
                      </div>
                      <p className="font-body text-sm text-parchment/80 leading-relaxed">{entry.text}</p>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
