import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('live quest runner wiring', () => {
  it('keeps movement waits long enough for live ownership and CStore latency', () => {
    const script = readSource('tests/live/devnet-quest-runner.ts');

    expect(script).toContain('const MOVE_RESULT_TIMEOUT_MS = 45_000;');
    expect(script).toContain('waitForMoveResult(session, snapshot, previousVersion, direction, MOVE_RESULT_TIMEOUT_MS)');
    expect(script).not.toContain("direction, 15_000)");
  });
});
