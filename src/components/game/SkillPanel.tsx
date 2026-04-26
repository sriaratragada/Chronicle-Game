import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { PERKS, xpForLevel, SkillTree } from '@/lib/skills';

const SKILL_ICONS: Record<string, string> = { combat: '⚔️', stealth: '🗡️', diplomacy: '🤝', crafting: '🔨' };
const SKILL_COLORS: Record<string, string> = { combat: 'bg-red-600', stealth: 'bg-purple-600', diplomacy: 'bg-blue-600', crafting: 'bg-amber-600' };

function SkillPanel() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const skills = useGameStore(s => s.skills);
  const selectPerkAction = useGameStore(s => s.selectPerkAction);

  if (overlay !== 'skills') return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-ink/95 backdrop-blur-md overflow-auto pointer-events-auto">
        <div className="max-w-2xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl text-gold gold-glow">Skills</h2>
            <button onClick={() => setOverlay('none')} className="font-mono-game text-xs text-mist hover:text-gold transition-colors cursor-pointer">[ESC] Close</button>
          </div>
          <div className="space-y-6">
            {(Object.keys(skills) as (keyof SkillTree)[]).map(skill => {
              const branch = skills[skill];
              const nextXp = xpForLevel(branch.level + 1);
              const progress = branch.level >= 10 ? 100 : (branch.xp / nextXp) * 100;
              const available = PERKS.filter(p => p.skill === skill && branch.level >= p.levelReq && !branch.perks.includes(p.id));
              return (
                <div key={skill} className="border border-gold/10 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg">{SKILL_ICONS[skill]}</span>
                    <span className="font-display text-sm text-parchment capitalize">{skill}</span>
                    <span className="font-mono-game text-[10px] text-gold ml-auto">Lv {branch.level}</span>
                  </div>
                  <div className="h-1.5 bg-ash rounded-full overflow-hidden mb-2">
                    <div className={`h-full ${SKILL_COLORS[skill]} rounded-full transition-all`} style={{ width: `${progress}%` }} />
                  </div>
                  <p className="font-mono-game text-[9px] text-mist/50">{branch.xp} / {nextXp} XP</p>
                  {available.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {available.map(perk => (
                        <div key={perk.id} className="flex items-center justify-between border border-gold/5 p-2">
                          <div>
                            <p className="font-display text-[10px] text-parchment">{perk.name}</p>
                            <p className="font-mono-game text-[8px] text-mist/50">{perk.description}</p>
                          </div>
                          <button onClick={() => selectPerkAction(perk.id)} className="px-2 py-1 border border-gold/20 font-mono-game text-[9px] text-gold hover:bg-gold/10 cursor-pointer">Learn</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {branch.perks.length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {branch.perks.map(pid => { const p = PERKS.find(x => x.id === pid); return <span key={pid} className="px-1.5 py-0.5 bg-gold/10 font-mono-game text-[8px] text-gold">{p?.name ?? pid}</span>; })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(SkillPanel);
