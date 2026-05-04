import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('quest panel UI', () => {
  it('marks ready quest cards and exposes the town turn-in destination', () => {
    const panelSource = readSource('src/components/game/QuestPanel.tsx');
    const css = readSource('app/globals.css');

    expect(panelSource).toContain('quest-card--ready');
    expect(panelSource).toContain('status-pill--ready');
    expect(panelSource).toContain('Return to town');
    expect(css).toContain('.quest-card--ready');
    expect(css).toContain('.status-pill--ready');
  });
});
