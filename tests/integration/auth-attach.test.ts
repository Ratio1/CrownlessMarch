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
    process.env.SESSION_SECRET = 'test-session-secret-0123456789012345';
    process.env.ATTACH_TOKEN_SECRET = 'test-attach-secret-0123456789012345';
  });

  it('issues a session cookie after login', async () => {
    const registerRoute = await import('../../app/api/auth/register/route');
    const loginRoute = await import('../../app/api/auth/login/route');
    const session = await import('../../src/server/auth/session');

    await registerRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/register`, {
        email: 'cookie@test.invalid',
        password: 'hunter2',
        characterName: 'Cookie Warden',
      }),
    );

    const response = await loginRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/login`, {
        email: 'cookie@test.invalid',
        password: 'hunter2',
      }),
    );

    expect(response.status).toBe(200);

    const setCookie = response.headers.get('set-cookie');

    expect(setCookie).toContain(`${session.SESSION_COOKIE_NAME}=`);

    const token = extractCookieValue(setCookie ?? '', session.SESSION_COOKIE_NAME);
    const payload = await session.verifySessionToken(token);

    expect(payload).toMatchObject({
      accountId: expect.any(String),
      characterId: expect.any(String),
    });
  });

  it('returns a client error for non-object registration payloads', async () => {
    const registerRoute = await import('../../app/api/auth/register/route');

    const response = await registerRoute.POST(
      new Request(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: 'null',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid registration payload',
    });
  });

  it('returns a client error for malformed login payloads', async () => {
    const loginRoute = await import('../../app/api/auth/login/route');

    const response = await loginRoute.POST(
      new Request(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: '{',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid login payload',
    });
  });

  it('returns a client error for non-object login payloads', async () => {
    const loginRoute = await import('../../app/api/auth/login/route');

    const response = await loginRoute.POST(
      new Request(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: 'null',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid login payload',
    });
  });

  it('returns a controlled server error when session configuration is missing', async () => {
    const registerRoute = await import('../../app/api/auth/register/route');
    const loginRoute = await import('../../app/api/auth/login/route');

    await registerRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/register`, {
        email: 'config@test.invalid',
        password: 'hunter2',
        characterName: 'Config Warden',
      }),
    );

    delete process.env.SESSION_SECRET;

    const response = await loginRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/login`, {
        email: 'config@test.invalid',
        password: 'hunter2',
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Session configuration invalid',
    });
  });

  it('mints a short-lived attach token for an authenticated session', async () => {
    const registerRoute = await import('../../app/api/auth/register/route');
    const loginRoute = await import('../../app/api/auth/login/route');
    const attachRoute = await import('../../app/api/auth/attach/route');
    const session = await import('../../src/server/auth/session');
    const attachToken = await import('../../src/server/auth/attach-token');

    await registerRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/register`, {
        email: 'attach@test.invalid',
        password: 'hunter2',
        characterName: 'Attach Warden',
      }),
    );

    const loginResponse = await loginRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/login`, {
        email: 'attach@test.invalid',
        password: 'hunter2',
      }),
    );

    const setCookie = loginResponse.headers.get('set-cookie');
    const sessionToken = extractCookieValue(setCookie ?? '', session.SESSION_COOKIE_NAME);
    const sessionPayload = await session.verifySessionToken(sessionToken);

    const attachResponse = await attachRoute.POST(
      jsonRequest(
        `${baseUrl}/api/auth/attach`,
        {},
        { cookie: `${session.SESSION_COOKIE_NAME}=${sessionToken}` },
      ),
    );

    expect(attachResponse.status).toBe(200);

    const body = (await attachResponse.json()) as { attachToken: string };
    const attachPayload = await attachToken.verifyAttachToken(body.attachToken);

    expect(attachPayload).toMatchObject({
      accountId: sessionPayload.accountId,
      characterId: sessionPayload.characterId,
      issuedAt: expect.any(String),
    });
  });

  it('returns a controlled server error when attach session verification is misconfigured', async () => {
    const registerRoute = await import('../../app/api/auth/register/route');
    const loginRoute = await import('../../app/api/auth/login/route');
    const attachRoute = await import('../../app/api/auth/attach/route');
    const session = await import('../../src/server/auth/session');

    await registerRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/register`, {
        email: 'attach-config@test.invalid',
        password: 'hunter2',
        characterName: 'Attach Config Warden',
      }),
    );

    const loginResponse = await loginRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/login`, {
        email: 'attach-config@test.invalid',
        password: 'hunter2',
      }),
    );

    const setCookie = loginResponse.headers.get('set-cookie');
    const sessionToken = extractCookieValue(setCookie ?? '', session.SESSION_COOKIE_NAME);

    delete process.env.SESSION_SECRET;

    const response = await attachRoute.POST(
      jsonRequest(
        `${baseUrl}/api/auth/attach`,
        {},
        { cookie: `${session.SESSION_COOKIE_NAME}=${sessionToken}` },
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Session configuration invalid',
    });
  });

  it('rejects attach token minting without a valid session', async () => {
    const attachRoute = await import('../../app/api/auth/attach/route');

    const response = await attachRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/attach`, {}, { cookie: 'thornwrithe_session=invalid-token' }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    });
  });
});
