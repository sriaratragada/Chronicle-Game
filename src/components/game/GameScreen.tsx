import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/gameStore';
import { SEASON_NAMES } from '@/lib/gameData';
import WorldMap from '@/components/game/WorldMap';
import HudBar from '@/components/game/HudBar';
import EventPopup from '@/components/game/EventPopup';
import OverlayPanel from '@/components/game/OverlayPanel';
import Hotbar from '@/components/game/Hotbar';
import HelpPanel from '@/components/game/HelpPanel';
import InventoryPanel from '@/components/game/InventoryPanel';
import CraftingPanel from '@/components/game/CraftingPanel';
import SkillPanel from '@/components/game/SkillPanel';
import ShopPanel from '@/components/game/ShopPanel';
import FactionPanel from '@/components/game/FactionPanel';
import QuestLog from '@/components/game/QuestLog';
import DungeonView from '@/components/game/DungeonView';
import DialogueView from '@/components/game/DialogueView';
import SaveLoadPanel from '@/components/game/SaveLoadPanel';
import Minimap from '@/components/game/Minimap';
import BuildPanel from '@/components/game/BuildPanel';
import FastTravelPanel from '@/components/game/FastTravelPanel';
import RealmAtlasPanel, { prefetchAtlasTerrainCache } from '@/components/game/RealmAtlasPanel';
import CampStashPanel from '@/components/game/CampStashPanel';
import BattleScreen from '@/components/game/BattleScreen';

function DialogueOverlay() {
  const activeDialogue = useGameStore(s => s.activeDialogue);
  const setActiveDialogue = useGameStore(s => s.setActiveDialogue);
  if (!activeDialogue) return null;
  return (
    <DialogueView
      tree={activeDialogue}
      onClose={() => setActiveDialogue(null)}
      onEffect={opt => {
        if (opt.effects?.openRoadInnShop && activeDialogue.npcId.startsWith('road_inn_')) {
          useGameStore.setState({ shopMarketId: activeDialogue.npcId, overlay: 'shop' });
        }
      }}
    />
  );
}

export default function GameScreen() {
  const [showConfirm, setShowConfirm] = useState(false);
  const atlasPrefetchStarted = useRef(false);

  const phase     = useGameStore(s => s.phase);
  const chronicle = useGameStore(s => s.chronicle);
  const tick      = useGameStore(s => s.tick);
  const season    = useGameStore(s => s.season);
  const startGame = useGameStore(s => s.startGame);
  const lastEntry = chronicle[chronicle.length - 1] ?? null;
  const tutorialObjective = useGameStore(s => s.tutorialObjective);

  useEffect(() => {
    if (atlasPrefetchStarted.current) return;
    if (phase !== 'playing' && phase !== 'sailing') return;
    atlasPrefetchStarted.current = true;
    const run = () => prefetchAtlasTerrainCache();
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(run, { timeout: 3500 });
    } else {
      window.setTimeout(run, 450);
    }
  }, [phase]);

  const tutorialLines = [
    'Gather wood from trees (E) — you need 3 wood for a club.',
    'Craft a Wooden Club at the crafting panel (K).',
    'Hunt a deer, sheep, or rabbit (J when facing them).',
    'Cook raw meat into cooked meat (K → Cook).',
    'Travel to a major settlement (not just a hamlet).',
  ];

  return (
    <div className="relative w-full h-full overflow-hidden">
      {phase !== 'title' && phase !== 'dead' && tutorialObjective < 5 && tutorialLines[tutorialObjective] && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] max-w-lg px-4 py-1.5 rounded border border-gold/25 bg-ink/90 backdrop-blur-sm pointer-events-none">
          <p className="font-mono-game text-[10px] text-gold/90 text-center leading-snug">
            {tutorialLines[tutorialObjective]}
          </p>
        </div>
      )}
      {phase === 'dungeon' ? (
        <DungeonView />
      ) : (
        <>
          <WorldMap />
          <Minimap />
          {phase === 'battle' && <BattleScreen />}
        </>
      )}
      <Hotbar />
      <EventPopup />
      <HudBar />
      <OverlayPanel />
      <HelpPanel />
      <InventoryPanel />
      <CraftingPanel />
      <SkillPanel />
      <ShopPanel />
      <FactionPanel />
      <QuestLog />
      <SaveLoadPanel />
      <BuildPanel />
      <FastTravelPanel />
      <RealmAtlasPanel />
      <CampStashPanel />
      {phase !== 'dungeon' && <DialogueOverlay />}

      {/* Death Screen */}
      <AnimatePresence>
        {phase === 'dead' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center"
            style={{ background: 'radial-gradient(ellipse at center, hsl(0 30% 4% / 0.97) 40%, hsl(0 60% 2%) 100%)' }}
          >
            <motion.div
              className="flex flex-col items-center gap-6 px-8 text-center max-w-lg"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.8 }}
            >
              <div className="w-24 h-px bg-gradient-to-r from-transparent via-blood to-transparent" />
              <h2 className="font-display text-2xl text-parchment/70 tracking-[0.15em] uppercase">
                The chronicle ends here
              </h2>
              <div className="w-24 h-px bg-gradient-to-r from-transparent via-blood to-transparent" />
              {lastEntry && (
                <p className="font-body text-sm italic text-mist/60 leading-relaxed">
                  &ldquo;{lastEntry.text}&rdquo;
                </p>
              )}
              <p className="font-mono text-[10px] text-mist/40 uppercase tracking-widest">
                — Tick {tick}, {SEASON_NAMES[season]} —
              </p>
              <button
                onClick={() => setShowConfirm(true)}
                className="mt-4 px-8 py-3 border border-blood/30 bg-blood/5 font-display text-xs tracking-[0.2em] text-parchment/70 uppercase hover:bg-blood/15 hover:border-blood/60 transition-all duration-300 cursor-pointer"
              >
                Begin Again
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/50 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-ink border border-gold/30 p-8 max-w-sm mx-4"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="font-display text-lg text-parchment mb-3 tracking-[0.05em]">
                Restart Your Chronicle?
              </h3>
              <p className="text-sm text-mist/70 mb-6 leading-relaxed">
                Your current journey will be lost. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gold/20 bg-ink/50 font-display text-xs text-mist/70 uppercase tracking-wider hover:border-gold/40 hover:text-mist transition-all duration-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowConfirm(false); startGame(); }}
                  className="flex-1 px-4 py-2 border border-blood/40 bg-blood/10 font-display text-xs text-parchment/80 uppercase tracking-wider hover:bg-blood/20 hover:border-blood/60 transition-all duration-200 cursor-pointer"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
