import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('MUD command UI wiring', () => {
  it('renders a command prompt from the play shell and sends socket command messages', () => {
    const commandPanel = readSource('src/components/game/CommandPanel.tsx');
    const gameShell = readSource('src/components/game/GameShell.tsx');
    const hook = readSource('src/client/useGameplaySocket.ts');

    expect(commandPanel).toContain('Field Command');
    expect(commandPanel).toContain('onCommand');
    expect(commandPanel).toContain('placeholder="look / consider / search / north"');
    expect(gameShell).toContain('<CommandPanel disabled={!canCommand} onCommand={sendCommand} />');
    expect(hook).toContain("type: 'command'");
  });
});
