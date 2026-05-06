import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('play layout UI', () => {
  it('keeps the main dashboard focused and moves full sheets into tabs', () => {
    const shellSource = readSource('src/components/game/GameShell.tsx');
    const worldFieldSource = readSource('src/components/game/WorldField.tsx');
    const infoTabsSource = readSource('src/components/game/InfoTabs.tsx');

    expect(shellSource).toContain('<WorldField snapshot={snapshot} />');
    expect(shellSource).toContain('<CombatLogPanel');
    expect(shellSource).toContain('<CommandPanel');
    expect(shellSource).toContain('<ShortCharacterPanel');
    expect(shellSource).toContain('<InfoTabs snapshot={snapshot} />');
    expect(worldFieldSource).toContain('world-field__fight-banner');
    expect(infoTabsSource).toContain('Full Character');
    expect(infoTabsSource).toContain('Quests');
  });
});
