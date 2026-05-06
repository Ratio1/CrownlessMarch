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
});
