export {};

function jsonRequest(url: string, body: unknown, headers?: Record<string, string>) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function extractCookieValue(setCookieHeader: string, name: string) {
  const match = setCookieHeader.match(new RegExp(`${name}=([^;]+)`));

  if (!match) {
    throw new Error(`Missing cookie ${name}`);
  }

  return match[1];
}

describe('auth attach flow', () => {
  const baseUrl = 'http://thornwrithe.test';

  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('../../src/server/auth/session');
    jest.dontMock('../../src/server/auth/account-service');
    delete process.env.R1EN_CSTORE_AUTH_HKEY;
    delete process.env.R1EN_CSTORE_AUTH_SECRET;
    delete process.env.R1EN_CSTORE_AUTH_BOOTSTRAP_ADMIN_PWD;
    delete process.env.EE_CSTORE_AUTH_HKEY;
    delete process.env.EE_CSTORE_AUTH_SECRET;
    process.env.SESSION_SECRET = 'test-session-secret-0123456789012345';
    process.env.ATTACH_TOKEN_SECRET = 'test-attach-secret-0123456789012345';
  });

  beforeEach(async () => {
    (await import('../../src/server/auth/account-service')).__resetAccountsForTests();
    (await import('../../src/server/auth/email-verification')).__resetEmailVerificationForTests();
    (await import('../../src/server/platform/r1fs-characters')).__resetCharacterCheckpointStoreForTests();
    (await import('../../src/server/platform/cstore-roster')).__resetRosterStoreForTests();
  });

  async function registerVerifyLoginCreateCharacter() {
    const registerRoute = await import('../../app/api/auth/register/route');
    const loginRoute = await import('../../app/api/auth/login/route');
    const verifyRoute = await import('../../app/api/auth/verify/route');
    const createCharacterRoute = await import('../../app/api/characters/route');
    const session = await import('../../src/server/auth/session');

    const registerResponse = await registerRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/register`, {
        email: 'attach@test.invalid',
        password: 'hunter234',
      }),
    );
    expect(registerResponse.status).toBe(201);
    const registerBody = (await registerResponse.json()) as { verificationToken?: string };

    const preVerifyLoginResponse = await loginRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/login`, {
        email: 'attach@test.invalid',
        password: 'hunter234',
      }),
    );
    expect(preVerifyLoginResponse.status).toBe(403);

    const verifyResponse = await verifyRoute.GET(
      new Request(`${baseUrl}/api/auth/verify?token=${encodeURIComponent(registerBody.verificationToken ?? '')}`, {
        method: 'GET',
      }),
    );
    expect(verifyResponse.status).toBe(302);

    const loginResponse = await loginRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/login`, {
        email: 'attach@test.invalid',
        password: 'hunter234',
      }),
    );
    expect(loginResponse.status).toBe(200);

    const loginSetCookie = loginResponse.headers.get('set-cookie');
    const loginSessionToken = extractCookieValue(loginSetCookie ?? '', session.SESSION_COOKIE_NAME);
    const loginSession = await session.verifySessionToken(loginSessionToken);

    expect(loginSession.characterId).toBeNull();

    const createCharacterResponse = await createCharacterRoute.POST(
      jsonRequest(
        `${baseUrl}/api/characters`,
        {
          name: 'Attach Warden',
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
          cookie: `${session.SESSION_COOKIE_NAME}=${loginSessionToken}`,
        },
      ),
    );

    expect(createCharacterResponse.status).toBe(201);
    const characterBody = (await createCharacterResponse.json()) as {
      character?: { cid?: string; name?: string };
    };
    const createSetCookie = createCharacterResponse.headers.get('set-cookie');
    const characterSessionToken = extractCookieValue(createSetCookie ?? '', session.SESSION_COOKIE_NAME);
    const characterSession = await session.verifySessionToken(characterSessionToken);

    return {
      session,
      characterBody,
      characterSession,
      characterSessionToken,
    };
  }

  it('issues a session cookie after verified login and upgrades it after character creation', async () => {
    const { characterBody, characterSession } = await registerVerifyLoginCreateCharacter();

    expect(characterBody.character).toMatchObject({
      name: 'Attach Warden',
      cid: expect.any(String),
    });
    expect(characterSession).toMatchObject({
      accountId: 'attach@test.invalid',
      characterId: characterBody.character?.cid,
    });
  });

  it('mints a short-lived attach token for an authenticated session with a character', async () => {
    const attachRoute = await import('../../app/api/auth/attach/route');
    const attachToken = await import('../../src/server/auth/attach-token');
    const { session, characterSession, characterSessionToken } = await registerVerifyLoginCreateCharacter();

    const attachResponse = await attachRoute.POST(
      jsonRequest(
        `${baseUrl}/api/auth/attach`,
        {},
        { cookie: `${session.SESSION_COOKIE_NAME}=${characterSessionToken}` },
      ),
    );

    expect(attachResponse.status).toBe(200);

    const body = (await attachResponse.json()) as { attachToken: string };
    const attachPayload = await attachToken.verifyAttachToken(body.attachToken);

    expect(attachPayload).toMatchObject({
      accountId: characterSession.accountId,
      characterId: characterSession.characterId,
      issuedAt: expect.any(String),
    });
  });

  it('refuses attach token minting before character creation', async () => {
    const registerRoute = await import('../../app/api/auth/register/route');
    const loginRoute = await import('../../app/api/auth/login/route');
    const verifyRoute = await import('../../app/api/auth/verify/route');
    const attachRoute = await import('../../app/api/auth/attach/route');
    const session = await import('../../src/server/auth/session');

    const registerResponse = await registerRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/register`, {
        email: 'no-character@test.invalid',
        password: 'hunter234',
      }),
    );
    const registerBody = (await registerResponse.json()) as { verificationToken?: string };

    await verifyRoute.GET(
      new Request(`${baseUrl}/api/auth/verify?token=${encodeURIComponent(registerBody.verificationToken ?? '')}`, {
        method: 'GET',
      }),
    );

    const loginResponse = await loginRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/login`, {
        email: 'no-character@test.invalid',
        password: 'hunter234',
      }),
    );

    const setCookie = loginResponse.headers.get('set-cookie');
    const sessionToken = extractCookieValue(setCookie ?? '', session.SESSION_COOKIE_NAME);

    const response = await attachRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/attach`, {}, { cookie: `${session.SESSION_COOKIE_NAME}=${sessionToken}` }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Character creation required',
    });
  });
});
