import { GameShell } from '@/components/game/GameShell';
import { resolveThornwritheVersion } from '@/server/app-version';

export default function PlayPage() {
  const gameplayPath = process.env.THORNWRITHE_WEBSOCKET_PATH ?? '/ws';
  const version = resolveThornwritheVersion();

  return (
    <main className="page page--play">
      <GameShell gameplayPath={gameplayPath} versionLabel={version.label} />
    </main>
  );
}
