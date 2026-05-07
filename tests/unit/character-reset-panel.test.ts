import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('beta character reset panel', () => {
  it('keeps the beta reset behind an explicit open and accept flow', () => {
    const source = readSource('src/components/game/CharacterResetPanel.tsx');

    expect(source).toContain('showResetForm');
    expect(source).toContain('setShowResetForm(true)');
    expect(source).toContain('accepted');
    expect(source).toContain('Accept & Apply Reset');
    expect(source).toContain('!accepted');
    expect(source).toContain('Beta testers can rebuild class and ability scores');
    expect(source).toContain('Point-buy spent');
    expect(source).toContain('Ability raises used');
    expect(source).not.toContain('pointBuyBudgetForLevel');
  });

  it('forces a fresh playfield attach after reset so the live sheet and sprite class refresh', () => {
    const source = readSource('src/components/game/CharacterResetPanel.tsx');

    expect(source).toContain('thornwrithe:graceful-disconnect');
    expect(source).toContain('window.dispatchEvent');
    expect(source).toContain("window.location.assign('/play')");
    expect(source).not.toContain('useRouter');
    expect(source).not.toContain('router.refresh()');
  });
});
