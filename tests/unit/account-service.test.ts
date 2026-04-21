jest.mock('../../src/server/auth/cstore', () => ({
  ensureAuthInitialized: jest.fn(),
  getAuthClient: jest.fn(),
  isSharedAuthConfigured: jest.fn(),
}));

jest.mock('../../src/server/platform/r1fs-characters', () => ({
  createInitialCharacterCheckpoint: jest.fn(),
}));

jest.mock('../../src/server/platform/cstore-roster', () => ({
  readRosterEntry: jest.fn(),
  writeRosterEntry: jest.fn(),
}));

describe('account service', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('registers through shared auth and seeds an initial character checkpoint', async () => {
    const cstore = await import('../../src/server/auth/cstore');
    const r1fsCharacters = await import('../../src/server/platform/r1fs-characters');
    const roster = await import('../../src/server/platform/cstore-roster');
    const accountService = await import('../../src/server/auth/account-service');

    const getUser = jest.fn().mockResolvedValue(null);
    const createUser = jest.fn().mockResolvedValue({
      username: 'ignored',
      role: 'user',
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'simple',
    });

    (cstore.isSharedAuthConfigured as jest.Mock).mockReturnValue(true);
    (cstore.getAuthClient as jest.Mock).mockReturnValue({
      simple: {
        getUser,
        createUser,
      },
    });
    (r1fsCharacters.createInitialCharacterCheckpoint as jest.Mock).mockResolvedValue({
      cid: 'cid-initial',
      persist_revision: 0,
      snapshot: { name: 'First Warden' },
    });

    await expect(
      accountService.registerAccount({
        email: 'First@Test.Invalid',
        password: 'hunter2',
        characterName: 'First Warden',
      }),
    ).resolves.toEqual({
      accountId: 'first@test.invalid',
      characterId: 'cid-initial',
    });

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledWith(
      expect.any(String),
      'hunter2',
      expect.objectContaining({
        metadata: {
          email: 'first@test.invalid',
          characterId: 'cid-initial',
          characterName: 'First Warden',
        },
      }),
    );
    expect(r1fsCharacters.createInitialCharacterCheckpoint).toHaveBeenCalledWith({
      characterName: 'First Warden',
    });
    expect(roster.writeRosterEntry).toHaveBeenCalledWith(
      'first@test.invalid',
      expect.objectContaining({
        accountId: 'first@test.invalid',
        email: 'first@test.invalid',
        characterName: 'First Warden',
        latestCharacterCid: 'cid-initial',
        persistRevision: 0,
      }),
    );
  });

  it('authenticates through the durable roster instead of stale shared auth metadata', async () => {
    const cstore = await import('../../src/server/auth/cstore');
    const roster = await import('../../src/server/platform/cstore-roster');
    const accountService = await import('../../src/server/auth/account-service');

    (cstore.isSharedAuthConfigured as jest.Mock).mockReturnValue(true);
    (cstore.getAuthClient as jest.Mock).mockReturnValue({
      simple: {
        authenticate: jest.fn().mockResolvedValue({
          username: 'ignored',
          role: 'user',
          metadata: {
            email: 'shared@test.invalid',
            characterId: 'cid-shared',
            characterName: 'Shared Warden',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          type: 'simple',
        }),
      },
    });
    (roster.readRosterEntry as jest.Mock).mockResolvedValue({
      version: 1,
      accountId: 'shared@test.invalid',
      email: 'shared@test.invalid',
      characterName: 'Shared Warden',
      latestCharacterCid: 'cid-latest',
      persistRevision: 4,
      registeredAt: '2026-04-21T18:00:00.000Z',
      lastPersistedAt: '2026-04-21T18:04:00.000Z',
    });

    await expect(
      accountService.authenticateAccount({
        email: 'Shared@Test.Invalid',
        password: 'hunter2',
      }),
    ).resolves.toEqual({
      accountId: 'shared@test.invalid',
      characterId: 'cid-latest',
    });
  });
});
