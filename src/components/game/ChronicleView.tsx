import { useGameStore } from '@/lib/gameStore';
import { SEASON_NAMES, SEASON_ICONS } from '@/lib/gameData';
import { motion } from 'framer-motion';

export default function ChronicleView() {
  const chronicle = useGameStore(s => s.chronicle);
  const playerTitle = useGameStore(s => s.playerTitle);
  const backToGame = useGameStore(s => s.backToGame);

  const typeColors: Record<string, string> = {
    action: 'text-parchment',
    world: 'text-gold/70',
    npc: 'text-rep-trade',
    faction: 'text-faction-amber',
    discovery: 'text-rep-exploration',
  };

  const typeLabels: Record<string, string> = {
    action: 'ACTION',
    world: 'WORLD EVENT',
    npc: 'NPC',
    faction: 'FACTION',
    discovery: 'DISCOVERY',
  };

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="font-mono text-[10px] tracking-[0.4em] text-gold uppercase mb-4">The Chronicle</p>
          <h1 className="font-display text-4xl md:text-5xl font-black text-parchment gold-glow mb-3">
            {playerTitle}
          </h1>
          <p className="italic text-mist">A record of deeds, witnessed by Aethermoor itself.</p>
          <div className="w-[80px] h-[2px] bg-gold mx-auto mt-6" />
        </div>

        {/* Entries */}
        <div className="flex flex-col gap-4">
          {chronicle.map((entry, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex gap-4 items-start"
            >
              <div className="w-16 shrink-0 text-right">
                <p className="font-mono text-[10px] text-gold/40">{SEASON_ICONS[entry.season]}</p>
                <p className="font-mono text-[10px] text-mist/50">T:{entry.tick}</p>
              </div>
              <div className="w-px bg-gold/15 shrink-0 self-stretch" />
              <div className="flex-1 pb-2">
                <p className={`font-mono text-[9px] tracking-[0.2em] uppercase mb-1 ${typeColors[entry.type] || 'text-mist'}`}>
                  {typeLabels[entry.type] || entry.type}
                </p>
                <p className="text-mist text-[15px] leading-[1.8] italic">{entry.text}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Back button */}
        <div className="text-center mt-12">
          <button
            onClick={backToGame}
            className="px-8 py-3 border border-gold/20 bg-gold/[0.05] font-display text-xs tracking-[0.15em] text-gold uppercase
              hover:bg-gold/15 hover:border-gold/40 transition-all cursor-pointer"
          >
            Return to Aethermoor
          </button>
        </div>
      </div>
    </div>
  );
}
