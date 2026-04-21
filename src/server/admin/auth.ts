import { timingSafeEqual } from 'node:crypto';
import { resolveSessionSecret } from '../platform/runtime-env';

const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

export const ADMIN_SESSION_COOKIE_NAME = 'thornwrithe_admin_session';

export interface AdminCredentials {
  username: string;
  password: string;
}

export interface AdminSessionPayload {
  username: string;
  role: 'admin';
}

function readNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();

    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function getAdminSessionSecret() {
  return new TextEncoder().encode(resolveSessionSecret());
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}

async function getJose() {
  return import('jose');
}

export function resolveAdminCredentials(env: NodeJS.ProcessEnv = process.env): AdminCredentials | null {
  const primaryUsername = readNonEmpty(env.ADMIN_USER);
  const primaryPassword = readNonEmpty(env.ADMIN_PASS);

  if (primaryUsername && primaryPassword) {
    return {
      username: primaryUsername,
      password: primaryPassword,
    };
  }

  const fallbackUsername = readNonEmpty(env.THORNWRITHE_ADMIN_USER);
  const fallbackPassword = readNonEmpty(env.THORNWRITHE_ADMIN_PASS);

  if (fallbackUsername && fallbackPassword) {
    return {
      username: fallbackUsername,
      password: fallbackPassword,
    };
  }

  return null;
}

export function verifyAdminCredentials(username: string, password: string, env: NodeJS.ProcessEnv = process.env) {
  const credentials = resolveAdminCredentials(env);

  if (!credentials) {
    throw new Error('ADMIN credentials are required');
  }

  return safeEqual(username, credentials.username) && safeEqual(password, credentials.password);
}

export async function issueAdminSessionToken(payload: AdminSessionPayload) {
  const { SignJWT } = await getJose();

  return await new SignJWT({
    username: payload.username,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_TTL_SECONDS}s`)
    .sign(getAdminSessionSecret());
}

export async function verifyAdminSessionToken(token: string): Promise<AdminSessionPayload> {
  const { jwtVerify } = await getJose();
  const { payload } = await jwtVerify(token, getAdminSessionSecret());

  if (typeof payload.username !== 'string' || payload.role !== 'admin') {
    throw new Error('Invalid admin session token');
  }

  return {
    username: payload.username,
    role: 'admin',
  };
}

export async function createAdminSessionCookieValue(payload: AdminSessionPayload) {
  const token = await issueAdminSessionToken(payload);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  return `${ADMIN_SESSION_COOKIE_NAME}=${token}; Path=/admin; HttpOnly; SameSite=Lax${secure}; Max-Age=${ADMIN_SESSION_TTL_SECONDS}`;
}

export async function readAdminSessionFromRequest(request: Request): Promise<AdminSessionPayload | null> {
  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((part) => part.trim());
  const adminCookie = cookies.find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=`));

  if (!adminCookie) {
    return null;
  }

  try {
    return await verifyAdminSessionToken(adminCookie.slice(ADMIN_SESSION_COOKIE_NAME.length + 1));
  } catch {
    return null;
  }
}
