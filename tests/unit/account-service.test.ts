jest.mock('../../src/server/auth/cstore', () => ({
  ensureAuthInitialized: jest.fn(),
  getAuthClient: jest.fn(),
  isSharedAuthConfigured: jest.fn(),
}));

jest.mock('../../src/server/auth/email-verification', () => ({
  issueEmailVerificationToken: jest.fn(),
  consumeEmailVerificationToken: jest.fn(),
  sendVerificationEmail: jest.fn(),
  getVerificationEmailFrom: jest.fn(() => 'onboarding@resend.dev'),
  VerificationDeliveryError: class VerificationDeliveryError extends Error {},
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

  it('registers through shared auth and issues a verification token', async () => {
    const cstore = await import('../../src/server/auth/cstore');
    const verification = await import('../../src/server/auth/email-verification');
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
    (verification.issueEmailVerificationToken as jest.Mock).mockResolvedValue({
      token: 'verify-token',
      accountId: 'first@test.invalid',
      email: 'first@test.invalid',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    });
    (verification.sendVerificationEmail as jest.Mock).mockResolvedValue(undefined);

    await expect(
      accountService.registerAccount({
        email: 'First@Test.Invalid',
        password: 'hunter234',
        appOrigin: 'https://devnet-thorn.ratio1.link',
      }),
    ).resolves.toMatchObject({
      account: {
        accountId: 'first@test.invalid',
        email: 'first@test.invalid',
        emailVerified: false,
        characterId: null,
      },
      verificationToken: 'verify-token',
    });

    expect(createUser).toHaveBeenCalledWith(
      expect.any(String),
      'hunter234',
      expect.objectContaining({
        metadata: {
          accountId: 'first@test.invalid',
          email: 'first@test.invalid',
          emailVerified: false,
        },
      }),
    );
    expect(verification.issueEmailVerificationToken).toHaveBeenCalledWith({
      accountId: 'first@test.invalid',
      email: 'first@test.invalid',
    });
    expect(verification.sendVerificationEmail).toHaveBeenCalledWith({
      email: 'first@test.invalid',
      token: 'verify-token',
      appOrigin: 'https://devnet-thorn.ratio1.link',
    });
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
            accountId: 'shared@test.invalid',
            email: 'shared@test.invalid',
            emailVerified: true,
            latestCharacterCid: 'cid-shared',
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
        password: 'hunter234',
      }),
    ).resolves.toMatchObject({
      accountId: 'shared@test.invalid',
      characterId: 'cid-latest',
      characterName: 'Shared Warden',
      emailVerified: true,
    });
  });

  it('creates the first character checkpoint and seeds the roster', async () => {
    const cstore = await import('../../src/server/auth/cstore');
    const verification = await import('../../src/server/auth/email-verification');
    const r1fsCharacters = await import('../../src/server/platform/r1fs-characters');
    const roster = await import('../../src/server/platform/cstore-roster');
    const accountService = await import('../../src/server/auth/account-service');

    (cstore.isSharedAuthConfigured as jest.Mock).mockReturnValue(false);
    (roster.readRosterEntry as jest.Mock).mockResolvedValue(null);
    (verification.issueEmailVerificationToken as jest.Mock).mockResolvedValue({
      token: 'verify-token',
      accountId: 'first@test.invalid',
      email: 'first@test.invalid',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    });
    (verification.sendVerificationEmail as jest.Mock).mockResolvedValue(undefined);
    (verification.consumeEmailVerificationToken as jest.Mock).mockResolvedValue({
      token: 'verify-token',
      accountId: 'first@test.invalid',
      email: 'first@test.invalid',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    });
    (r1fsCharacters.createInitialCharacterCheckpoint as jest.Mock).mockResolvedValue({
      cid: 'cid-initial',
      persist_revision: 0,
      snapshot: { name: 'First Warden', classId: 'fighter' },
    });

    await accountService.registerAccount({
      email: 'first@test.invalid',
      password: 'hunter234',
      appOrigin: 'http://localhost:3000',
    });
    await accountService.verifyAccountEmail('verify-token');

    await expect(
      accountService.createCharacterForAccount({
        accountId: 'first@test.invalid',
        characterName: 'First Warden',
        classId: 'fighter',
        attributes: {
          strength: 15,
          dexterity: 14,
          constitution: 11,
          intelligence: 10,
          wisdom: 9,
          charisma: 8,
        },
      })
    ).resolves.toMatchObject({
      accountId: 'first@test.invalid',
      characterId: 'cid-initial',
      characterName: 'First Warden',
    });

    expect(r1fsCharacters.createInitialCharacterCheckpoint).toHaveBeenCalled();
    expect(roster.writeRosterEntry).toHaveBeenCalledWith(
      'first@test.invalid',
      expect.objectContaining({
        accountId: 'first@test.invalid',
        latestCharacterCid: 'cid-initial',
        characterName: 'First Warden',
      })
    );
  });
});
