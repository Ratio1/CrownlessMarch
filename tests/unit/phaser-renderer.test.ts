import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Phaser renderer configuration', () => {
  it('uses the Canvas renderer so live mobile screenshots capture atlas graphics', () => {
    const source = readSource('src/client/phaser/createGame.ts');

    expect(source).toContain('type: Phaser.CANVAS');
    expect(source).not.toContain('type: Phaser.AUTO');
  });
});
