import { useGameStore } from '@/lib/gameStore';
import { SEASON_ICONS } from '@/lib/gameData';
import type { SimDelta } from '@/lib/gameTypes';
import { getAllRelationships } from '@/lib/relationshipGraph';
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

function sentimentLabel(s: number): { label: string; color: string } {
  if (s >= 60) return { label: 'Close Allies', color: 'text-emerald-400' };
  if (s >= 30) return { label: 'Trusted Friends', color: 'text-green-400' };
  if (s >= 10) return { label: 'Acquaintances', color: 'text-mist/70' };
  if (s >= -10) return { label: 'Strangers', color: 'text-mist/40' };
  if (s >= -30) return { label: 'Rivals', color: 'text-amber-400' };
  if (s >= -60) return { label: 'Enemies', color: 'text-red-400' };
  return { label: 'Bitter Foes', color: 'text-red-600' };
}

function sentimentBar(s: number): string {
  // Returns a mini bar -100..+100 as colored blocks
  const normalized = Math.round(((s + 100) / 200) * 10);
  return '█'.repeat(Math.max(0, normalized)) + '░'.repeat(Math.max(0, 10 - normalized));
}

type Tab = 'chronicle' | 'people';

export default function ChronicleView() {
  const chronicle = useGameStore(s => s.chronicle);
  const simEventLog = useGameStore(s => s.simEventLog);
  const playerTitle = useGameStore(s => s.playerTitle);
  const backToGame = useGameStore(s => s.backToGame);
  const [openById, setOpenById] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<Tab>('chronicle');

  const simById = useMemo(() => {
    const m = new Map<string, (typeof simEventLog)[0]>();
    for (const e of simEventLog) m.set(e.id, e);
    return m;
  }, [simEventLog]);

  const relationships = useMemo(() => getAllRelationships(), [tab]);

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
        <div className="text-center mb-10">
          <p className="font-mono text-[10px] tracking-[0.4em] text-gold uppercase mb-4">The Chronicle</p>
          <h1 className="font-display text-4xl md:text-5xl font-black text-parchment gold-glow mb-3">
            {playerTitle}
          </h1>
          <p className="italic text-mist">A record of deeds, witnessed by Aethermoor itself.</p>
          <div className="w-[80px] h-[2px] bg-gold mx-auto mt-6" />
        </div>

        {/* Tab switcher */}
        <div className="flex gap-0 mb-8 border border-gold/20">
          {(['chronicle', 'people'] as Tab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-2 font-display text-[11px] tracking-[0.2em] uppercase transition-all cursor-pointer
                ${tab === t ? 'bg-gold/15 text-gold border-b-2 border-gold' : 'text-mist/40 hover:text-mist/70'}`}
            >
              {t === 'chronicle' ? '📜 Chronicle' : '⚔ People of the Realm'}
            </button>
          ))}
        </div>

        {/* CHRONICLE TAB */}
        {tab === 'chronicle' && (
          <div className="flex flex-col gap-4">
            {chronicle.length === 0 && (
              <p className="text-mist/40 italic text-center font-mono text-sm">No entries yet.</p>
            )}
            {[...chronicle].reverse().map((entry, i) => {
              const rowKey = entry.eventId ?? `row-${i}-${entry.tick}`;
              const sim = entry.eventId ? simById.get(entry.eventId) : undefined;
              const expanded = entry.eventId ? !!openById[entry.eventId] : false;
              return (
                <motion.div
                  key={rowKey}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.8) }}
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
        )}

        {/* PEOPLE TAB */}
        {tab === 'people' && (
          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] text-mist/40 tracking-widest uppercase mb-2">
              {relationships.length} recorded relationship{relationships.length !== 1 ? 's' : ''} — sorted by strength
            </p>

            {relationships.length === 0 && (
              <div className="text-center py-12">
                <p className="text-mist/40 italic font-mono text-sm">No relationships formed yet.</p>
                <p className="text-mist/25 font-mono text-xs mt-2">Interactions between NPCs build over time.</p>
              </div>
            )}

            {relationships.map((edge, i) => {
              const { label, color } = sentimentLabel(edge.sentiment);
              const bar = sentimentBar(edge.sentiment);
              const fromName = edge.fromId.replace(/_/g, ' ');
              const toName = edge.toId.replace(/_/g, ' ');
              const isPositive = edge.sentiment >= 0;
              return (
                <motion.div
                  key={`${edge.fromId}|${edge.toId}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.025, 0.8) }}
                  className="border border-gold/10 bg-gold/[0.02] px-4 py-3 rounded-sm"
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-display text-sm text-parchment capitalize truncate">{fromName}</span>
                      <span className="text-mist/30 text-xs">↔</span>
                      <span className="font-display text-sm text-parchment capitalize truncate">{toName}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`font-mono text-[10px] uppercase tracking-widest ${color}`}>{label}</span>
                      <span className="font-mono text-[10px] text-mist/30 ml-2">
                        {isPositive ? '+' : ''}{edge.sentiment}
                      </span>
                    </div>
                  </div>
                  {/* Sentiment bar */}
                  <div className={`font-mono text-[9px] mt-1.5 tracking-tighter ${isPositive ? 'text-green-500/60' : 'text-red-500/60'}`}>
                    {bar}
                  </div>
                  <div className="flex gap-4 mt-1.5 font-mono text-[10px] text-mist/35">
                    <span>{edge.interactions} interaction{edge.interactions !== 1 ? 's' : ''}</span>
                    {edge.sharedHistory.length > 0 && (
                      <span className="truncate italic text-mist/25">
                        {edge.sharedHistory[edge.sharedHistory.length - 1]}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

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
