import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';

function QuestLog() {
  const overlay = useGameStore(s => s.overlay);
  const setOverlay = useGameStore(s => s.setOverlay);
  const quests = useGameStore(s => s.quests);
  const bountyBoards = useGameStore(s => s.bountyBoards);
  const currentLocation = useGameStore(s => s.currentLocation);
  const acceptQuest = useGameStore(s => s.acceptQuest);

  if (overlay !== 'quests') return null;

  const active = quests.filter(q => q.state === 'active');
  const completed = quests.filter(q => q.state === 'completed');
  const board = bountyBoards[currentLocation];

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-ink/95 backdrop-blur-md overflow-auto pointer-events-auto">
        <div className="max-w-2xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl text-gold gold-glow">Quest Log</h2>
            <button onClick={() => setOverlay('none')} className="font-mono-game text-xs text-mist hover:text-gold transition-colors cursor-pointer">[ESC] Close</button>
          </div>

          {board && (
            <div className="mb-6">
              <h3 className="font-display text-sm text-parchment/70 uppercase tracking-wider mb-3">Bounty Board — {currentLocation.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h3>
              <div className="space-y-1">
                {board.bounties.map(bounty => {
                  const alreadyAccepted = quests.some(q => q.id === bounty.id);
                  return (
                    <div key={bounty.id} className="border border-gold/10 p-2 flex items-center justify-between">
                      <div>
                        <p className="font-display text-[10px] text-parchment">{bounty.title}</p>
                        <p className="font-mono-game text-[8px] text-mist/50">{bounty.description}</p>
                        <p className="font-mono-game text-[8px] text-gold">Reward: {bounty.rewards.gold}g</p>
                      </div>
                      {!alreadyAccepted && (
                        <button onClick={() => acceptQuest(bounty)} className="px-2 py-1 border border-gold/20 font-mono-game text-[9px] text-gold hover:bg-gold/10 cursor-pointer">Accept</button>
                      )}
                      {alreadyAccepted && <span className="font-mono-game text-[9px] text-rep-craft">Accepted</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mb-6">
            <h3 className="font-display text-sm text-parchment/70 uppercase tracking-wider mb-3">Active Quests ({active.length})</h3>
            {active.length === 0 ? (
              <p className="font-mono-game text-[10px] text-mist/40 italic">No active quests. Visit bounty boards or talk to NPCs.</p>
            ) : (
              <div className="space-y-2">
                {active.map(q => (
                  <div key={q.id} className="border border-gold/10 p-3">
                    <p className="font-display text-xs text-parchment mb-1">{q.title}</p>
                    <p className="font-mono-game text-[9px] text-mist/50 mb-2">{q.description}</p>
                    {q.steps.map((step, i) => (
                      <p key={i} className={`font-mono-game text-[9px] ${step.completed ? 'text-rep-craft line-through' : 'text-gold'}`}>
                        {step.completed ? '✓' : '○'} {step.description}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {completed.length > 0 && (
            <div>
              <h3 className="font-display text-sm text-parchment/70 uppercase tracking-wider mb-3">Completed ({completed.length})</h3>
              <div className="space-y-1">
                {completed.map(q => (
                  <div key={q.id} className="border border-gold/5 p-2 opacity-60">
                    <p className="font-display text-[10px] text-parchment">{q.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(QuestLog);
