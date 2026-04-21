import { useGameStore } from '@/lib/gameStore';
import TitleScreen from '@/components/game/TitleScreen';
import BootingScreen from '@/components/game/BootingScreen';
import GameScreen from '@/components/game/GameScreen';

const Index = () => {
  const phase = useGameStore(s => s.phase);

  if (phase === 'title') {
    return <TitleScreen />;
  }

  if (phase === 'booting') {
    return <BootingScreen />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-ink">
      <GameScreen />
    </div>
  );
};

export default Index;
