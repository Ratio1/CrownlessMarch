import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('gameplay socket reconnect retention', () => {
  it('keeps the last shard snapshot visible while a retry is binding', () => {
    const hookSource = readSource('src/client/useGameplaySocket.ts');

    expect(hookSource).toContain('if (!isRetry) {');
    expect(hookSource).toContain('setSnapshot(null);');
    expect(hookSource).toContain('setShardWorldInstanceId(null);');
  });

  it('allows reset flows to request graceful socket logout before reattaching', () => {
    const hookSource = readSource('src/client/useGameplaySocket.ts');

    expect(hookSource).toContain('thornwrithe:graceful-disconnect');
    expect(hookSource).toContain("socket.send(JSON.stringify({ type: 'logout' }))");
    expect(hookSource).toContain('window.addEventListener');
    expect(hookSource).toContain('window.removeEventListener');
  });

  it('routes terminal play sessions away from /play instead of leaving a depleted field view', () => {
    const hookSource = readSource('src/client/useGameplaySocket.ts');
    const shellSource = readSource('src/components/game/GameShell.tsx');

    expect(hookSource).toContain("window.location.replace('/create-character?allocation=required')");
    expect(hookSource).toContain("window.location.replace('/create-character')");
    expect(shellSource).toContain("navigation.type === 'reload'");
    expect(shellSource).toContain("window.location.replace('/')");
    expect(shellSource).toContain("status === 'disconnected'");
  });
});
