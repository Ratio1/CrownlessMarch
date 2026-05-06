import WebSocket from 'ws';
import { SESSION_COOKIE_NAME } from '../../src/server/auth/session';
import type { GameplayDirection, GameplayOverrideCommand, GameplayShardSnapshot } from '../../src/shared/gameplay';

type AttachMessage = {
  type: 'attached';
  shardWorldInstanceId: string;
};

type StateMessage = {
  type: 'state';
  state: GameplayShardSnapshot;
};

type ErrorMessage = {
  type: 'error';
  code: string;
};

type TerminalMessage = {
  type: 'session_expired' | 'taken_over';
};

type InboundMessage = AttachMessage | StateMessage | ErrorMessage | TerminalMessage;

interface LiveOptions {
  baseUrl: string;
  expectVersion: string | null;
  pollTimeoutMs: number;
  resendToken: string;
  maxDefeats: number;
}

interface HealthInfo {
  version: string;
  commit: string | null;
}

const NETWORK_TIMEOUT_MS = 20_000;
const MOVE_RESULT_TIMEOUT_MS = 45_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStage(message: string) {
  console.error(`[thornwrithe live quest runner] ${message}`);
}

async function fetchWithTimeout(input: string, init?: RequestInit) {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  });
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

function parseOptions(): LiveOptions {
  const resendToken = process.env.RESEND_TOKEN ?? process.env.RESEND_API_KEY ?? null;
  const maxDefeats = Number(readFlag('--max-defeats') ?? process.env.THORNWRITHE_LIVE_MAX_DEFEATS ?? 1);

  if (!resendToken) {
    throw new Error('RESEND_TOKEN or RESEND_API_KEY is required for the live devnet runner');
  }

  if (!Number.isFinite(maxDefeats) || maxDefeats < 0) {
    throw new Error('--max-defeats must be a non-negative number');
  }

  return {
    baseUrl: (readFlag('--base-url') ?? process.env.THORNWRITHE_LIVE_BASE_URL ?? 'https://devnet-thorn.ratio1.link').replace(/\/$/, ''),
    expectVersion: readFlag('--expect-version') ?? process.env.THORNWRITHE_EXPECT_VERSION ?? null,
    pollTimeoutMs: Number(readFlag('--timeout-ms') ?? process.env.THORNWRITHE_LIVE_TIMEOUT_MS ?? 180_000),
    resendToken,
    maxDefeats,
  };
}

async function resend(path: string, token: string) {
  const response = await fetchWithTimeout(`https://api.resend.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Resend ${path} failed with ${response.status}`);
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

async function postJson(baseUrl: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
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

function resolveWebSocketUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  return url.toString();
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

        if (!version) {
          throw new Error('Live /e returned 200 without x-thornwrithe-version');
        }

        if (expectedVersion && version !== expectedVersion) {
          await sleep(3_000);
          continue;
        }

        return { version, commit };
      }
    } catch {
      // Retry while the live rollout is still converging.
    }

    await sleep(3_000);
  }

  throw new Error(`Timed out waiting for live /e at ${baseUrl}`);
}

class LiveShardSession {
  private socket: WebSocket | null = null;
  private readonly waiters = new Set<() => void>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private terminalError: Error | null = null;

  latestState: GameplayShardSnapshot | null = null;
  stateVersion = 0;
  shardWorldInstanceId: string | null = null;

  constructor(private readonly url: string, private readonly attachToken: string) {}

  async connect() {
    const socket = new WebSocket(this.url);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out opening the gameplay socket'));
      }, 20_000);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeAllListeners('open');
        socket.removeAllListeners('error');
      };

      socket.once('open', () => {
        cleanup();
        resolve();
      });

      socket.once('error', (error) => {
        cleanup();
        reject(error);
      });
    });

    socket.on('message', (data) => {
      const parsed = JSON.parse(data.toString('utf8')) as InboundMessage;

      if (parsed.type === 'attached') {
        this.shardWorldInstanceId = parsed.shardWorldInstanceId;
      }

      if (parsed.type === 'state') {
        this.latestState = parsed.state;
        this.stateVersion += 1;
      }

      if (parsed.type === 'error') {
        this.terminalError = new Error(`Gameplay socket error: ${parsed.code}`);
      }

      if (parsed.type === 'session_expired' || parsed.type === 'taken_over') {
        this.terminalError = new Error(`Gameplay socket ended with ${parsed.type}`);
      }

      for (const wake of this.waiters) {
        wake();
      }
    });

    socket.on('close', () => {
      if (!this.terminalError) {
        this.terminalError = new Error('Gameplay socket closed unexpectedly');
      }

      for (const wake of this.waiters) {
        wake();
      }
    });

    socket.send(JSON.stringify({ type: 'attach', attachToken: this.attachToken }));
    this.heartbeatTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 2_000);

    await this.waitForState((state) => Boolean(state), 30_000);
  }

  sendMove(direction: GameplayDirection) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Gameplay socket is not open');
    }

    this.socket.send(JSON.stringify({ type: 'move', direction }));
  }

  sendOverride(command: GameplayOverrideCommand) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Gameplay socket is not open');
    }

    this.socket.send(JSON.stringify({ type: 'override', command }));
  }

  async waitForState(
    predicate: (state: GameplayShardSnapshot | null) => boolean,
    timeoutMs: number
  ): Promise<GameplayShardSnapshot> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (this.terminalError) {
        throw this.terminalError;
      }

      if (predicate(this.latestState)) {
        return this.latestState as GameplayShardSnapshot;
      }

      await new Promise<void>((resolve) => {
        const wake = () => {
          this.waiters.delete(wake);
          resolve();
        };

        this.waiters.add(wake);
        setTimeout(wake, 500);
      });
    }

    throw new Error('Timed out waiting for gameplay state');
  }

  async waitForStateAdvance(previousVersion: number, timeoutMs: number) {
    return this.waitForState(() => this.stateVersion > previousVersion, timeoutMs);
  }

  async waitForStateAfter(
    previousVersion: number,
    predicate: (state: GameplayShardSnapshot | null) => boolean,
    timeoutMs: number
  ) {
    return this.waitForState((state) => this.stateVersion > previousVersion && predicate(state), timeoutMs);
  }

  async close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (!this.socket) {
      return;
    }

    const socket = this.socket;
    this.socket = null;

    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }
}

function nextStepDirection(current: { x: number; y: number }, target: { x: number; y: number }): GameplayDirection | null {
  if (current.x < target.x) {
    return 'east';
  }

  if (current.x > target.x) {
    return 'west';
  }

  if (current.y < target.y) {
    return 'south';
  }

  if (current.y > target.y) {
    return 'north';
  }

  return null;
}

function activeQuestLabel(snapshot: GameplayShardSnapshot | null) {
  return snapshot?.character.quests[0]?.label ?? null;
}

function questSignature(snapshot: GameplayShardSnapshot | null) {
  return snapshot?.character.quests
    .map((quest) => `${quest.id}:${quest.status}:${quest.progress}`)
    .join('|') || 'none';
}

function focusSignature(snapshot: GameplayShardSnapshot | null) {
  return snapshot?.objectiveFocus
    ? `${snapshot.objectiveFocus.label}:${snapshot.objectiveFocus.stateLabel}@${snapshot.objectiveFocus.target.x},${snapshot.objectiveFocus.target.y}`
    : 'none';
}

function heroCombatant(snapshot: GameplayShardSnapshot | null) {
  return snapshot?.encounter?.combatants.find((entry) => entry.kind === 'hero') ?? null;
}

function hasQueuedHeroCommand(snapshot: GameplayShardSnapshot | null) {
  return (snapshot?.encounter?.queuedOverrides.length ?? 0) > 0;
}

function hasPotion(snapshot: GameplayShardSnapshot | null) {
  return snapshot?.character.inventory.some((entry) => entry.id === 'health-potion') === true;
}

function selectEncounterCommand(snapshot: GameplayShardSnapshot | null): GameplayOverrideCommand {
  const hero = heroCombatant(snapshot);

  if (hero && hasPotion(snapshot)) {
    const bloodiedThreshold = Math.max(1, Math.floor(hero.maxHp / 2));
    if (hero.currentHp <= bloodiedThreshold) {
      return 'potion';
    }
  }

  return 'encounter power';
}

function encounterStateSummary(snapshot: GameplayShardSnapshot | null) {
  const encounter = snapshot?.encounter;

  if (!encounter) {
    return 'no-encounter';
  }

  return [
    `status=${encounter.status}`,
    `round=${encounter.round}`,
    `queued=${encounter.queuedOverrides.length}`,
    `logs=${encounter.logs.length}`,
    `next=${encounter.nextRoundAt}`,
  ].join(',');
}

function secureQuestCompleted(snapshot: GameplayShardSnapshot | null) {
  return (
    snapshot?.character.completedQuests.some((quest) => quest.id === 'secure-the-shrine-road') === true &&
    snapshot?.character.unlocks.includes('route:shrine-road-secured') === true
  );
}

function describeSnapshotPosition(snapshot: GameplayShardSnapshot | null) {
  if (!snapshot) {
    return 'no-state';
  }

  return [
    `pos=${snapshot.position.x},${snapshot.position.y}`,
    `tile=${snapshot.currentTile.kind}`,
    `focus=${focusSignature(snapshot)}`,
    `quest=${questSignature(snapshot)}`,
    `encounter=${encounterStateSummary(snapshot)}`,
  ].join(' ');
}

function hasMoveEffect(before: GameplayShardSnapshot, after: GameplayShardSnapshot | null) {
  if (!after) {
    return false;
  }

  if (after.position.x !== before.position.x || after.position.y !== before.position.y) {
    return true;
  }

  if (after.encounter?.status === 'active' && after.encounter.id !== before.encounter?.id) {
    return true;
  }

  if (secureQuestCompleted(after) !== secureQuestCompleted(before)) {
    return true;
  }

  if (questSignature(after) !== questSignature(before)) {
    return true;
  }

  return focusSignature(after) !== focusSignature(before);
}

async function waitForMoveResult(
  session: LiveShardSession,
  before: GameplayShardSnapshot,
  previousVersion: number,
  direction: GameplayDirection,
  timeoutMs: number
) {
  try {
    return await session.waitForStateAfter(previousVersion, (state) => hasMoveEffect(before, state), timeoutMs);
  } catch (error) {
    throw new Error(
      `Timed out waiting for ${direction} move from ${describeSnapshotPosition(before)}; latest ${describeSnapshotPosition(session.latestState)}`
    );
  }
}

async function waitForEncounterResolution(session: LiveShardSession, snapshot: GameplayShardSnapshot) {
  const encounterId = snapshot.encounter?.id ?? null;
  const encounterRound = snapshot.encounter?.round ?? null;
  const encounterStatus = snapshot.encounter?.status ?? null;

  return session.waitForState((state) => {
    const nextEncounter = state?.encounter ?? null;

    if (!encounterId || !nextEncounter || nextEncounter.id !== encounterId) {
      return true;
    }

    return nextEncounter.status !== encounterStatus || nextEncounter.round !== encounterRound;
  }, 15_000);
}

async function runQuestLoop(session: LiveShardSession, maxDefeats: number) {
  let guard = 0;
  let defeats = 0;
  const recentSteps: string[] = [];
  let lastQuestSignature = '';
  let lastFocusSignature = '';
  let lastEncounterSignature = '';

  const record = (message: string) => {
    recentSteps.push(message);
    if (recentSteps.length > 24) {
      recentSteps.shift();
    }
  };

  while (!secureQuestCompleted(session.latestState)) {
    guard += 1;

    if (guard > 240) {
      throw new Error(`Quest loop exceeded the safety step budget. Recent steps: ${recentSteps.join(' | ')}`);
    }

    const snapshot = session.latestState;

    if (!snapshot) {
      record('waiting-for-first-state');
      await session.waitForState((state) => Boolean(state), 10_000);
      continue;
    }

    const currentQuestSignature = questSignature(snapshot);
    if (currentQuestSignature !== lastQuestSignature) {
      lastQuestSignature = currentQuestSignature;
      logStage(`quest state -> ${currentQuestSignature}`);
    }

    const currentFocusSignature = focusSignature(snapshot);
    if (currentFocusSignature !== lastFocusSignature) {
      lastFocusSignature = currentFocusSignature;
      logStage(`focus -> ${currentFocusSignature} from ${snapshot.position.x},${snapshot.position.y}`);
    }

    const encounterSignature = snapshot.encounter
      ? `${snapshot.encounter.monsterName ?? 'unknown'}:${snapshot.encounter.status}:round=${snapshot.encounter.round}:queued=${snapshot.encounter.queuedOverrides.length}`
      : 'none';
    if (encounterSignature !== lastEncounterSignature) {
      lastEncounterSignature = encounterSignature;
      logStage(`encounter -> ${encounterSignature}`);
    }

    if (snapshot.encounter?.status === 'active') {
      const command = selectEncounterCommand(snapshot);
      record(`encounter-active:${snapshot.encounter.monsterName ?? 'unknown'}:${encounterStateSummary(snapshot)}:command=${command}`);

      if (!hasQueuedHeroCommand(snapshot)) {
        session.sendOverride(command);
      }

      const resolved = await waitForEncounterResolution(session, snapshot);
      if (resolved.encounter?.status === 'lost') {
        defeats += 1;
        record(`encounter-lost:${snapshot.encounter.monsterName ?? 'unknown'}:defeats=${defeats}`);

        if (defeats > maxDefeats) {
          throw new Error(
            `Quest loop exceeded the defeat budget (${defeats}/${maxDefeats}). Recent steps: ${recentSteps.join(' | ')}`
          );
        }
      }
      continue;
    }

    const focus = snapshot.objectiveFocus;

    if (!focus) {
      if (secureQuestCompleted(snapshot)) {
        break;
      }

      record('no-focus-wait');
      const previousVersion = session.stateVersion;
      await session.waitForStateAdvance(previousVersion, 10_000);
      continue;
    }

    const direction = nextStepDirection(snapshot.position, focus.target);

    if (!direction) {
      const activeQuest = activeQuestLabel(snapshot);

      if (
        activeQuest === 'Burn the First Nest' &&
        snapshot.currentTile.kind === 'mud'
      ) {
        const previousVersion = session.stateVersion;
        record(`burn-reset-west:from=${snapshot.position.x},${snapshot.position.y}`);
        session.sendMove('west');
        await waitForMoveResult(session, snapshot, previousVersion, 'west', MOVE_RESULT_TIMEOUT_MS);
        continue;
      }

      if (
        activeQuest === 'Secure the Shrine Road' &&
        snapshot.currentTile.kind === 'mud' &&
        focus.stateLabel === 'Break the grove wolf'
      ) {
        const previousVersion = session.stateVersion;
        record(`secure-reset-south:from=${snapshot.position.x},${snapshot.position.y}`);
        session.sendMove('south');
        await waitForMoveResult(session, snapshot, previousVersion, 'south', MOVE_RESULT_TIMEOUT_MS);
        continue;
      }

      record(`focus-same-tile:${activeQuest ?? 'none'}:${snapshot.currentTile.kind}`);
      const previousVersion = session.stateVersion;
      await session.waitForStateAdvance(previousVersion, 8_000);
      continue;
    }

    const previousVersion = session.stateVersion;
    record(`move:${direction}:${focus.label}:${focus.stateLabel}:from=${snapshot.position.x},${snapshot.position.y}:target=${focus.target.x},${focus.target.y}`);
    session.sendMove(direction);
    await waitForMoveResult(session, snapshot, previousVersion, direction, MOVE_RESULT_TIMEOUT_MS);
  }

  if (!session.latestState) {
    throw new Error(`Quest loop finished without a final state. Recent steps: ${recentSteps.join(' | ')}`);
  }

  return {
    finalState: session.latestState,
    defeats,
  };
}

async function main() {
  const options = parseOptions();
  logStage(`waiting for live /e at ${options.baseUrl}${options.expectVersion ? ` (${options.expectVersion})` : ''}`);
  const live = await waitForHealth(options.baseUrl, options.expectVersion, options.pollTimeoutMs);
  const now = Date.now();
  const email = `delivered+thornlive${now}@resend.dev`;
  const password = `ThornLive!${String(now).slice(-6)}`;
  const characterName = `Warden${String(now).slice(-5)}`;

  logStage(`registering ${email}`);
  const register = await postJson(options.baseUrl, '/api/auth/register', {
    email,
    password,
  });

  if (register.response.status !== 201) {
    throw new Error(`Register failed with ${register.response.status}`);
  }

  logStage('waiting for verification email');
  const verification = await waitForVerificationLink(email, options.resendToken, options.baseUrl);
  logStage(`verifying via email ${verification.id}`);
  const verifyResponse = await fetchWithTimeout(verification.verifyLink, {
    redirect: 'manual',
  });

  if (verifyResponse.status !== 302) {
    throw new Error(`Verify link returned ${verifyResponse.status}`);
  }

  logStage('logging in');
  const login = await postJson(options.baseUrl, '/api/auth/login', {
    email,
    password,
  });

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

  const upgradedCookie = extractCookie(createCharacter.response, SESSION_COOKIE_NAME) ?? sessionCookie;
  logStage('minting attach token');
  const attach = await postJson(
    options.baseUrl,
    '/api/auth/attach',
    {},
    {
      cookie: `${SESSION_COOKIE_NAME}=${upgradedCookie}`,
    },
  );

  if (attach.response.status !== 200 || !attach.json || typeof attach.json !== 'object' || typeof (attach.json as { attachToken?: unknown }).attachToken !== 'string') {
    throw new Error(`Attach failed with ${attach.response.status}`);
  }

  const attachToken = (attach.json as { attachToken: string }).attachToken;
  const session = new LiveShardSession(resolveWebSocketUrl(options.baseUrl), attachToken);

  try {
    logStage('connecting websocket');
    await session.connect();
    logStage(`attached to ${session.shardWorldInstanceId ?? 'unknown-shard'}, running quest loop`);
    const { finalState, defeats } = await runQuestLoop(session, options.maxDefeats);
    const secureQuest = finalState?.character.completedQuests.find((quest) => quest.id === 'secure-the-shrine-road') ?? null;

    if (!finalState || !secureQuestCompleted(finalState) || !secureQuest) {
      throw new Error('Secure the Shrine Road did not complete in the live quest loop');
    }

    logStage('quest loop completed');
    console.log(
      JSON.stringify(
        {
          baseUrl: options.baseUrl,
          version: live.version,
          commit: live.commit,
          email,
          verificationEmailId: verification.id,
          verificationLastEvent: verification.lastEvent,
          characterName,
          shardWorldInstanceId: session.shardWorldInstanceId,
          finalPosition: finalState.position,
          finalGround: finalState.currentTile.kind,
          secureQuest,
          defeats,
          maxDefeats: options.maxDefeats,
          completedQuestCount: finalState.character.completedQuests.length,
          gold: finalState.character.gold,
          xp: finalState.character.xp,
          unlocks: finalState.character.unlocks,
        },
        null,
        2,
      ),
    );
  } finally {
    await session.close();
  }
}

void main().catch((error) => {
  console.error(
    '[thornwrithe live quest runner] failed',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
