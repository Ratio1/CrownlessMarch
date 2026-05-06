import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('beta character reset panel', () => {
  it('forces a fresh playfield attach after reset so the live sheet and sprite class refresh', () => {
    const source = readSource('src/components/game/CharacterResetPanel.tsx');

    expect(source).toContain('thornwrithe:graceful-disconnect');
    expect(source).toContain('window.dispatchEvent');
    expect(source).toContain("window.location.assign('/play')");
    expect(source).not.toContain('useRouter');
    expect(source).not.toContain('router.refresh()');
  });
});
