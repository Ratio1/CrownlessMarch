import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type BrowserContext, type BrowserContextOptions, type Page } from 'playwright-core';
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
  idleMs: number;
  reset: boolean;
  reconnectProbeMs: number;
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
const CANVAS_INK_THRESHOLD = 0.01;
const CANVAS_INK_TIMEOUT_MS = 5_000;
const CANVAS_INK_POLL_MS = 150;
const COMMAND_ROUND_TRIP_TIMEOUT_MS = 90_000;
const COMMAND_ROUND_TRIP_RETRY_MS = 2_500;
const MOVEMENT_RESULT_TIMEOUT_MS = 90_000;
const MOVEMENT_RESULT_POLL_MS = 2_500;
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
  const resetFlag = readFlag('--reset');

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
    idleMs: Number(readFlag('--idle-ms') ?? process.env.THORNWRITHE_IDLE_MS ?? 0),
    reset: readBooleanFlag('--reset', resetFlag, process.env.THORNWRITHE_BROWSER_RESET),
    reconnectProbeMs: Number(readFlag('--reconnect-probe-ms') ?? process.env.THORNWRITHE_RECONNECT_PROBE_MS ?? 0),
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

async function readCanvasDiagnostics(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.world-canvas__host canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    let canvasInkRatio = 0;

    if (canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0) {
      const sample = document.createElement('canvas');
      sample.width = 96;
      sample.height = 96;
      const context = sample.getContext('2d');

      if (context) {
        context.drawImage(canvas, 0, 0, sample.width, sample.height);
        const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
        let inkedPixels = 0;

        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] > 0 && pixels[index] + pixels[index + 1] + pixels[index + 2] > 36) {
            inkedPixels += 1;
          }
        }

        canvasInkRatio = inkedPixels / (sample.width * sample.height);
      }
    }

    return {
      canvasInkRatio,
      canvas: {
        width: canvas instanceof HTMLCanvasElement ? canvas.width : 0,
        height: canvas instanceof HTMLCanvasElement ? canvas.height : 0,
        clientWidth: canvasRect?.width ?? 0,
        clientHeight: canvasRect?.height ?? 0,
      },
    };
  });
}

async function waitForCanvasInk(page: Page) {
  const startedAt = Date.now();
  let lastCanvasDiagnostics = await readCanvasDiagnostics(page);

  while (Date.now() - startedAt < CANVAS_INK_TIMEOUT_MS) {
    if (lastCanvasDiagnostics.canvasInkRatio >= CANVAS_INK_THRESHOLD) {
      return lastCanvasDiagnostics;
    }

    await page.waitForTimeout(CANVAS_INK_POLL_MS);
    lastCanvasDiagnostics = await readCanvasDiagnostics(page);
  }

  return lastCanvasDiagnostics;
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

async function waitForConnectedPlayfield(page: Page) {
  await page.waitForFunction(() => document.body.innerText.includes('Connected to live shard.'), null, {
    timeout: 60_000,
  });
  await page.waitForFunction(() => Boolean(document.querySelector('.world-canvas__host canvas')), null, {
    timeout: 45_000,
  });
  await waitForCanvasInk(page);
}

async function runResetSmoke(page: Page, characterName: string) {
  const resetCharacterName = `${characterName}Reset`;

  logStage(`resetting browser smoke character to ${resetCharacterName}`);
  await page.getByRole('tab', { name: 'Character Sheet' }).click();
  await page.getByRole('button', { name: 'Reset Character' }).click();
  await page.getByLabel('Character name').fill(resetCharacterName);
  await page.getByLabel('Class').selectOption('wizard');
  await page.getByLabel('Confirm beta character reset').check();
  await page.getByRole('button', { name: 'Accept & Apply Reset' }).click();
  await page.waitForFunction(
    (input) => {
      const bodyText = document.body.innerText;

      return (
        bodyText.includes('Connected to live shard.') &&
        bodyText.includes(input.characterName) &&
        bodyText.includes('Wizard')
      );
    },
    { characterName: resetCharacterName },
    { timeout: 75_000 }
  );
  await waitForCanvasInk(page);

  return {
    characterName: resetCharacterName,
    classLabel: 'Wizard',
  };
}

async function readPlayfieldRetentionDiagnostics(page: Page, characterName: string) {
  return page.evaluate((input) => {
    const bodyText = document.body.innerText;
    const canvas = document.querySelector('.world-canvas__host canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    const commandInput = document.querySelector('#mud-command');
    const commandInputRect = commandInput?.getBoundingClientRect();
    const movementPad = document.querySelector('[aria-label="Movement controls"]');
    const movementPadRect = movementPad?.getBoundingClientRect();

    return {
      connected: bodyText.includes('Connected to live shard.'),
      reconnecting: bodyText.toLowerCase().includes('reconnecting'),
      hasCharacterName: bodyText.includes(input.characterName),
      hasCharacterSheet: bodyText.includes('Character Sheet'),
      hasCanvas: canvas instanceof HTMLCanvasElement && canvas.width > 0,
      canvasClientWidth: canvasRect?.width ?? 0,
      canvasClientHeight: canvasRect?.height ?? 0,
      commandInputVisible: Boolean(commandInputRect && commandInputRect.width > 0 && commandInputRect.height > 0),
      movementPadVisible: Boolean(movementPadRect && movementPadRect.width > 0 && movementPadRect.height > 0),
    };
  }, { characterName });
}

async function waitForCommandRoundTrip(page: Page) {
  const command = `examine reconnect-probe-${Date.now()}`;
  const nonce = command.slice('examine '.length);
  const expectedText = `You study ${nonce}, but`;
  const startedAt = Date.now();
  let attempts = 0;
  let lastError = 'not attempted';

  while (Date.now() - startedAt < COMMAND_ROUND_TRIP_TIMEOUT_MS) {
    attempts += 1;

    try {
      await waitForConnectedPlayfield(page);
      const commandInput = page.locator('#mud-command');
      await commandInput.waitFor({ state: 'visible', timeout: 5_000 });
      await page.waitForFunction(
        () => {
          const input = document.querySelector('#mud-command');
          return input instanceof HTMLInputElement && !input.disabled;
        },
        null,
        { timeout: 5_000 }
      );
      await commandInput.fill(command);
      await commandInput.press('Enter');
      await page.waitForFunction((text) => document.body.innerText.includes(text), expectedText, {
        timeout: 5_000,
      });

      return {
        command,
        expectedText,
        attempts,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await page.waitForTimeout(COMMAND_ROUND_TRIP_RETRY_MS);
    }
  }

  throw new Error(`Reconnect probe did not complete command round-trip after ${attempts} attempts: ${lastError}`);
}

async function runReconnectProbe(context: BrowserContext, page: Page, characterName: string, durationMs: number) {
  const before = await readPlayfieldRetentionDiagnostics(page, characterName);

  logStage(`forcing browser offline for ${durationMs}ms to probe snapshot retention`);
  await context.setOffline(true);
  await page.waitForTimeout(durationMs);
  const during = await readPlayfieldRetentionDiagnostics(page, characterName);

  await context.setOffline(false);
  const commandRoundTrip = await waitForCommandRoundTrip(page);
  const after = await readPlayfieldRetentionDiagnostics(page, characterName);

  for (const [phase, diagnostics] of [
    ['before', before],
    ['during', during],
    ['after', after],
  ] as const) {
    if (!diagnostics.hasCharacterName || !diagnostics.hasCanvas || !diagnostics.commandInputVisible) {
      throw new Error(
        `Reconnect probe depleted playfield during ${phase}: ${JSON.stringify(diagnostics)}`
      );
    }
  }

  if (!after.connected) {
    throw new Error(`Reconnect probe did not recover connected state: ${JSON.stringify(after)}`);
  }

  return {
    durationMs,
    before,
    during,
    after,
    commandRoundTrip,
  };
}

async function clickVisibleButtonByName(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });

  await button.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);

  const clickPoint = await button.evaluate((element, input) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topElement = document.elementFromPoint(centerX, centerY);
    const receivesPointer = topElement === element || (topElement instanceof Node && element.contains(topElement));
    const disabled = element instanceof HTMLButtonElement ? element.disabled : element.getAttribute('aria-disabled') === 'true';

    return {
      centerX,
      centerY,
      disabled,
      receivesPointer,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      topElement: topElement
        ? {
            tagName: topElement.tagName,
            className: typeof topElement.className === 'string' ? topElement.className : '',
            text: topElement.textContent?.trim().slice(0, 80) ?? '',
          }
        : null,
      buttonName: input.name,
    };
  }, { name });

  if (clickPoint.rect.width <= 0 || clickPoint.rect.height <= 0) {
    throw new Error(`Button "${name}" is not visible enough to click: ${JSON.stringify(clickPoint)}`);
  }

  if (clickPoint.disabled) {
    throw new Error(`Button "${name}" is disabled before click: ${JSON.stringify(clickPoint)}`);
  }

  if (!clickPoint.receivesPointer) {
    throw new Error(`Button "${name}" center is covered before click: ${JSON.stringify(clickPoint)}`);
  }

  const usesTouchInput = await page.evaluate(
    () => navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches
  );

  if (usesTouchInput) {
    await button.tap();
    return;
  }

  await page.mouse.click(clickPoint.centerX, clickPoint.centerY);
}

async function clickMovementAndWait(page: Page, direction: string, expectedMoveText: string, combat: boolean) {
  const startedAt = Date.now();
  let attempts = 0;
  let lastError = 'not attempted';

  while (Date.now() - startedAt < MOVEMENT_RESULT_TIMEOUT_MS) {
    attempts += 1;

    try {
      await waitForConnectedPlayfield(page);
      await page.waitForFunction(
        (input) => {
          const button = Array.from(document.querySelectorAll('button')).find(
            (entry) => entry.textContent?.trim() === input.direction
          );

          return button instanceof HTMLButtonElement && !button.disabled;
        },
        { direction },
        { timeout: 5_000 }
      );
      await clickVisibleButtonByName(page, direction);
      await page.waitForFunction(
        (input) => {
          const bodyText = document.body.innerText;
          const bodyTextLower = bodyText.toLowerCase();

          return (
            bodyText.includes(input.expectedMoveText) ||
            (input.combat && bodyTextLower.includes('d20 rolls') && bodyText.includes('D20'))
          );
        },
        { expectedMoveText, combat },
        { timeout: 10_000 }
      );

      return {
        attempts,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await page.waitForTimeout(MOVEMENT_RESULT_POLL_MS);
    }
  }

  throw new Error(`Movement ${direction} did not produce a live result after ${attempts} attempts: ${lastError}`);
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
    await waitForConnectedPlayfield(page);

    let activeCharacterName = character.characterName;
    const resetSmoke = options.reset ? await runResetSmoke(page, activeCharacterName) : null;
    if (resetSmoke) {
      activeCharacterName = resetSmoke.characterName;
    }

    const reconnectProbe =
      options.reconnectProbeMs > 0
        ? await runReconnectProbe(context, page, activeCharacterName, options.reconnectProbeMs)
        : null;

    const moveDirection = options.combat ? 'East' : 'North';
    const expectedMoveText = options.combat
      ? `${activeCharacterName} moves east into Mud (6,5).`
      : `${activeCharacterName} moves north into Grass (5,4).`;

    const movementSmoke = await clickMovementAndWait(page, moveDirection, expectedMoveText, options.combat);

    if (options.combat) {
      await page.waitForFunction(
        () => {
          const bodyText = document.body.innerText;
          const bodyTextLower = bodyText.toLowerCase();

          return bodyTextLower.includes('d20 rolls') && bodyText.includes('D20');
        },
        null,
        {
          timeout: 45_000,
        }
      );
    }

    let lastCanvasDiagnostics = await waitForCanvasInk(page);
    if (options.idleMs > 0) {
      logStage(`idling ${profile.name} profile for ${options.idleMs}ms`);
      await page.waitForTimeout(options.idleMs);
      lastCanvasDiagnostics = await waitForCanvasInk(page);
    }

    const diagnostics = await page.evaluate((input) => {
      const moveText = input.moveText;
      const bodyText = document.body.innerText;
      const bodyTextLower = bodyText.toLowerCase();
      const moveEntry = Array.from(document.querySelectorAll('.combat-log__entry--move')).find((node) =>
        node.textContent?.includes(moveText)
      );
      const movementPad = document.querySelector('[aria-label="Movement controls"]');
      const movementPadRect = movementPad?.getBoundingClientRect();
      const commandInput = document.querySelector('#mud-command');
      const commandInputRect = commandInput?.getBoundingClientRect();
      const horizontalOverflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);

      return {
        connected: bodyText.includes('Connected to live shard.'),
        hasCanvas: input.lastCanvasDiagnostics.canvas.width > 0,
        statusLine: document.querySelector('.status-line')?.textContent ?? null,
        fieldNotes:
          Array.from(document.querySelectorAll('.field-notes li'))
            .map((node) => node.textContent)
            .filter(Boolean)
            .join(' | ') || null,
        moveText,
        moveTextVisible: bodyText.includes(moveText),
        moveEntryText: moveEntry?.textContent ?? null,
        moveEntryStyled: Boolean(moveEntry),
        combatActive: bodyTextLower.includes('d20 rolls') && bodyText.includes('D20'),
        d20LogVisible: bodyText.includes('D20'),
        horizontalOverflowPx,
        movementPadVisible: Boolean(movementPadRect && movementPadRect.width > 0 && movementPadRect.height > 0),
        commandInputVisible: Boolean(commandInputRect && commandInputRect.width > 0 && commandInputRect.height > 0),
        canvasInkRatio: input.lastCanvasDiagnostics.canvasInkRatio,
        canvas: input.lastCanvasDiagnostics.canvas,
        idleStable:
          input.idleMs === 0 ||
          (
            bodyText.includes('Connected to live shard.') &&
            bodyText.includes(input.characterName) &&
            Boolean(commandInputRect && commandInputRect.width > 0 && commandInputRect.height > 0) &&
            input.lastCanvasDiagnostics.canvas.width > 0
          ),
      };
    }, { moveText: expectedMoveText, combat: options.combat, lastCanvasDiagnostics, idleMs: options.idleMs, characterName: activeCharacterName });

    await page.screenshot({ path: screenshotPath, fullPage: true });

    if (!options.combat && !diagnostics.moveTextVisible) {
      throw new Error(`Movement feed text did not render: ${expectedMoveText}`);
    }

    if (!options.combat && !diagnostics.moveEntryStyled) {
      throw new Error(`Movement feed entry was not styled as MOVE: ${expectedMoveText}`);
    }

    if (options.combat && !diagnostics.combatActive) {
      throw new Error(`${profile.name} profile did not render active D20 combat after moving east`);
    }

    if (diagnostics.horizontalOverflowPx > 2) {
      throw new Error(`${profile.name} profile has ${diagnostics.horizontalOverflowPx}px of horizontal overflow`);
    }

    if (diagnostics.canvasInkRatio < CANVAS_INK_THRESHOLD) {
      throw new Error(`${profile.name} profile canvas rendered blank (ink ratio ${diagnostics.canvasInkRatio.toFixed(4)})`);
    }

    if (!diagnostics.movementPadVisible || !diagnostics.commandInputVisible) {
      throw new Error(`${profile.name} profile did not render the command and movement controls`);
    }

    if (!diagnostics.idleStable) {
      throw new Error(`${profile.name} profile lost required playfield state after ${options.idleMs}ms idle`);
    }

    return {
      profileName: profile.name,
      attachStatuses,
      websocketSeen,
      consoleErrors,
      resetSmoke,
      reconnectProbe,
      movementSmoke,
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
