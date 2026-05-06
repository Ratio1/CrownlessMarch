import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('live browser smoke runner wiring', () => {
  it('exposes a repeatable devnet browser smoke script', () => {
    const packageJson = JSON.parse(readSource('package.json')) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const script = readSource('tests/live/devnet-browser-smoke.ts');

    expect(packageJson.scripts?.['live:browser']).toBe('tsx tests/live/devnet-browser-smoke.ts');
    expect(packageJson.devDependencies).toHaveProperty('playwright-core');
    expect(script).toContain('RESEND_TOKEN or RESEND_API_KEY is required for the live browser smoke runner');
    expect(script).toContain('const NETWORK_TIMEOUT_MS = 45_000;');
    expect(script).toContain("readFlag('--idle-ms')");
    expect(script).toContain("readFlag('--reset')");
    expect(script).toContain("readFlag('--reconnect-probe-ms')");
    expect(script).toContain('waitForHealth');
    expect(script).toContain('resolveBrowserExecutable');
    expect(script).toContain('moves north into Grass (5,4)');
    expect(script).toContain('async function runResetSmoke');
    expect(script).toContain('async function runReconnectProbe');
    expect(script).toContain('async function clickVisibleButtonByName');
    expect(script).toContain('document.elementFromPoint');
    expect(script).toContain('context.setOffline(true)');
    expect(script).toContain('context.setOffline(false)');
    expect(script).toContain('idleStable');
    expect(script).toContain('page.screenshot');
    expect(script).toContain('bodyTextLower');
    expect(script).toContain("bodyTextLower.includes('dice log')");
    expect(script).toContain('moveTextVisible');
    expect(script).toContain('!options.combat && !diagnostics.moveEntryStyled');
    expect(script).toContain('canvasInkRatio');
    expect(script).toContain('async function waitForCanvasInk');
    expect(script).toContain('await waitForCanvasInk(page)');
    expect(script).toContain('lastCanvasDiagnostics');
    expect(script).toContain('profile canvas rendered blank');
    expect(script).not.toContain('console.log(options.resendToken');
    expect(script).not.toContain('console.error(options.resendToken');
  });
});
