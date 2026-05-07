import fs from 'node:fs';
import path from 'node:path';

function readRepoSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), '..', '..', relativePath), 'utf8');
}

function readAppSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Thornwrithe xhigh artist artifact', () => {
  it('keeps a permanent hand-drawn bitmap sprite sub-agent contract in the repo artifacts', () => {
    const agent = readRepoSource('docs/agents/thornwrithe-xhigh-artist.md');
    const artContract = readAppSource('docs/art/actor-sprites-v1.md');

    expect(agent).toContain('xhigh');
    expect(agent).toContain('hand-drawn bitmap');
    expect(agent).toContain('No TypeScript block arrays');
    expect(agent).toContain('Call this artist sub-agent');
    expect(artContract).toContain('actor-sprites-v1.png');
    expect(artContract).toContain('192x480');
    expect(artContract).toContain('48x48');
    expect(artContract).toContain('pc-fighter');
    expect(artContract).toContain('mob-briar-goblin');
    expect(artContract).toContain('Transparent background');
  });
});
