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
    expect(commandPanel).toContain("placeholder={combatMode ? 'flee' : 'look / consider goblin / lore / inventory'}");
    expect(commandPanel).toContain("combatMode ? ['flee'] : QUICK_COMMANDS");
    expect(commandPanel).toContain('command-panel__quick');
    expect(commandPanel).toContain('inventory');
    expect(commandPanel).toContain('lore goblin');
    expect(gameShell).toContain('combatMode={fightActive}');
    expect(hook).toContain("type: 'command'");
  });
});
