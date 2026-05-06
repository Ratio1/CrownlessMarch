import { spawnSync } from 'node:child_process';
import path from 'node:path';

function readFlag(name: string) {
  const exact = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (exact) {
    return exact.slice(name.length + 1);
  }

  const index = process.argv.findIndex((entry) => entry === name);
  if (index >= 0) {
    const next = process.argv[index + 1];
    if (next && !next.startsWith('--')) {
      return next;
    }
  }

  return null;
}

function run(label: string, command: string, args: string[]) {
  console.error(`[thornwrithe regression ladder] ${label}`);
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status ?? 'unknown'}`);
  }
}

function optionalFlag(name: string) {
  const value = readFlag(name);
  return value ? [`${name}=${value}`] : [];
}

function main() {
  if (!process.env.RESEND_TOKEN && !process.env.RESEND_API_KEY) {
    throw new Error('RESEND_TOKEN or RESEND_API_KEY is required for live regression');
  }

  const screenshotDir = readFlag('--screenshot-dir') ?? process.env.THORNWRITHE_SCREENSHOT_DIR ?? 'test-results/live';
  const browserReportPath =
    readFlag('--browser-report') ?? process.env.THORNWRITHE_BROWSER_REPORT ?? path.join(screenshotDir, 'browser-smoke-report.json');
  const agentReportPath =
    readFlag('--agent-report') ?? process.env.THORNWRITHE_AGENT_REPORT ?? path.join(screenshotDir, 'agent-regression-review.md');
  const liveFlags = [
    ...optionalFlag('--base-url'),
    ...optionalFlag('--expect-version'),
    ...optionalFlag('--timeout-ms'),
  ];
  const idleMs = readFlag('--idle-ms') ?? process.env.THORNWRITHE_IDLE_MS ?? '300000';
  const reconnectProbeMs = readFlag('--reconnect-probe-ms') ?? process.env.THORNWRITHE_RECONNECT_PROBE_MS ?? '15000';

  run('level 2 live quest regression', 'pnpm', ['live:devnet', '--', ...liveFlags]);
  run('level 3 live browser regression', 'pnpm', [
    'live:browser',
    '--',
    ...liveFlags,
    '--profile=all',
    '--combat',
    '--reset',
    `--idle-ms=${idleMs}`,
    `--reconnect-probe-ms=${reconnectProbeMs}`,
    `--screenshot-dir=${screenshotDir}`,
    `--report-path=${browserReportPath}`,
  ]);
  run('level 4 agent regression brief', 'tsx', [
    'tests/live/write-agent-regression-brief.ts',
    `--evidence-json=${browserReportPath}`,
    `--output=${agentReportPath}`,
  ]);
}

try {
  main();
} catch (error) {
  console.error(`[thornwrithe regression ladder] failed ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
