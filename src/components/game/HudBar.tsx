import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { SEASON_NAMES, SEASON_ICONS, REP_LABELS, LOCATIONS, ENVIRONMENT_ACTIONS } from '@/lib/gameData';
import { TileType, TILE_NAMES, getTileAt, getContinentAt, type ContinentId } from '@/lib/mapGenerator';
import { getHamlets, isHamletId } from '@/lib/hamlets';
import { getWeatherIcon } from '@/lib/weatherSystem';
import { getTimeString } from '@/lib/timeSystem';
import { getTotalArmor, getWeaponDamage } from '@/lib/craftingSystem';
import { ITEMS } from '@/lib/items';
import WorldConditions from '@/components/game/WorldConditions';

const DAY_ICONS: Record<string, string> = { dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙' };
const CONTINENT_NAMES: Record<string, string> = { auredia: 'Auredia', trivalen: 'Trivalen', uloren: 'Uloren' };

export default function HudBar() {
  const [hoverHealth, setHoverHealth] = useState(false);
  const [hoverHunger, setHoverHunger] = useState(false);
  const [hoverSeason, setHoverSeason] = useState(false);
  const [hoverRep, setHoverRep] = useState<string | null>(null);

  const season = useGameStore(s => s.season);
  const tick = useGameStore(s => s.tick);
  const worldTime = useGameStore(s => s.worldTime);
  const dayNightPhase = useGameStore(s => s.dayNightPhase);
  const playerTitle = useGameStore(s => s.playerTitle);
  const nearestLocation = useGameStore(s => s.nearestLocation);
  const reputation = useGameStore(s => s.reputation);
  const playerX = useGameStore(s => s.playerX);
  const playerY = useGameStore(s => s.playerY);
  const environmentCooldowns = useGameStore(s => s.environmentCooldowns);
  const setOverlay = useGameStore(s => s.setOverlay);
  const performEnvironmentAction = useGameStore(s => s.performEnvironmentAction);
  const health = useGameStore(s => s.health);
  const maxHealth = useGameStore(s => s.maxHealth);
  const hunger = useGameStore(s => s.hunger);
  const gold = useGameStore(s => s.gold);
  const phase = useGameStore(s => s.phase);
  const mounted = useGameStore(s => s.mounted);
  const inventory = useGameStore(s => s.inventory);
  const regionalModifiers = useGameStore(s => s.regionalModifiers);

  const continent = useGameStore(s => getContinentAt(s.playerX, s.playerY));
  const weatherStateHere = useGameStore(s => {
    const c = getContinentAt(s.playerX, s.playerY) as ContinentId | null;
    return c ? s.weather[c]?.state ?? 'clear' : 'clear';
  });

  const hamletNear = useMemo(() => {
    if (!nearestLocation || !isHamletId(nearestLocation)) return null;
    return getHamlets().find(h => h.id === nearestLocation) ?? null;
  }, [nearestLocation]);

  const locData = useMemo(
    () => (nearestLocation ? LOCATIONS.find(l => l.id === nearestLocation) : null),
    [nearestLocation],
  );

  const locationDisplay = hamletNear
    ? { name: hamletNear.displayName, icon: '🛖' }
    : locData
      ? { name: locData.name, icon: locData.icon }
      : null;

  const weaponDmg = getWeaponDamage(inventory);
  const totalArmor = getTotalArmor(inventory);
  const mainhand = inventory.equipment['mainhand'];
  const weaponDef = mainhand ? ITEMS[mainhand.itemId] : null;

  const currentTile: TileType = useMemo(
    () => (TILE_NAMES[getTileAt(playerX, playerY)] ?? 'grass') as TileType,
    [playerX, playerY],
  );

  const availableActions = ENVIRONMENT_ACTIONS.filter(a =>
    a.terrain === currentTile && (!environmentCooldowns[a.id] || tick >= environmentCooldowns[a.id])
  );

  // Get top 3 rep stats
  const topReps = Object.entries(reputation)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .filter(([, v]) => v > 0);

  const keybindStrip =
    phase === 'battle' ? (
      <span>
        Strike <kbd className="text-gold/70">1</kbd>/<kbd className="text-gold/70">A</kbd> · Guard <kbd className="text-gold/70">2</kbd>/<kbd className="text-gold/70">G</kbd> ·
        Flee <kbd className="text-gold/70">3</kbd>/<kbd className="text-gold/70">F</kbd> · <kbd className="text-gold/70">Esc</kbd> close panels
      </span>
    ) : (
      <span>
        Move <kbd className="text-gold/70">WASD</kbd> · Inv <kbd className="text-gold/70">I</kbd> · Craft <kbd className="text-gold/70">K</kbd> · Skills <kbd className="text-gold/70">L</kbd> ·
        Quests <kbd className="text-gold/70">Q</kbd> · Faction <kbd className="text-gold/70">F</kbd> · Shop <kbd className="text-gold/70">M</kbd> · Build <kbd className="text-gold/70">B</kbd> ·
        Travel <kbd className="text-gold/70">T</kbd> · Save <kbd className="text-gold/70">F5</kbd> · Hotbar <kbd className="text-gold/70">1–6</kbd> · Use <kbd className="text-gold/70">E</kbd> ·
        Atk <kbd className="text-gold/70">J</kbd> · Help <kbd className="text-gold/70">H</kbd>/<kbd className="text-gold/70">?</kbd> · <kbd className="text-gold/70">Esc</kbd>
      </span>
    );

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-auto">
      <div className="flex justify-center px-2 mb-1">
        <div className="max-w-full overflow-x-auto overflow-y-hidden font-mono-game text-[8px] text-mist/55 tracking-tight whitespace-nowrap py-1 px-2 rounded border border-gold/10 bg-ink/90 backdrop-blur-sm">
          {keybindStrip}
        </div>
      </div>
      {/* Environment actions row */}
      {availableActions.length > 0 && (
        <div className="flex justify-center gap-2 mb-1 px-4">
          {availableActions.map(action => (
            <button
              key={action.id}
              onClick={() => performEnvironmentAction(action.id)}
              className="px-3 py-1 bg-ink/90 border border-gold/20 font-mono-game text-[10px] text-gold
                hover:bg-gold/10 hover:border-gold/40 transition-all cursor-pointer backdrop-blur-sm"
              title={action.label}
            >
              {action.icon} {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Main HUD bar */}
      <div className="bg-ink/95 border-t border-gold/15 backdrop-blur-md px-4 py-2">
        <div className="flex items-center justify-between max-w-screen-xl mx-auto">
          {/* Left — vital bars + season & location */}
          <div className="flex flex-col gap-1">
            {/* Vital bars */}
            <div className="flex items-center gap-3">
              {/* Health bar with tooltip */}
              <div className="flex items-center gap-1 relative" onMouseEnter={() => setHoverHealth(true)} onMouseLeave={() => setHoverHealth(false)}>
                <span className="text-[11px]">❤️</span>
                <div className="w-20 h-1.5 bg-ash overflow-hidden border border-gold/10">
                  <div
                    className={`h-full transition-all duration-300 ${health < 25 ? 'animate-pulse-blood bg-blood' : 'bg-blood/70'}`}
                    style={{ width: `${(health / maxHealth) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-[8px] text-mist/50">{Math.ceil(health)}</span>
                {/* Tooltip */}
                <AnimatePresence>
                  {hoverHealth && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute bottom-full mb-1 left-0 bg-ink/95 border border-gold/20 px-2 py-1 rounded text-[8px] text-mist whitespace-nowrap z-50"
                    >
                      Health: {Math.ceil(health)}/{maxHealth}. Reaches 0 when starving.
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Hunger bar with tooltip */}
              <div className="flex items-center gap-1 relative" onMouseEnter={() => setHoverHunger(true)} onMouseLeave={() => setHoverHunger(false)}>
                <span className="text-[11px]">🍖</span>
                <div className="w-20 h-1.5 bg-ash overflow-hidden border border-gold/10">
                  <div
                    className={`h-full transition-all duration-300 ${hunger < 20 ? 'animate-pulse-amber bg-rust' : 'bg-rust/70'}`}
                    style={{ width: `${hunger}%` }}
                  />
                </div>
                <span className="font-mono text-[8px] text-mist/50">{Math.ceil(hunger)}</span>
                {/* Tooltip */}
                <AnimatePresence>
                  {hoverHunger && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute bottom-full mb-1 left-0 bg-ink/95 border border-gold/20 px-2 py-1 rounded text-[8px] text-mist whitespace-nowrap z-50"
                    >
                      Hunger: {Math.ceil(hunger)}%. Press E to eat.
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {/* Info row */}
            <div className="flex items-center gap-3 flex-wrap">
            {/* Time + day phase */}
            <span className="font-mono-game text-[10px] text-mist">{DAY_ICONS[dayNightPhase] ?? '☀️'} {getTimeString(worldTime)}</span>
            {/* Weather */}
            {continent && <span className="font-mono-game text-[10px] text-mist">{getWeatherIcon(weatherStateHere as any)}</span>}
            {/* Season */}
            <div className="flex items-center gap-1.5 relative" onMouseEnter={() => setHoverSeason(true)} onMouseLeave={() => setHoverSeason(false)}>
              <span className="text-sm">{SEASON_ICONS[season]}</span>
              <span className="font-mono-game text-[10px] text-mist uppercase tracking-wider">
                {SEASON_NAMES[season]}
              </span>
              {/* Season tooltip */}
              <AnimatePresence>
                {hoverSeason && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-full mt-1 left-0 bg-ink/95 border border-gold/20 px-2 py-1 rounded text-[8px] text-mist whitespace-nowrap z-50"
                  >
                    {season === 'dark' ? 'Winter: Hunger decays faster (0.75/tick)' : 'Hunger decays at normal rate (0.5/tick)'}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {locationDisplay && (
              <div className="flex items-center gap-1.5 border-l border-gold/10 pl-3">
                <span className="text-sm">{locationDisplay.icon}</span>
                <span className="font-display text-xs text-parchment">{locationDisplay.name}</span>
              </div>
            )}
            {continent && <span className="font-mono-game text-[9px] text-mist/40 border-l border-gold/10 pl-3">{CONTINENT_NAMES[continent] ?? continent}</span>}
            {phase === 'sailing' && <span className="font-mono-game text-[9px] text-blue-400 border-l border-gold/10 pl-3">⛵ SAILING</span>}
            {phase === 'battle' && <span className="font-mono-game text-[9px] text-rose-400 border-l border-gold/10 pl-3">⚔ DUEL</span>}
            {mounted === 'horse' && <span className="font-mono-game text-[9px] text-amber-400 border-l border-gold/10 pl-3">🐎 MOUNTED</span>}
            <WorldConditions modifiers={regionalModifiers} />
            </div>{/* end info row */}
          </div>{/* end left col */}

          {/* Center — title + stats */}
          <div className="flex flex-col items-center gap-0.5 hidden sm:flex">
            <span className="font-display text-xs text-gold gold-glow">{playerTitle}</span>
            <div className="flex items-center gap-3 font-mono-game text-[9px] text-mist/50">
              <span>🪙 {gold}g</span>
              <span>{weaponDef?.icon ?? '✊'} {weaponDmg} dmg</span>
              <span>🛡 {totalArmor} def</span>
            </div>
          </div>

          {/* Right — rep icons + hotkeys */}
          <div className="flex items-center gap-3">
            {topReps.map(([key, val]) => (
              <div key={key} className="relative" onMouseEnter={() => setHoverRep(key as string)} onMouseLeave={() => setHoverRep(null)}>
                <div className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${REP_LABELS[key]?.color}`} />
                  <span className="font-mono-game text-[9px] text-mist">{val}</span>
                </div>
                {/* Rep tooltip */}
                <AnimatePresence>
                  {hoverRep === key && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute top-full mt-1 right-0 bg-ink/95 border border-gold/20 px-2 py-1 rounded text-[8px] text-mist whitespace-nowrap z-50"
                    >
                      {REP_LABELS[key]?.label}: {val}/100
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
            <div className="flex items-center gap-1 border-l border-gold/10 pl-3">
              <button
                onClick={() => setOverlay('player')}
                className="px-2 py-0.5 font-mono-game text-[9px] text-gold/60 hover:text-gold border border-gold/10 hover:border-gold/30 transition-all cursor-pointer"
              >
                [P]
              </button>
              <button
                onClick={() => setOverlay('chronicle')}
                className="px-2 py-0.5 font-mono-game text-[9px] text-gold/60 hover:text-gold border border-gold/10 hover:border-gold/30 transition-all cursor-pointer"
              >
                [C]
              </button>
              <button
                onClick={() => setOverlay('help')}
                className="px-2 py-0.5 font-mono-game text-[9px] text-gold/60 hover:text-gold border border-gold/10 hover:border-gold/30 transition-all cursor-pointer"
              >
                [?]
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
