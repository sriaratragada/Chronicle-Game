import { useGameStore } from '@/lib/gameStore';
import { REP_LABELS, FACTION_INFO, SEASON_NAMES, SEASON_ICONS } from '@/lib/gameData';
import { MILESTONE_LIST } from '@/lib/progressionRegistry';
import { motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';

const CATEGORY_LABELS: Record<string, string> = {
  explorer: '🗺️ Explorer',
  warrior: '⚔️ Warrior',
  merchant: '💰 Merchant',
  craftsman: '🔨 Craftsman',
  diplomat: '📜 Diplomat',
  scholar: '📚 Scholar',
  survivor: '🛡️ Survivor',
};

export default function PlayerPanel() {
  const { reputation, factions, playerTitle, tick, season, visitedLocations, milestonesUnlocked } = useGameStore(
    useShallow(s => ({
      reputation: s.reputation,
      factions: s.factions,
      playerTitle: s.playerTitle,
      tick: s.tick,
      season: s.season,
      visitedLocations: s.visitedLocations,
      milestonesUnlocked: s.milestonesUnlocked,
    })),
  );
  const viewChronicle = useGameStore(s => s.viewChronicle);

  const unlockedSet = new Set(milestonesUnlocked);
  const totalMilestones = MILESTONE_LIST.length;
  const unlockedCount = milestonesUnlocked.length;

  const byCategory = MILESTONE_LIST.reduce<Record<string, typeof MILESTONE_LIST>>((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-y-auto game-scroll">
      {/* Player Identity */}
      <div className="border border-gold/20 bg-gold/[0.03] p-4">
        <p className="font-mono text-[10px] tracking-[0.3em] text-gold uppercase mb-1">Identity</p>
        <h2 className="font-display text-lg font-bold text-parchment">{playerTitle}</h2>
        <div className="flex items-center gap-3 mt-2 text-mist text-sm">
          <span className="font-mono text-[11px]">{SEASON_ICONS[season]} {SEASON_NAMES[season]}</span>
          <span className="font-mono text-[11px] text-gold/50">Tick {tick}</span>
        </div>
      </div>

      {/* Reputation */}
      <div className="border border-gold/20 bg-gold/[0.03] p-4">
        <p className="font-mono text-[10px] tracking-[0.3em] text-gold uppercase mb-3">Reputation</p>
        <div className="flex flex-col gap-2.5">
          {Object.entries(REP_LABELS).map(([key, { label, color }]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-mist w-20 shrink-0 uppercase tracking-wider">{label}</span>
              <div className="flex-1 h-1.5 bg-foreground/5 relative overflow-hidden">
                <motion.div
                  className={`h-full ${color}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${reputation[key as keyof typeof reputation]}%` }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="font-mono text-[11px] text-gold w-8 text-right">
                {reputation[key as keyof typeof reputation]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Factions */}
      <div className="border border-gold/20 bg-gold/[0.03] p-4">
        <p className="font-mono text-[10px] tracking-[0.3em] text-gold uppercase mb-3">Faction Standing</p>
        <div className="flex flex-col gap-2">
          {Object.entries(FACTION_INFO).map(([key, { name, icon }]) => {
            const val = factions[key as keyof typeof factions];
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-sm">{icon}</span>
                <span className="font-mono text-[10px] text-mist flex-1 truncate">{name}</span>
                <span className={`font-mono text-[11px] ${val > 0 ? 'text-rep-trade' : val < 0 ? 'text-blood' : 'text-mist'}`}>
                  {val > 0 ? '+' : ''}{val}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Locations discovered */}
      <div className="border border-gold/20 bg-gold/[0.03] p-4">
        <p className="font-mono text-[10px] tracking-[0.3em] text-gold uppercase mb-2">Discovered</p>
        <p className="font-mono text-[11px] text-mist">{visitedLocations.length} / 11 locations</p>
      </div>

      {/* Milestones */}
      <div className="border border-gold/20 bg-gold/[0.03] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[10px] tracking-[0.3em] text-gold uppercase">Milestones</p>
          <span className="font-mono text-[11px] text-gold">{unlockedCount} / {totalMilestones}</span>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-foreground/5 mb-4">
          <motion.div
            className="h-full bg-gold/60"
            initial={{ width: 0 }}
            animate={{ width: `${(unlockedCount / totalMilestones) * 100}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <div className="flex flex-col gap-4">
          {Object.entries(CATEGORY_LABELS).map(([cat, catLabel]) => {
            const milestones = byCategory[cat] ?? [];
            const catUnlocked = milestones.filter(m => unlockedSet.has(m.id)).length;
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] text-mist/70 uppercase tracking-wider">{catLabel}</span>
                  <span className="font-mono text-[10px] text-gold/50">{catUnlocked}/{milestones.length}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {milestones.map(m => {
                    const done = unlockedSet.has(m.id);
                    return (
                      <div
                        key={m.id}
                        className={`flex items-start gap-2 px-2 py-1.5 ${done ? 'bg-gold/[0.06]' : 'opacity-50'}`}
                        title={done ? `Reward: ${m.reward.text}` : m.description}
                      >
                        <span className="text-sm shrink-0 mt-0.5">{done ? m.icon : '🔒'}</span>
                        <div className="min-w-0">
                          <p className={`font-mono text-[11px] truncate ${done ? 'text-parchment' : 'text-mist'}`}>{m.label}</p>
                          <p className="font-mono text-[10px] text-mist/60 truncate">{done ? m.reward.text : m.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chronicle button */}
      <button
        onClick={viewChronicle}
        className="mt-auto border border-gold/20 bg-gold/[0.03] p-3 font-display text-xs tracking-[0.15em] text-gold uppercase
          hover:bg-gold/10 hover:border-gold/40 transition-all cursor-pointer"
      >
        📜 View The Chronicle
      </button>
    </div>
  );
}
