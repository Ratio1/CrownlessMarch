import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('regression ladder wiring', () => {
  it('exposes local, live, and agent-based regression entrypoints', () => {
    const packageJson = JSON.parse(readSource('package.json')) as {
      scripts?: Record<string, string>;
    };
    const browserSmoke = readSource('tests/live/devnet-browser-smoke.ts');
    const liveLadder = readSource('tests/live/run-regression-ladder.ts');
    const agentBrief = readSource('tests/live/write-agent-regression-brief.ts');

    expect(packageJson.scripts?.['regression:local']).toBe('pnpm lint && pnpm typecheck && pnpm test && pnpm build');
    expect(packageJson.scripts?.['regression:live']).toBe('tsx tests/live/run-regression-ladder.ts');
    expect(packageJson.scripts?.['regression:agent']).toBe('tsx tests/live/write-agent-regression-brief.ts');

    expect(browserSmoke).toContain('BROWSER_PROFILES');
    expect(browserSmoke).toContain("'desktop'");
    expect(browserSmoke).toContain("'mobile'");
    expect(browserSmoke).toContain("readFlag('--profile')");
    expect(browserSmoke).toContain("readFlag('--report-path')");
    expect(browserSmoke).toContain('horizontalOverflowPx');
    expect(browserSmoke).toContain('movementPadVisible');
    expect(browserSmoke).not.toContain('const hasBox =');
    expect(browserSmoke).toContain("readFlag('--combat')");
    expect(browserSmoke).toContain('combatActive');
    expect(browserSmoke).toContain('D20');

    expect(liveLadder).toContain('live:devnet');
    expect(liveLadder).toContain('live:browser');
    expect(liveLadder).toContain('--profile=all');
    expect(liveLadder).toContain('--combat');
    expect(liveLadder).toContain('write-agent-regression-brief.ts');
    expect(liveLadder).toContain('RESEND_TOKEN');
    expect(liveLadder).not.toContain('console.log(process.env.RESEND_TOKEN');

    expect(agentBrief).toContain('Agent Regression Review');
    expect(agentBrief).toContain('Screenshots');
    expect(agentBrief).toContain('D20');
    expect(agentBrief).toContain('mobile');
    expect(agentBrief).toContain('blocker');
  });
});
