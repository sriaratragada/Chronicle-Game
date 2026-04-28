import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { LOCATIONS } from '@/lib/gameData';
import { LOCATION_COORDS } from '@/lib/mapGenerator';

function FastTravelPanel() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const visitedLocations = useGameStore(s => s.visitedLocations);
  const playerX = useGameStore(s => s.playerX);
  const playerY = useGameStore(s => s.playerY);
  const travel = useGameStore(s => s.travel);
  const currentLocation = useGameStore(s => s.currentLocation);
  const adminMode = useGameStore(s => s.adminMode);

  if (overlay !== 'fasttravel') return null;

  // Admin mode: show all locations; otherwise only visited
  const visited = LOCATIONS.filter(l => (adminMode || visitedLocations.includes(l.id)) && l.id !== currentLocation);

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-ink/95 backdrop-blur-md overflow-auto pointer-events-auto">
        <div className="max-w-lg mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl text-gold gold-glow">Fast Travel</h2>
            <button onClick={() => setOverlay('none')} className="font-mono-game text-xs text-mist hover:text-gold transition-colors cursor-pointer">[ESC] Close</button>
          </div>
          {adminMode && <p className="font-mono-game text-[10px] text-emerald-400/80 mb-1">⚡ Admin Mode — all locations available</p>}
          <p className="font-mono-game text-[10px] text-mist/50 mb-4">Travel costs time and hunger proportional to distance. You must have visited the location before.</p>
          <div className="space-y-1">
            {visited.length === 0 && <p className="font-mono-game text-[10px] text-mist/40 italic">No other locations discovered yet.</p>}
            {visited.map(loc => {
              const coord = LOCATION_COORDS[loc.id];
              const dist = coord ? Math.round(Math.sqrt((coord.x - playerX) ** 2 + (coord.y - playerY) ** 2)) : 0;
              return (
                <div key={loc.id} className="border border-gold/10 p-3 flex items-center justify-between hover:border-gold/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{loc.icon}</span>
                    <div>
                      <p className="font-display text-xs text-parchment">{loc.name}</p>
                      <p className="font-mono-game text-[9px] text-mist/50">{loc.type} · {dist} tiles away</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { travel(loc.id); setOverlay('none'); }}
                    className="px-3 py-1 border border-gold/20 font-mono-game text-[10px] text-gold hover:bg-gold/10 cursor-pointer"
                  >Travel</button>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(FastTravelPanel);
