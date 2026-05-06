import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type BrowserContextOptions } from 'playwright-core';
import { SESSION_COOKIE_NAME } from '../../src/server/auth/session';

interface BrowserSmokeOptions {
  baseUrl: string;
  expectVersion: string | null;
  pollTimeoutMs: number;
  resendToken: string;
  screenshotDir: string;
  browserExecutable: string;
  profileNames: BrowserProfileName[];
  reportPath: string | null;
  combat: boolean;
}

interface HealthInfo {
  version: string;
  commit: string | null;
}

type BrowserProfileName = 'desktop' | 'mobile';

interface BrowserProfile {
  name: BrowserProfileName;
  contextOptions: BrowserContextOptions;
}

const NETWORK_TIMEOUT_MS = 45_000;
const BROWSER_PROFILES: Record<BrowserProfileName, BrowserProfile> = {
  desktop: {
    name: 'desktop',
    contextOptions: {
      viewport: { width: 1440, height: 1000 },
    },
  },
  mobile: {
    name: 'mobile',
    contextOptions: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    },
  },
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStage(message: string) {
  console.error(`[thornwrithe live browser smoke] ${message}`);
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

function readBooleanFlag(name: string, flagValue: string | null, envValue: string | undefined) {
  if (process.argv.includes(name)) {
    return true;
  }

  const rawValue = flagValue ?? envValue ?? null;

  if (rawValue === null) {
    return false;
  }

  return rawValue === '' || /^(1|true|yes|on)$/i.test(rawValue);
}

function expandHome(filePath: string) {
  return filePath.startsWith('~/') ? path.join(os.homedir(), filePath.slice(2)) : filePath;
}

function firstExistingFile(paths: string[]) {
  return paths.find((candidate) => fs.existsSync(expandHome(candidate))) ?? null;
}

function findCachedPlaywrightChromium() {
  const cacheRoot = path.join(os.homedir(), '.cache', 'ms-playwright');

  if (!fs.existsSync(cacheRoot)) {
    return null;
  }

  const candidates = fs
    .readdirSync(cacheRoot)
    .filter((entry) => entry.startsWith('chromium-'))
    .sort()
    .reverse()
    .map((entry) => path.join(cacheRoot, entry, 'chrome-linux64', 'chrome'));

  return firstExistingFile(candidates);
}

function resolveBrowserExecutable() {
  const configured = process.env.THORNWRITHE_BROWSER_EXECUTABLE ?? process.env.CHROME_BIN ?? null;
  if (configured && fs.existsSync(expandHome(configured))) {
    return expandHome(configured);
  }

  const cached = findCachedPlaywrightChromium();
  if (cached) {
    return cached;
  }

  const systemBrowser = firstExistingFile([
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/opt/google/chrome/chrome',
  ]);

  if (systemBrowser) {
    return systemBrowser;
  }

  throw new Error('No Chromium executable found. Set THORNWRITHE_BROWSER_EXECUTABLE or install Chromium.');
}

function parseOptions(): BrowserSmokeOptions {
  const resendToken = process.env.RESEND_TOKEN ?? process.env.RESEND_API_KEY ?? null;
  const combatFlag = readFlag('--combat');

  if (!resendToken) {
    throw new Error('RESEND_TOKEN or RESEND_API_KEY is required for the live browser smoke runner');
  }

  return {
    baseUrl: (readFlag('--base-url') ?? process.env.THORNWRITHE_LIVE_BASE_URL ?? 'https://devnet-thorn.ratio1.link').replace(/\/$/, ''),
    expectVersion: readFlag('--expect-version') ?? process.env.THORNWRITHE_EXPECT_VERSION ?? null,
    pollTimeoutMs: Number(readFlag('--timeout-ms') ?? process.env.THORNWRITHE_LIVE_TIMEOUT_MS ?? 180_000),
    resendToken,
    screenshotDir: readFlag('--screenshot-dir') ?? process.env.THORNWRITHE_SCREENSHOT_DIR ?? 'test-results/live',
    browserExecutable: resolveBrowserExecutable(),
    profileNames: parseProfileNames(readFlag('--profile') ?? process.env.THORNWRITHE_BROWSER_PROFILE ?? 'desktop'),
    reportPath: readFlag('--report-path') ?? process.env.THORNWRITHE_BROWSER_REPORT ?? null,
    combat: readBooleanFlag('--combat', combatFlag, process.env.THORNWRITHE_BROWSER_COMBAT),
  };
}

function parseProfileNames(rawValue: string): BrowserProfileName[] {
  const names =
    rawValue === 'all'
      ? Object.keys(BROWSER_PROFILES)
      : rawValue
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);

  const invalid = names.find((name) => !(name in BROWSER_PROFILES));
  if (invalid) {
    throw new Error(`Unknown browser smoke profile "${invalid}". Use desktop, mobile, or all.`);
  }

  return Array.from(new Set(names)) as BrowserProfileName[];
}

async function fetchWithTimeout(input: string, init?: RequestInit) {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  });
}

async function waitForHealth(baseUrl: string, expectedVersion: string | null, timeoutMs: number): Promise<HealthInfo> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/e`, {
        cache: 'no-store',
      });

      if (response.ok) {
        const version = response.headers.get('x-thornwrithe-version');
        const commit = response.headers.get('x-thornwrithe-commit');

        if (version && (!expectedVersion || version === expectedVersion)) {
          return { version, commit };
        }
      }
    } catch {
      // Retry while WAR restarts or Cloudflare briefly loses the origin.
    }

    await sleep(3_000);
  }

  throw new Error(`Timed out waiting for live /e at ${baseUrl}`);
}

async function resend(pathname: string, token: string) {
  const response = await fetchWithTimeout(`https://api.resend.com${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Resend ${pathname} failed with ${response.status}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

async function waitForVerificationLink(email: string, token: string, baseUrl: string) {
  const escapedBaseUrl = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escapedBaseUrl}/api/auth/verify\\?token=[^"'\\s<]+`, 'i');

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const listed = await resend('/emails', token);
    const data = Array.isArray(listed.data) ? listed.data : [];
    const match = data.find((entry) => {
      const to = entry && typeof entry === 'object' ? (entry as { to?: unknown }).to : null;
      return Array.isArray(to) && to.includes(email);
    }) as { id?: string; last_event?: string } | undefined;

    if (match?.id) {
      const full = await resend(`/emails/${match.id}`, token);
      const blob = `${String(full.html ?? '')}\n${String(full.text ?? '')}`;
      const verifyLink = blob.match(pattern)?.[0] ?? null;

      if (verifyLink) {
        return {
          id: match.id,
          lastEvent: match.last_event ?? null,
          verifyLink,
        };
      }
    }

    await sleep(3_000);
  }

  throw new Error(`Verification email for ${email} did not arrive in time`);
}

function extractCookie(response: Response, cookieName: string) {
  const header = response.headers.get('set-cookie') ?? '';
  const match = header.match(new RegExp(`${cookieName}=([^;]+)`));
  return match ? match[1] : null;
}

async function postJson(baseUrl: string, pathname: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetchWithTimeout(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  return { response, json };
}

async function createVerifiedCharacter(options: BrowserSmokeOptions) {
  const now = Date.now();
  const email = `delivered+thornbrowser${now}@resend.dev`;
  const password = `ThornBrowser!${String(now).slice(-6)}`;
  const characterName = `BrowserWarden${String(now).slice(-5)}`;

  logStage(`registering ${email}`);
  const register = await postJson(options.baseUrl, '/api/auth/register', { email, password });
  if (register.response.status !== 201) {
    throw new Error(`Register failed with ${register.response.status}`);
  }

  logStage('waiting for verification email');
  const verification = await waitForVerificationLink(email, options.resendToken, options.baseUrl);
  const verifyResponse = await fetchWithTimeout(verification.verifyLink, { redirect: 'manual' });
  if (verifyResponse.status !== 302) {
    throw new Error(`Verify link returned ${verifyResponse.status}`);
  }

  logStage('logging in');
  const login = await postJson(options.baseUrl, '/api/auth/login', { email, password });
  if (login.response.status !== 200) {
    throw new Error(`Login failed with ${login.response.status}`);
  }

  const sessionCookie = extractCookie(login.response, SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    throw new Error('Login did not return a session cookie');
  }

  logStage(`creating fighter ${characterName}`);
  const createCharacter = await postJson(
    options.baseUrl,
    '/api/characters',
    {
      name: characterName,
      classId: 'fighter',
      attributes: {
        strength: 15,
        dexterity: 14,
        constitution: 11,
        intelligence: 10,
        wisdom: 9,
        charisma: 8,
      },
    },
    {
      cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
    },
  );

  if (createCharacter.response.status !== 201) {
    throw new Error(`Character creation failed with ${createCharacter.response.status}`);
  }

  return {
    email,
    characterName,
    sessionCookie: extractCookie(createCharacter.response, SESSION_COOKIE_NAME) ?? sessionCookie,
    verificationEmailId: verification.id,
    verificationLastEvent: verification.lastEvent,
  };
}

async function runBrowserSmoke(
  options: BrowserSmokeOptions,
  character: Awaited<ReturnType<typeof createVerifiedCharacter>>,
  profile: BrowserProfile
) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: options.browserExecutable,
  });
  const context = await browser.newContext(profile.contextOptions);
  const screenshotName = `devnet-browser-smoke-${profile.name}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const screenshotPath = path.resolve(options.screenshotDir, screenshotName);
  const consoleErrors: string[] = [];
  const attachStatuses: number[] = [];
  let websocketSeen = false;

  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });

  try {
    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: character.sessionCookie,
        domain: new URL(options.baseUrl).hostname,
        path: '/',
        httpOnly: true,
        secure: options.baseUrl.startsWith('https://'),
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('response', (response) => {
      if (response.url().includes('/api/auth/attach')) {
        attachStatuses.push(response.status());
      }
    });
    page.on('websocket', () => {
      websocketSeen = true;
    });

    await page.goto(`${options.baseUrl}/play`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('Connected to live shard.'), null, {
      timeout: 45_000,
    });
    await page.waitForFunction(() => Boolean(document.querySelector('.world-canvas__host canvas')), null, {
      timeout: 45_000,
    });

    const moveDirection = options.combat ? 'East' : 'North';
    const expectedMoveText = options.combat
      ? `${character.characterName} moves east into Briar Roots (6,5).`
      : `${character.characterName} moves north into Road Lane (5,4).`;

    await page.getByRole('button', { name: moveDirection }).click();
    await page.waitForFunction((moveText) => document.body.innerText.includes(moveText), expectedMoveText, {
      timeout: 30_000,
    });

    if (options.combat) {
      await page.waitForFunction(() => document.body.innerText.includes('Dice Log') && document.body.innerText.includes('D20'), null, {
        timeout: 45_000,
      });
    }

    const diagnostics = await page.evaluate((moveText) => {
      const bodyText = document.body.innerText;
      const moveEntry = Array.from(document.querySelectorAll('.combat-log__entry--move')).find((node) =>
        node.textContent?.includes(moveText)
      );
      const canvas = document.querySelector('.world-canvas__host canvas');
      const canvasRect = canvas?.getBoundingClientRect();
      const movementPad = document.querySelector('[aria-label="Movement controls"]');
      const movementPadRect = movementPad?.getBoundingClientRect();
      const commandInput = document.querySelector('#mud-command');
      const commandInputRect = commandInput?.getBoundingClientRect();
      const horizontalOverflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);

      return {
        connected: bodyText.includes('Connected to live shard.'),
        hasCanvas: Boolean(canvas),
        statusLine: document.querySelector('.status-line')?.textContent ?? null,
        ground:
          Array.from(document.querySelectorAll('.world-field__badges .status-pill'))
            .map((node) => node.textContent)
            .find((text) => text?.startsWith('Ground')) ?? null,
        moveText,
        moveEntryText: moveEntry?.textContent ?? null,
        moveEntryStyled: Boolean(moveEntry),
        combatActive: bodyText.includes('Dice Log') && bodyText.includes('D20'),
        d20LogVisible: bodyText.includes('D20'),
        horizontalOverflowPx,
        movementPadVisible: Boolean(movementPadRect && movementPadRect.width > 0 && movementPadRect.height > 0),
        commandInputVisible: Boolean(commandInputRect && commandInputRect.width > 0 && commandInputRect.height > 0),
        canvas: {
          width: canvas instanceof HTMLCanvasElement ? canvas.width : 0,
          height: canvas instanceof HTMLCanvasElement ? canvas.height : 0,
          clientWidth: canvasRect?.width ?? 0,
          clientHeight: canvasRect?.height ?? 0,
        },
      };
    }, expectedMoveText);

    if (!diagnostics.moveEntryStyled) {
      throw new Error(`Movement feed entry was not styled as MOVE: ${expectedMoveText}`);
    }

    if (options.combat && !diagnostics.combatActive) {
      throw new Error(`${profile.name} profile did not render active D20 combat after moving east`);
    }

    if (diagnostics.horizontalOverflowPx > 2) {
      throw new Error(`${profile.name} profile has ${diagnostics.horizontalOverflowPx}px of horizontal overflow`);
    }

    if (!diagnostics.movementPadVisible || !diagnostics.commandInputVisible) {
      throw new Error(`${profile.name} profile did not render the command and movement controls`);
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });

    return {
      profileName: profile.name,
      attachStatuses,
      websocketSeen,
      consoleErrors,
      diagnostics,
      screenshotPath,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const options = parseOptions();
  logStage(`waiting for live /e at ${options.baseUrl}${options.expectVersion ? ` (${options.expectVersion})` : ''}`);
  const live = await waitForHealth(options.baseUrl, options.expectVersion, options.pollTimeoutMs);
  const profiles = [];

  for (const profileName of options.profileNames) {
    const profile = BROWSER_PROFILES[profileName];
    const character = await createVerifiedCharacter(options);

    logStage(`opening ${profile.name} browser and checking live playfield`);
    const browserResult = await runBrowserSmoke(options, character, profile);
    profiles.push({
      email: character.email,
      verificationEmailId: character.verificationEmailId,
      verificationLastEvent: character.verificationLastEvent,
      characterName: character.characterName,
      ...browserResult,
    });
  }

  const report = {
    baseUrl: options.baseUrl,
    version: live.version,
    commit: live.commit,
    browserExecutable: options.browserExecutable,
    profiles,
  };

  if (options.reportPath) {
    const reportPath = path.resolve(options.reportPath);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(
    JSON.stringify(
      report,
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(`[thornwrithe live browser smoke] failed ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
