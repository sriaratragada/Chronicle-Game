import { useGameStore } from '@/lib/gameStore';
import TitleScreen from '@/components/game/TitleScreen';
import BootingScreen from '@/components/game/BootingScreen';
import GameScreen from '@/components/game/GameScreen';
import TutorialOverlay from '@/components/game/TutorialOverlay';

/**
 * Root routing component.
 *
 * TutorialOverlay is kept at a STABLE position in the React tree (second child
 * of the fragment) so that the booting → playing phase transition does NOT
 * unmount/remount it. This lets the cinematic play uninterrupted while the
 * world bootstraps in the background.
 */
const Index = () => {
  const phase = useGameStore(s => s.phase);
  const showTutorial = useGameStore(s => s.showTutorial);

  // Title screen is its own full-page branch — tutorial doesn't apply here.
  if (phase === 'title') {
    return <TitleScreen />;
  }

  return (
    <>
      {/* Underlay — swaps between booting spinner and full game */}
      <div className="h-screen w-screen overflow-hidden bg-ink">
        {phase === 'booting'
          // If tutorial is showing we don't need the loading text; it's covered.
          ? (!showTutorial && <BootingScreen />)
          : <GameScreen />
        }
      </div>

      {/*
        TutorialOverlay sits here — same index-1 slot in the fragment regardless
        of whether phase is 'booting' or 'playing'. React reconciles it in-place,
        preserving all refs and state (scene counter, RAF, canvas timestamps).
      */}
      {showTutorial && <TutorialOverlay />}
    </>
  );
};

export default Index;
