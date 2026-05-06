import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('combat log panel ordering', () => {
  it('renders newest log entries first while preserving scrollback below', () => {
    const panelSource = readSource('src/components/game/CombatLogPanel.tsx');

    expect(panelSource).toContain('activityLog.slice().reverse()');
    expect(panelSource).toContain('logs.slice().reverse()');
    expect(panelSource).toContain('entry.id === latestActivityEntryId');
    expect(panelSource).toContain('entry === latestCombatLogEntry');
  });
});
