/**
 * @jest-environment node
 */
import { __resetCStoreForTests } from '@/server/platform/cstore';

type RouteHandler = (request: Request) => Promise<Response>;

let registerPost: RouteHandler;
let loginPost: RouteHandler;
let verifyPost: RouteHandler;
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

describe('auth routes', () => {
  beforeAll(async () => {
    ({ POST: registerPost } = await import('@/app/api/auth/register/route'));
    ({ POST: loginPost } = await import('@/app/api/auth/login/route'));
    ({ POST: verifyPost } = await import('@/app/api/auth/verify/route'));
    ({ POST: createCharacterPost } = await import('@/app/api/characters/route'));
  });

  beforeEach(() => {
    __resetCStoreForTests();
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

    const verifyResponse = await verifyPost(
      jsonRequest('http://localhost/api/auth/verify', {
        token: registerBody.verificationToken
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

    await verifyPost(
      jsonRequest('http://localhost/api/auth/verify', {
        token: registerBody.verificationToken
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
});
