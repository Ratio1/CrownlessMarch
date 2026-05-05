import fs from 'node:fs';
import path from 'node:path';

interface BrowserProfileEvidence {
  profileName?: string;
  screenshotPath?: string;
  consoleErrors?: string[];
  websocketSeen?: boolean;
  diagnostics?: {
    connected?: boolean;
    hasCanvas?: boolean;
    horizontalOverflowPx?: number;
    movementPadVisible?: boolean;
    commandInputVisible?: boolean;
    moveEntryStyled?: boolean;
    ground?: string | null;
  };
}

interface BrowserEvidence {
  baseUrl?: string;
  version?: string;
  commit?: string | null;
  profiles?: BrowserProfileEvidence[];
}

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

function readEvidence(filePath: string | null): BrowserEvidence {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as BrowserEvidence;
}

function renderProfile(profile: BrowserProfileEvidence) {
  const diagnostics = profile.diagnostics ?? {};
  const consoleErrorCount = profile.consoleErrors?.length ?? 0;

  return [
    `### ${profile.profileName ?? 'unknown'} profile`,
    '',
    `- Screenshot: ${profile.screenshotPath ?? 'not captured'}`,
    `- Connected: ${String(Boolean(diagnostics.connected))}`,
    `- Canvas: ${String(Boolean(diagnostics.hasCanvas))}`,
    `- WebSocket seen: ${String(Boolean(profile.websocketSeen))}`,
    `- Movement log styled: ${String(Boolean(diagnostics.moveEntryStyled))}`,
    `- Controls rendered: ${String(Boolean(diagnostics.movementPadVisible && diagnostics.commandInputVisible))}`,
    `- Horizontal overflow: ${diagnostics.horizontalOverflowPx ?? 'unknown'}px`,
    `- Console errors: ${consoleErrorCount}`,
    `- Ground after move: ${diagnostics.ground ?? 'unknown'}`,
    '',
  ].join('\n');
}

function renderBrief(evidence: BrowserEvidence) {
  const profiles = evidence.profiles ?? [];
  const profileSections = profiles.length > 0 ? profiles.map(renderProfile).join('\n') : '- No browser evidence JSON was provided.\n';

  return `# Agent Regression Review

Base URL: ${evidence.baseUrl ?? 'unknown'}
Version: ${evidence.version ?? 'unknown'}
Commit: ${evidence.commit ?? 'unknown'}

## Automated Levels

- Level 1 local automation: lint, typecheck, Jest, and production build.
- Level 2 live automation: account creation, email verification, login, character creation, websocket attach, and full quest completion.
- Level 3 browser automation: desktop and mobile smoke profiles with canvas, movement, MUD feed, console, overflow, and screenshot checks.
- Level 4 agent-based review: inspect the screenshots and automated evidence below before accepting a release.

## Screenshots

${profileSections}
## Agent Checklist

- Graphics: map tiles, player marker, target marker, borders, and panel contrast are legible at desktop and mobile sizes.
- Gameplay: movement controls work, command input is available, quest objective is clear, and the current ground after movement matches the log.
- MUD feel: march feed and D20/Dice Log language read like a tabletop tribute without hiding critical state.
- UX: no panel overlap, no horizontal mobile overflow, and the playfield remains the first useful surface.
- Regression risk: console errors, failed websocket attach, missing canvas, or unstyled movement logs are blocker findings.

## Agent Verdict

- Verdict: pending
- Blocker findings:
- Non-blocking polish:
- Recommended next step:
`;
}

function main() {
  const evidencePath = readFlag('--evidence-json') ?? process.env.THORNWRITHE_BROWSER_REPORT ?? null;
  const outputPath = readFlag('--output') ?? process.env.THORNWRITHE_AGENT_REPORT ?? 'test-results/live/agent-regression-review.md';
  const evidence = readEvidence(evidencePath);
  const report = renderBrief(evidence);
  const resolvedOutput = path.resolve(outputPath);

  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, report);
  console.error(`[thornwrithe agent regression] wrote ${resolvedOutput}`);
}

try {
  main();
} catch (error) {
  console.error(`[thornwrithe agent regression] failed ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
