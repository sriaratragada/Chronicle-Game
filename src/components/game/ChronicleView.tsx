import { useGameStore } from '@/lib/gameStore';
import { SEASON_ICONS } from '@/lib/gameData';
import type { SimDelta } from '@/lib/gameTypes';
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';

function formatDeltaLine(d: SimDelta): string {
  const loc = d.locationId ? `${d.locationId} ` : '';
  const fid = d.factionId ? `${d.factionId} ` : '';
  const it = d.itemId ? `${d.itemId} ` : '';
  const b = d.before !== undefined ? String(d.before) : '—';
  const a = d.after !== undefined ? String(d.after) : '—';
  return `${loc}${fid}${it}${d.domain}/${d.key}: ${b} → ${a}`;
}

export default function ChronicleView() {
  const chronicle = useGameStore(s => s.chronicle);
  const simEventLog = useGameStore(s => s.simEventLog);
  const playerTitle = useGameStore(s => s.playerTitle);
  const backToGame = useGameStore(s => s.backToGame);
  const [openById, setOpenById] = useState<Record<string, boolean>>({});

  const simById = useMemo(() => {
    const m = new Map<string, (typeof simEventLog)[0]>();
    for (const e of simEventLog) m.set(e.id, e);
    return m;
  }, [simEventLog]);

  const typeColors: Record<string, string> = {
    action: 'text-parchment',
    world: 'text-gold/70',
    npc: 'text-rep-trade',
    faction: 'text-faction-amber',
    discovery: 'text-rep-exploration',
    environment: 'text-mist/80',
    sim: 'text-gold/90',
  };

  const typeLabels: Record<string, string> = {
    action: 'ACTION',
    world: 'WORLD EVENT',
    npc: 'NPC',
    faction: 'FACTION',
    discovery: 'DISCOVERY',
    environment: 'ENVIRONMENT',
    sim: 'WORLD SIM',
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
          {chronicle.map((entry, i) => {
            const rowKey = entry.eventId ?? `row-${i}-${entry.tick}`;
            const sim = entry.eventId ? simById.get(entry.eventId) : undefined;
            const expanded = entry.eventId ? !!openById[entry.eventId] : false;
            return (
              <motion.div
                key={rowKey}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.03, 1.2)}}
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
                  {entry.eventId && sim && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenById(o => ({
                            ...o,
                            [entry.eventId!]: !o[entry.eventId!],
                          }))
                        }
                        className="font-mono text-[10px] tracking-wider text-gold/60 hover:text-gold uppercase border border-gold/15 px-2 py-1 rounded-sm bg-gold/[0.04] cursor-pointer"
                      >
                        {expanded ? 'Hide world data' : 'How the world shifted'}
                      </button>
                      {expanded && (
                        <div className="mt-2 pl-2 border-l border-gold/20 text-mist/85 font-mono text-[11px] leading-relaxed space-y-1">
                          <p className="text-gold/50 text-[9px] uppercase tracking-widest">Event {sim.id}</p>
                          {sim.deltas.map((d, di) => (
                            <p key={di}>{formatDeltaLine(d)}</p>
                          ))}
                          {sim.deltas.length === 0 && entry.payload?.deltasPreview && (
                            <p>{entry.payload.deltasPreview}</p>
                          )}
                          {sim.deltas.length === 0 && !entry.payload?.deltasPreview && (
                            <p className="text-mist/50">No numeric deltas recorded for this entry.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {entry.eventId && !sim && entry.payload?.deltasPreview && (
                    <p className="mt-2 font-mono text-[10px] text-mist/50 border-l border-gold/10 pl-2">{entry.payload.deltasPreview}</p>
                  )}
                </div>
              </motion.div>
            );
          })}
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
