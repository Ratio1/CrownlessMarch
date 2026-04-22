import { resolveSessionSecret } from '../platform/runtime-env';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export const SESSION_COOKIE_NAME = 'thornwrithe_session';

export interface SessionPayload {
  accountId: string;
  characterId: string | null;
}

function getSessionSecret() {
  return new TextEncoder().encode(resolveSessionSecret());
}

async function getJose() {
  return import('jose');
}

export async function issueSessionToken(payload: SessionPayload) {
  const { SignJWT } = await getJose();

  return new SignJWT({
    accountId: payload.accountId,
    characterId: payload.characterId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
  const { jwtVerify } = await getJose();
  const { payload } = await jwtVerify(token, getSessionSecret());

  if (
    typeof payload.accountId !== 'string' ||
    !(typeof payload.characterId === 'string' || payload.characterId === null || payload.characterId === undefined)
  ) {
    throw new Error('Invalid session token');
  }

  return {
    accountId: payload.accountId,
    characterId: typeof payload.characterId === 'string' ? payload.characterId : null,
  };
}

export async function createSessionCookieValue(payload: SessionPayload) {
  const token = await issueSessionToken(payload);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_TTL_SECONDS}`;
}

export async function readSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((part) => part.trim());
  const sessionCookie = cookies.find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionCookie) {
    return null;
  }

  const token = sessionCookie.slice(SESSION_COOKIE_NAME.length + 1);

  try {
    return await verifySessionToken(token);
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_SECRET is required') {
      throw error;
    }

    return null;
  }
}
