import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { SPELL_LIST } from '@/lib/arcaneSystem';
import { useShallow } from 'zustand/react/shallow';

function ArcanePanel() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const castSpellAction = useGameStore(s => s.castSpellAction);
  const { mana, maxMana, knownSpells, spellCooldowns, tick, phase, arcaneRep } = useGameStore(
    useShallow(s => ({
      mana: s.mana,
      maxMana: s.maxMana,
      knownSpells: s.knownSpells,
      spellCooldowns: s.spellCooldowns,
      tick: s.tick,
      phase: s.phase,
      arcaneRep: s.reputation.arcane,
    }))
  );

  const manaPercent = maxMana > 0 ? (mana / maxMana) * 100 : 0;
  const canCast = phase === 'playing' || phase === 'battle';

  return (
    <AnimatePresence>
      {overlay === 'arcane' && (
        <motion.div
          initial={{ opacity: 0, x: 80 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 80 }}
          transition={{ type: 'spring', damping: 28, stiffness: 240 }}
          className="absolute top-0 right-0 bottom-0 z-40 w-80 bg-ink/97 border-l border-gold/20 backdrop-blur-md overflow-y-auto game-scroll pointer-events-auto"
        >
          <div className="p-5 flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base text-gold uppercase tracking-widest">Arcane</h2>
              <button
                onClick={() => setOverlay('none')}
                className="font-mono-game text-[10px] text-mist/60 hover:text-gold transition-colors cursor-pointer"
              >
                [Z] Close
              </button>
            </div>

            {/* Mana bar */}
            <div className="border border-gold/15 bg-gold/[0.03] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] text-gold/70 uppercase tracking-widest">Mana</span>
                <span className="font-mono text-[11px] text-sky-300">{mana} / {maxMana}</span>
              </div>
              <div className="h-2 bg-foreground/5 overflow-hidden">
                <motion.div
                  className="h-full bg-sky-400/70"
                  animate={{ width: `${manaPercent}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <p className="font-mono text-[9px] text-mist/40 mt-1.5">Regenerates +2 per world tick</p>
            </div>

            {/* Arcane reputation */}
            <div className="flex items-center gap-2 px-1">
              <span className="font-mono text-[10px] text-gold/50 uppercase tracking-widest">Arcane Rep</span>
              <div className="flex-1 h-1 bg-foreground/5 overflow-hidden">
                <motion.div
                  className="h-full bg-purple-400/60"
                  animate={{ width: `${arcaneRep}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="font-mono text-[10px] text-purple-300">{arcaneRep}</span>
            </div>

            {/* Spells */}
            <div>
              <p className="font-mono text-[10px] text-gold/50 uppercase tracking-widest mb-2">
                Spells — {knownSpells.length} / {SPELL_LIST.length} learned
              </p>
              <div className="flex flex-col gap-2">
                {SPELL_LIST.map(spell => {
                  const known = knownSpells.includes(spell.id);
                  const cooldownUntil = spellCooldowns[spell.id] ?? 0;
                  const onCooldown = tick < cooldownUntil;
                  const hasEnoughMana = mana >= spell.manaCost;
                  const castable = known && canCast && !onCooldown && hasEnoughMana;

                  return (
                    <div
                      key={spell.id}
                      className={`border p-3 transition-all ${
                        !known
                          ? 'border-gold/5 opacity-40'
                          : onCooldown
                          ? 'border-gold/10 opacity-60'
                          : 'border-gold/20 bg-gold/[0.02]'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg shrink-0">{known ? spell.icon : '🔒'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className={`font-mono text-[11px] truncate ${known ? 'text-parchment' : 'text-mist/50'}`}>
                              {spell.name}
                            </p>
                            {known && (
                              <span className="font-mono text-[10px] text-sky-400 shrink-0">{spell.manaCost} MP</span>
                            )}
                          </div>
                          <p className="font-mono text-[10px] text-mist/60 leading-snug">
                            {known ? spell.description : `Learn from: ${spell.scrollId.replace('scroll_', 'Scroll: ').replace(/_/g, ' ')}`}
                          </p>
                          {known && onCooldown && (
                            <p className="font-mono text-[9px] text-gold/40 mt-1">
                              Cooldown: {cooldownUntil - tick} tick{cooldownUntil - tick !== 1 ? 's' : ''} remaining
                            </p>
                          )}
                          {known && !onCooldown && (
                            <p className="font-mono text-[9px] text-gold/30 mt-1">
                              CD: {spell.cooldownTicks} ticks{spell.requiresBattle ? ' · Battle only' : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      {known && (
                        <button
                          onClick={() => castSpellAction(spell.id)}
                          disabled={!castable}
                          className={`mt-2 w-full px-2 py-1 border font-mono-game text-[10px] uppercase tracking-wider transition-all
                            ${castable
                              ? 'border-gold/30 text-gold hover:bg-gold/10 hover:border-gold/60 cursor-pointer'
                              : 'border-gold/5 text-mist/30 cursor-not-allowed'
                            }`}
                        >
                          {!hasEnoughMana ? `Need ${spell.manaCost} MP` : onCooldown ? 'Cooling Down' : `Cast`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Acquire hint */}
            {knownSpells.length < SPELL_LIST.length && (
              <div className="border border-gold/8 bg-gold/[0.02] p-3">
                <p className="font-mono text-[10px] text-mist/40 leading-snug">
                  Find spell scrolls in dungeons or buy them from Scholarium merchants.
                  Crush Crystal Shards (E) to restore mana.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(ArcanePanel);
