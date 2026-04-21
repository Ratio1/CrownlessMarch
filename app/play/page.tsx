import { GameShell } from '@/components/game/GameShell';

export default function PlayPage() {
  const gameplayPath = process.env.THORNWRITHE_WEBSOCKET_PATH ?? '/ws';

  return (
    <main className="page page--play">
      <GameShell gameplayPath={gameplayPath} />
    </main>
  );
}
