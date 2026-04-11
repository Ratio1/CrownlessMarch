/**
 * @jest-environment node
 */
import { __resetCStoreForTests, getCStore } from '@/server/platform/cstore';
import { getSessionCookieName, type SessionRecord } from '@/server/auth/session';
import type { AccountRecord } from '@/server/auth/account-service';
import type { CharacterRecord } from '@/shared/domain/types';
import { keys } from '@/shared/persistence/keys';

type SnapshotRouteHandler = (request: Request) => Promise<Response>;
type MoveRouteHandler = (request: Request) => Promise<Response>;

let snapshotGet: SnapshotRouteHandler;
let movePost: MoveRouteHandler;

describe('world routes', () => {
  beforeAll(async () => {
    ({ GET: snapshotGet } = await import('@/app/api/world/snapshot/route'));
    ({ POST: movePost } = await import('@/app/api/world/move/route'));
  });

  beforeEach(() => {
    __resetCStoreForTests();
  });

  it('recovers active character from account record when session lacks characterId', async () => {
    await seedWorldRouteState();

    const response = await snapshotGet(
      new Request('http://localhost/api/world/snapshot', {
        method: 'GET',
        headers: {
          cookie: `${getSessionCookieName()}=sess-route-test`
        }
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      snapshot?: { position?: { x: number; y: number } };
    };
    expect(body.snapshot?.position).toEqual({ x: 5, y: 5 });
  });

  it('allows movement by recovering active character from account record', async () => {
    await seedWorldRouteState();

    const response = await movePost(
      new Request('http://localhost/api/world/move', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${getSessionCookieName()}=sess-route-test`
        },
        body: JSON.stringify({ direction: 'east' })
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      snapshot?: { position?: { x: number; y: number } };
    };
    expect(body.snapshot?.position).toEqual({ x: 6, y: 5 });
  });
});

async function seedWorldRouteState() {
  const now = new Date().toISOString();
  const session: SessionRecord = {
    id: 'sess-route-test',
    accountId: 'acct-route-test',
    username: 'routeuser',
    createdAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  };
  const account: AccountRecord = {
    id: 'acct-route-test',
    username: 'routeuser',
    email: 'routeuser@example.com',
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    activeCharacterId: 'char-route-test'
  };
  const character: CharacterRecord = {
    id: 'char-route-test',
    accountId: 'acct-route-test',
    name: 'Routeblade',
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
