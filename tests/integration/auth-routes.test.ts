/**
 * @jest-environment node
 */
import { __resetCStoreForTests } from '@/server/platform/cstore';

const mockResendSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockResendSend
    }
  }))
}));

type RouteHandler = (request: Request) => Promise<Response>;

let registerPost: RouteHandler;
let loginPost: RouteHandler;
let verifyGet: RouteHandler;
let createCharacterPost: RouteHandler;

function jsonRequest(url: string, payload: unknown, init?: RequestInit) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    },
    body: JSON.stringify(payload),
    ...init
  });
}

async function withEnv(overrides: Record<string, string | undefined>, run: () => Promise<void>) {
  const previousValues = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]])
  ) as Record<string, string | undefined>;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previousValues)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('auth routes', () => {
  beforeAll(async () => {
    ({ POST: registerPost } = await import('@/app/api/auth/register/route'));
    ({ POST: loginPost } = await import('@/app/api/auth/login/route'));
    ({ GET: verifyGet } = await import('@/app/api/auth/verify/route'));
    ({ POST: createCharacterPost } = await import('@/app/api/characters/route'));
  });

  beforeEach(() => {
    __resetCStoreForTests();
    mockResendSend.mockReset();
    mockResendSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  });

  it('registers, verifies, logs in, and creates a character', async () => {
    const registerResponse = await registerPost(
      jsonRequest('http://localhost/api/auth/register', {
        username: 'thornrunner',
        email: 'thornrunner@example.com',
        password: 'S3curePassw0rd!'
      })
    );

    expect(registerResponse.status).toBe(201);
    const registerBody = (await registerResponse.json()) as { verificationToken?: string };
    expect(registerBody.verificationToken).toBeTruthy();

    const preVerifyLoginResponse = await loginPost(
      jsonRequest('http://localhost/api/auth/login', {
        username: 'thornrunner',
        password: 'S3curePassw0rd!'
      })
    );

    expect(preVerifyLoginResponse.status).toBe(403);

    const verifyResponse = await verifyGet(
      new Request(`http://localhost/api/auth/verify?token=${encodeURIComponent(registerBody.verificationToken ?? '')}`, {
        method: 'GET'
      })
    );
    expect(verifyResponse.status).toBe(200);

    const loginResponse = await loginPost(
      jsonRequest('http://localhost/api/auth/login', {
        username: 'thornrunner',
        password: 'S3curePassw0rd!'
      })
    );

    expect(loginResponse.status).toBe(200);
    const setCookie = loginResponse.headers.get('set-cookie');
    expect(setCookie).toContain('thornwrithe_session=');
    const cookieHeader = setCookie?.split(';')[0] ?? '';

    const createCharacterResponse = await createCharacterPost(
      jsonRequest(
        'http://localhost/api/characters',
        {
          name: 'Mossblade',
          classId: 'fighter',
          attributes: {
            strength: 15,
            dexterity: 14,
            constitution: 11,
            intelligence: 10,
            wisdom: 9,
            charisma: 8
          }
        },
        {
          headers: {
            cookie: cookieHeader
          }
        }
      )
    );

    expect(createCharacterResponse.status).toBe(201);
    const characterBody = (await createCharacterResponse.json()) as {
      character?: { name: string; classId: string; level: number };
    };
    expect(characterBody.character).toMatchObject({
      name: 'Mossblade',
      classId: 'fighter',
      level: 1
    });
  });

  it('rejects invalid point-buy totals', async () => {
    const registerResponse = await registerPost(
      jsonRequest('http://localhost/api/auth/register', {
        username: 'rootwarden',
        email: 'rootwarden@example.com',
        password: 'S3curePassw0rd!'
      })
    );
    const registerBody = (await registerResponse.json()) as { verificationToken?: string };

    await verifyGet(
      new Request(`http://localhost/api/auth/verify?token=${encodeURIComponent(registerBody.verificationToken ?? '')}`, {
        method: 'GET'
      })
    );

    const loginResponse = await loginPost(
      jsonRequest('http://localhost/api/auth/login', {
        username: 'rootwarden',
        password: 'S3curePassw0rd!'
      })
    );
    const setCookie = loginResponse.headers.get('set-cookie');
    const cookieHeader = setCookie?.split(';')[0] ?? '';

    const createCharacterResponse = await createCharacterPost(
      jsonRequest(
        'http://localhost/api/characters',
        {
          name: 'Overbudget',
          classId: 'wizard',
          attributes: {
            strength: 18,
            dexterity: 16,
            constitution: 16,
            intelligence: 12,
            wisdom: 10,
            charisma: 10
          }
        },
        {
          headers: {
            cookie: cookieHeader
          }
        }
      )
    );

    expect(createCharacterResponse.status).toBe(400);
    const errorBody = (await createCharacterResponse.json()) as { error?: string };
    expect(errorBody.error).toMatch(/point-buy/i);
  });

  it('returns a client error for invalid usernames', async () => {
    const registerResponse = await registerPost(
      jsonRequest('http://localhost/api/auth/register', {
        username: 'bad username',
        email: 'invalid-name@example.com',
        password: 'S3curePassw0rd!'
      })
    );

    expect(registerResponse.status).toBe(400);
    const body = (await registerResponse.json()) as { error?: string };
    expect(body.error).toMatch(/username/i);
  });

  it('fails registration when verification delivery is unavailable in non-test flows', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        THORNWRITHE_USE_IN_MEMORY_CSTORE: '1',
        THORNWRITHE_EXPOSE_VERIFICATION_TOKEN: undefined,
        RESEND_API_KEY: undefined,
        THORNWRITHE_EMAIL_FROM: undefined
      },
      async () => {
        const registerResponse = await registerPost(
          jsonRequest('http://localhost/api/auth/register', {
            username: 'nodelivery',
            email: 'nodelivery@example.com',
            password: 'S3curePassw0rd!'
          })
        );

        expect(registerResponse.status).toBe(503);
        const registerBody = (await registerResponse.json()) as { error?: string };
        expect(registerBody.error).toMatch(/verification/i);

        const loginResponse = await loginPost(
          jsonRequest('http://localhost/api/auth/login', {
            username: 'nodelivery',
            password: 'S3curePassw0rd!'
          })
        );

        expect(loginResponse.status).toBe(401);
      }
    );
  });

  it('allows production registration when only the legacy resend sender env is configured', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        THORNWRITHE_USE_IN_MEMORY_CSTORE: '1',
        THORNWRITHE_EXPOSE_VERIFICATION_TOKEN: undefined,
        RESEND_API_KEY: 'test-resend-key',
        THORNWRITHE_EMAIL_FROM: undefined,
        RESEND_FROM: 'thornwrithe@example.com'
      },
      async () => {
        const registerResponse = await registerPost(
          jsonRequest('http://localhost/api/auth/register', {
            username: 'legacysender',
            email: 'legacysender@example.com',
            password: 'S3curePassw0rd!'
          })
        );

        expect(registerResponse.status).toBe(201);
        expect(mockResendSend).toHaveBeenCalledWith(
          expect.objectContaining({
            from: 'thornwrithe@example.com',
            to: 'legacysender@example.com'
          })
        );
      }
    );
  });

  it('allows registration retry after provider send failure result', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        THORNWRITHE_USE_IN_MEMORY_CSTORE: '1',
        THORNWRITHE_EXPOSE_VERIFICATION_TOKEN: undefined,
        RESEND_API_KEY: 'test-resend-key',
        THORNWRITHE_EMAIL_FROM: 'thornwrithe@example.com'
      },
      async () => {
        mockResendSend.mockResolvedValueOnce({ data: null, error: { message: 'delivery failed' } });

        const firstAttempt = await registerPost(
          jsonRequest('http://localhost/api/auth/register', {
            username: 'retrysend',
            email: 'retrysend@example.com',
            password: 'S3curePassw0rd!'
          })
        );

        expect(firstAttempt.status).toBe(503);
        expect(mockResendSend).toHaveBeenCalledTimes(1);

        mockResendSend.mockResolvedValueOnce({ data: { id: 'email-2' }, error: null });

        const secondAttempt = await registerPost(
          jsonRequest('http://localhost/api/auth/register', {
            username: 'retrysend',
            email: 'retrysend@example.com',
            password: 'S3curePassw0rd!'
          })
        );

        expect(secondAttempt.status).toBe(201);
        expect(mockResendSend).toHaveBeenCalledTimes(2);
      }
    );
  });

  it('allows registration retry after provider send throws', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        THORNWRITHE_USE_IN_MEMORY_CSTORE: '1',
        THORNWRITHE_EXPOSE_VERIFICATION_TOKEN: undefined,
        RESEND_API_KEY: 'test-resend-key',
        THORNWRITHE_EMAIL_FROM: 'thornwrithe@example.com'
      },
      async () => {
        mockResendSend.mockRejectedValueOnce(new Error('network failure'));

        const firstAttempt = await registerPost(
          jsonRequest('http://localhost/api/auth/register', {
            username: 'retrythrow',
            email: 'retrythrow@example.com',
            password: 'S3curePassw0rd!'
          })
        );

        expect(firstAttempt.status).toBe(503);
        expect(mockResendSend).toHaveBeenCalledTimes(1);

        mockResendSend.mockResolvedValueOnce({ data: { id: 'email-3' }, error: null });

        const secondAttempt = await registerPost(
          jsonRequest('http://localhost/api/auth/register', {
            username: 'retrythrow',
            email: 'retrythrow@example.com',
            password: 'S3curePassw0rd!'
          })
        );

        expect(secondAttempt.status).toBe(201);
        expect(mockResendSend).toHaveBeenCalledTimes(2);
      }
    );
  });

  it('rejects retry with a different password for a pending unverified account', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        THORNWRITHE_USE_IN_MEMORY_CSTORE: '1',
        THORNWRITHE_EXPOSE_VERIFICATION_TOKEN: undefined,
        RESEND_API_KEY: 'test-resend-key',
        THORNWRITHE_EMAIL_FROM: 'thornwrithe@example.com'
      },
      async () => {
        mockResendSend.mockResolvedValueOnce({ data: null, error: { message: 'delivery failed' } });

        const firstAttempt = await registerPost(
          jsonRequest('http://localhost/api/auth/register', {
            username: 'pwretry',
            email: 'pwretry@example.com',
            password: 'S3curePassw0rd!'
          })
        );

        expect(firstAttempt.status).toBe(503);
        expect(mockResendSend).toHaveBeenCalledTimes(1);

        mockResendSend.mockResolvedValueOnce({ data: { id: 'email-4' }, error: null });

        const secondAttempt = await registerPost(
          jsonRequest('http://localhost/api/auth/register', {
            username: 'pwretry',
            email: 'pwretry@example.com',
            password: 'DifferentPassw0rd!'
          })
        );

        expect(secondAttempt.status).toBe(401);
        const secondBody = (await secondAttempt.json()) as { error?: string };
        expect(secondBody.error).toMatch(/password/i);
        expect(mockResendSend).toHaveBeenCalledTimes(1);
      }
    );
  });
});
