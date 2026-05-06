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
    combatActive?: boolean;
    d20LogVisible?: boolean;
    canvasInkRatio?: number;
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
    `- Combat HUD active: ${String(Boolean(diagnostics.combatActive))}`,
    `- D20 log visible: ${String(Boolean(diagnostics.d20LogVisible))}`,
    `- Canvas ink ratio: ${diagnostics.canvasInkRatio ?? 'unknown'}`,
    `- WebSocket seen: ${String(Boolean(profile.websocketSeen))}`,
    `- Movement log styled: ${String(Boolean(diagnostics.moveEntryStyled))}`,
    `- Controls rendered: ${String(Boolean(diagnostics.movementPadVisible && diagnostics.commandInputVisible))}`,
    `- Horizontal overflow: ${diagnostics.horizontalOverflowPx ?? 'unknown'}px`,
    `- Console errors: ${consoleErrorCount}`,
    `- Ground after move: ${diagnostics.ground ?? 'unknown'}`,
    '',
  ].join('\n');
}

function evaluateRegressionVerdict(evidence: BrowserEvidence) {
  const blockers: string[] = [];
  const polish: string[] = [];
  const profiles = evidence.profiles ?? [];

  if (profiles.length === 0) {
    blockers.push('No browser profiles were captured.');
  }

  for (const profile of profiles) {
    const name = profile.profileName ?? 'unknown';
    const diagnostics = profile.diagnostics ?? {};
    const consoleErrorCount = profile.consoleErrors?.length ?? 0;
    const horizontalOverflowPx = diagnostics.horizontalOverflowPx ?? 0;

    if (!diagnostics.connected) {
      blockers.push(`${name}: live client did not reach a connected state.`);
    }
    if (!diagnostics.hasCanvas) {
      blockers.push(`${name}: Phaser canvas was not rendered.`);
    }
    if (!profile.websocketSeen) {
      blockers.push(`${name}: websocket traffic was not observed.`);
    }
    if (!diagnostics.movementPadVisible || !diagnostics.commandInputVisible) {
      blockers.push(`${name}: movement controls or command input were missing.`);
    }
    if (horizontalOverflowPx > 2) {
      blockers.push(`${name}: horizontal overflow measured ${horizontalOverflowPx}px.`);
    }
    if (consoleErrorCount > 0) {
      blockers.push(`${name}: ${consoleErrorCount} browser console error(s) were captured.`);
    }
    if (typeof diagnostics.canvasInkRatio === 'number' && diagnostics.canvasInkRatio < 0.01) {
      blockers.push(`${name}: canvas ink ratio was too low to prove the renderer is visible.`);
    }
    if (diagnostics.combatActive && !diagnostics.d20LogVisible) {
      blockers.push(`${name}: combat was active but D20 log text was not visible.`);
    }
    if (diagnostics.moveEntryStyled === false) {
      polish.push(`${name}: movement-feed styling was not visible during this profile.`);
    }
  }

  return {
    label: blockers.length > 0 ? 'fail' : 'pass',
    blockers: blockers.length > 0 ? blockers : ['none'],
    polish: polish.length > 0 ? polish : ['none'],
    recommendedNextStep:
      blockers.length > 0
        ? 'Fix blocker findings, redeploy, and rerun the live regression ladder.'
        : 'Accept the build after screenshot review confirms actor sprites and mobile controls remain legible.',
  };
}

function renderBrief(evidence: BrowserEvidence) {
  const profiles = evidence.profiles ?? [];
  const profileSections = profiles.length > 0 ? profiles.map(renderProfile).join('\n') : '- No browser evidence JSON was provided.\n';
  const verdict = evaluateRegressionVerdict(evidence);

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

- Verdict: ${verdict.label}
- Blocker findings:
- ${verdict.blockers.join('\n- ')}
- Non-blocking polish:
- ${verdict.polish.join('\n- ')}
- Recommended next step:
${verdict.recommendedNextStep}
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
