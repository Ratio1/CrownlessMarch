export {};

function jsonRequest(url: string, payload: unknown, init?: RequestInit) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(payload),
    ...init,
  });
}

describe('auth routes', () => {
  const baseUrl = 'http://localhost';

  beforeEach(() => {
    jest.resetModules();
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

  it('registers, verifies, logs in, and creates a character', async () => {
    const registerRoute = await import('../../app/api/auth/register/route');
    const loginRoute = await import('../../app/api/auth/login/route');
    const verifyRoute = await import('../../app/api/auth/verify/route');
    const createCharacterRoute = await import('../../app/api/characters/route');
    const session = await import('../../src/server/auth/session');

    const registerResponse = await registerRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/register`, {
        email: 'thornrunner@example.com',
        password: 'S3curePassw0rd!',
      })
    );

    expect(registerResponse.status).toBe(201);
    const registerBody = (await registerResponse.json()) as { verificationToken?: string };
    expect(registerBody.verificationToken).toBeTruthy();

    const preVerifyLoginResponse = await loginRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/login`, {
        email: 'thornrunner@example.com',
        password: 'S3curePassw0rd!',
      })
    );

    expect(preVerifyLoginResponse.status).toBe(403);

    const verifyResponse = await verifyRoute.GET(
      new Request(`${baseUrl}/api/auth/verify?token=${encodeURIComponent(registerBody.verificationToken ?? '')}`, {
        method: 'GET',
      })
    );
    expect(verifyResponse.status).toBe(302);

    const loginResponse = await loginRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/login`, {
        email: 'thornrunner@example.com',
        password: 'S3curePassw0rd!',
      })
    );

    expect(loginResponse.status).toBe(200);
    const setCookie = loginResponse.headers.get('set-cookie');
    expect(setCookie).toContain('thornwrithe_session=');
    const cookieHeader = setCookie?.split(';')[0] ?? '';

    const createCharacterResponse = await createCharacterRoute.POST(
      jsonRequest(
        `${baseUrl}/api/characters`,
        {
          name: 'Mossblade',
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
          headers: {
            cookie: cookieHeader,
          },
        }
      )
    );

    expect(createCharacterResponse.status).toBe(201);
    const upgradedCookie = createCharacterResponse.headers.get('set-cookie');
    const upgradedToken = (upgradedCookie ?? '').split(';')[0].split('=').slice(1).join('=');
    const upgradedSession = await session.verifySessionToken(upgradedToken);
    const characterBody = (await createCharacterResponse.json()) as {
      character?: { name: string; classId: string; cid: string };
    };

    expect(characterBody.character).toMatchObject({
      name: 'Mossblade',
      classId: 'fighter',
      cid: expect.any(String),
    });
    expect(upgradedSession.characterId).toBe(characterBody.character?.cid);
  });

  it('rejects invalid point-buy totals', async () => {
    const registerRoute = await import('../../app/api/auth/register/route');
    const loginRoute = await import('../../app/api/auth/login/route');
    const verifyRoute = await import('../../app/api/auth/verify/route');
    const createCharacterRoute = await import('../../app/api/characters/route');

    const registerResponse = await registerRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/register`, {
        email: 'rootwarden@example.com',
        password: 'S3curePassw0rd!',
      })
    );
    const registerBody = (await registerResponse.json()) as { verificationToken?: string };

    await verifyRoute.GET(
      new Request(`${baseUrl}/api/auth/verify?token=${encodeURIComponent(registerBody.verificationToken ?? '')}`, {
        method: 'GET',
      })
    );

    const loginResponse = await loginRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/login`, {
        email: 'rootwarden@example.com',
        password: 'S3curePassw0rd!',
      })
    );
    const setCookie = loginResponse.headers.get('set-cookie');
    const cookieHeader = setCookie?.split(';')[0] ?? '';

    const createCharacterResponse = await createCharacterRoute.POST(
      jsonRequest(
        `${baseUrl}/api/characters`,
        {
          name: 'Overbudget',
          classId: 'wizard',
          attributes: {
            strength: 18,
            dexterity: 16,
            constitution: 16,
            intelligence: 12,
            wisdom: 10,
            charisma: 10,
          },
        },
        {
          headers: {
            cookie: cookieHeader,
          },
        }
      )
    );

    expect(createCharacterResponse.status).toBe(400);
    const errorBody = (await createCharacterResponse.json()) as { error?: string };
    expect(errorBody.error).toMatch(/point-buy/i);
  });

  it('redirects verification using forwarded public origin headers', async () => {
    const registerRoute = await import('../../app/api/auth/register/route');
    const verifyRoute = await import('../../app/api/auth/verify/route');

    const forwardedHeaders = {
      host: 'localhost:3000',
      'x-forwarded-host': 'devnet-thorn.ratio1.link',
      'x-forwarded-proto': 'https',
    };

    const registerResponse = await registerRoute.POST(
      jsonRequest(
        `${baseUrl}/api/auth/register`,
        {
          email: 'proxy-thorn@example.com',
          password: 'S3curePassw0rd!',
        },
        {
          headers: forwardedHeaders,
        }
      )
    );
    const registerBody = (await registerResponse.json()) as { verificationToken?: string };

    const verifyResponse = await verifyRoute.GET(
      new Request(`${baseUrl}/api/auth/verify?token=${encodeURIComponent(registerBody.verificationToken ?? '')}`, {
        method: 'GET',
        headers: forwardedHeaders,
      })
    );

    expect(verifyResponse.status).toBe(302);
    expect(verifyResponse.headers.get('location')).toBe('https://devnet-thorn.ratio1.link/?verification=verified');
  });
});
