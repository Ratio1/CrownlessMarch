export {};

function extractCookieValue(setCookieHeader: string, name: string) {
  const match = setCookieHeader.match(new RegExp(`${name}=([^;]+)`));

  if (!match) {
    throw new Error(`Missing cookie ${name}`);
  }

  return match[1];
}

describe('admin auth', () => {
  const baseUrl = 'http://thornwrithe.test';

  beforeEach(() => {
    jest.resetModules();
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASS;
    delete process.env.THORNWRITHE_ADMIN_USER;
    delete process.env.THORNWRITHE_ADMIN_PASS;
    process.env.SESSION_SECRET = 'test-session-secret-0123456789012345';
  });

  it('prefers ADMIN_* credentials over THORNWRITHE_ADMIN_* fallbacks', async () => {
    process.env.ADMIN_USER = 'primary-admin';
    process.env.ADMIN_PASS = 'primary-pass';
    process.env.THORNWRITHE_ADMIN_USER = 'fallback-admin';
    process.env.THORNWRITHE_ADMIN_PASS = 'fallback-pass';

    const adminAuth = await import('../../src/server/admin/auth');

    expect(adminAuth.resolveAdminCredentials()).toEqual({
      username: 'primary-admin',
      password: 'primary-pass',
    });
  });

  it('falls back to THORNWRITHE_ADMIN_* credentials when ADMIN_* are absent', async () => {
    process.env.THORNWRITHE_ADMIN_USER = 'fallback-admin';
    process.env.THORNWRITHE_ADMIN_PASS = 'fallback-pass';

    const adminAuth = await import('../../src/server/admin/auth');

    expect(adminAuth.resolveAdminCredentials()).toEqual({
      username: 'fallback-admin',
      password: 'fallback-pass',
    });
  });

  it('issues a dedicated admin cookie after successful login', async () => {
    process.env.THORNWRITHE_ADMIN_USER = 'dev-admin';
    process.env.THORNWRITHE_ADMIN_PASS = 'dev-pass';

    const adminAuth = await import('../../src/server/admin/auth');
    const loginRoute = await import('../../app/api/admin/login/route');

    const response = await loginRoute.POST(
      new Request(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          username: 'dev-admin',
          password: 'dev-pass',
        }),
      }),
    );

    expect(response.status).toBe(200);

    const setCookie = response.headers.get('set-cookie');

    expect(setCookie).toContain(`${adminAuth.ADMIN_SESSION_COOKIE_NAME}=`);

    const token = extractCookieValue(setCookie ?? '', adminAuth.ADMIN_SESSION_COOKIE_NAME);
    const payload = await adminAuth.verifyAdminSessionToken(token);

    expect(payload).toEqual({
      username: 'dev-admin',
      role: 'admin',
    });
  });

  it('rejects invalid admin credentials', async () => {
    process.env.THORNWRITHE_ADMIN_USER = 'dev-admin';
    process.env.THORNWRITHE_ADMIN_PASS = 'dev-pass';

    const loginRoute = await import('../../app/api/admin/login/route');

    const response = await loginRoute.POST(
      new Request(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          username: 'dev-admin',
          password: 'wrong-pass',
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid admin credentials',
    });
  });
});
