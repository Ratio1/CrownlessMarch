/**
 * @jest-environment node
 */
import { __resetCStoreForTests, getCStore } from '@/server/platform/cstore';
import { getSessionCookieName, type SessionRecord } from '@/server/auth/session';
import type { AccountRecord } from '@/server/auth/account-service';
import type { CharacterRecord } from '@/shared/domain/types';
import { keys } from '@/shared/persistence/keys';

type MoveRouteHandler = (request: Request) => Promise<Response>;
type EncounterSnapshotRouteHandler = (request: Request, context: { params: Promise<{ encounterId: string }> }) => Promise<Response>;
type EncounterOverrideRouteHandler = (request: Request, context: { params: Promise<{ encounterId: string }> }) => Promise<Response>;

let movePost: MoveRouteHandler;
let encounterSnapshotGet: EncounterSnapshotRouteHandler;
let encounterOverridePost: EncounterOverrideRouteHandler;

describe('encounter flow', () => {
  let randomSpy: jest.SpyInstance<number, []>;

  beforeAll(async () => {
    ({ POST: movePost } = await import('@/app/api/world/move/route'));
    ({ GET: encounterSnapshotGet } = await import('@/app/api/encounters/[encounterId]/snapshot/route'));
    ({ POST: encounterOverridePost } = await import('@/app/api/encounters/[encounterId]/override/route'));
  });

  beforeEach(async () => {
    __resetCStoreForTests();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    randomSpy = jest.spyOn(Math, 'random').mockImplementation(() => 0.5);
    await seedEncounterFlowState();
  });

  afterEach(() => {
    randomSpy.mockRestore();
    jest.useRealTimers();
  });

  it('advances an overdue encounter when polling snapshot', async () => {
    const moveResponse = await movePost(
      new Request('http://localhost/api/world/move', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${getSessionCookieName()}=sess-encounter-flow`
        },
        body: JSON.stringify({ direction: 'east' })
      })
    );

    const moveBody = (await moveResponse.json()) as {
      encounter?: { id: string };
    };
    const encounterId = moveBody.encounter?.id ?? '';
    expect(encounterId).not.toBe('');

    jest.setSystemTime(new Date('2026-01-01T00:00:04.100Z'));

    const snapshotResponse = await encounterSnapshotGet(
      new Request(`http://localhost/api/encounters/${encounterId}/snapshot`, {
        method: 'GET',
        headers: { cookie: `${getSessionCookieName()}=sess-encounter-flow` }
      }),
      { params: Promise.resolve({ encounterId }) }
    );

    expect(snapshotResponse.status).toBe(200);
    const snapshotBody = (await snapshotResponse.json()) as {
      encounter?: { round: number; logs: Array<{ round: number; text: string }> };
    };

    expect(snapshotBody.encounter?.round).toBe(3);
    expect(snapshotBody.encounter?.logs).toHaveLength(5);
    expect(snapshotBody.encounter?.logs.at(-1)?.text).toMatch(/turn|strikes|attacks/i);
  });

  it('queues override actions and applies them during snapshot advancement', async () => {
    randomSpy.mockReset();
    randomSpy.mockImplementationOnce(() => 0.95).mockImplementationOnce(() => 0.1);

    const moveResponse = await movePost(
      new Request('http://localhost/api/world/move', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${getSessionCookieName()}=sess-encounter-flow`
        },
        body: JSON.stringify({ direction: 'east' })
      })
    );
    const moveBody = (await moveResponse.json()) as {
      encounter?: { id: string };
    };
    const encounterId = moveBody.encounter?.id ?? '';

    const overrideResponse = await encounterOverridePost(
      new Request(`http://localhost/api/encounters/${encounterId}/override`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${getSessionCookieName()}=sess-encounter-flow`
        },
        body: JSON.stringify({ command: 'escape' })
      }),
      { params: Promise.resolve({ encounterId }) }
    );

    expect(overrideResponse.status).toBe(202);

    jest.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));

    const snapshotResponse = await encounterSnapshotGet(
      new Request(`http://localhost/api/encounters/${encounterId}/snapshot`, {
        method: 'GET',
        headers: { cookie: `${getSessionCookieName()}=sess-encounter-flow` }
      }),
      { params: Promise.resolve({ encounterId }) }
    );

    expect(snapshotResponse.status).toBe(200);
    const snapshotBody = (await snapshotResponse.json()) as {
      encounter?: {
        status: string;
        logs: Array<{ round: number; text: string }>;
        queuedOverrides: Array<{ command: string }>;
      };
    };

    expect(snapshotBody.encounter?.status).toBe('escaped');
    expect(snapshotBody.encounter?.logs.at(-1)?.text).toMatch(/escape/i);
    expect(snapshotBody.encounter?.queuedOverrides).toHaveLength(0);
  });
});

async function seedEncounterFlowState() {
  const now = new Date().toISOString();
  const session: SessionRecord = {
    id: 'sess-encounter-flow',
    accountId: 'acct-encounter-flow',
    username: 'encounteruser',
    createdAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  };
  const account: AccountRecord = {
    id: 'acct-encounter-flow',
    username: 'encounteruser',
    email: 'encounteruser@example.com',
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    activeCharacterId: 'char-encounter-flow'
  };
  const character: CharacterRecord = {
    id: 'char-encounter-flow',
    accountId: 'acct-encounter-flow',
    name: 'Mossblade',
    classId: 'fighter',
    level: 1,
    xp: 0,
    attributes: {
      strength: 15,
      dexterity: 14,
      constitution: 11,
      intelligence: 10,
      wisdom: 9,
      charisma: 8
    },
    position: { x: 5, y: 5 },
    hitPoints: { current: 12, max: 12 },
    inventory: ['rusted-sword'],
    equipped: { weapon: 'rusted-sword' },
    activeQuestIds: []
  };

  await getCStore().setJson(keys.session(session.id), session);
  await getCStore().setJson(keys.account(account.id), account);
  await getCStore().setJson(keys.character(character.id), character);
}
