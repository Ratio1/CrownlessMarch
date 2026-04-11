import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { keys } from '@/shared/persistence/keys';
import { getCStore } from '@/server/platform/cstore';

const SESSION_COOKIE_NAME = 'thornwrithe_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export interface SessionRecord {
  id: string;
  accountId: string;
  username: string;
  characterId?: string;
  createdAt: string;
  expiresAt: string;
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export async function createSession(accountId: string, username: string): Promise<SessionRecord> {
  const now = Date.now();
  const session: SessionRecord = {
    id: randomUUID(),
    accountId,
    username,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };
  await getCStore().setJson(keys.session(session.id), session);
  return session;
}

export async function getSessionById(sessionId: string): Promise<SessionRecord | null> {
  const session = await getCStore().getJson<SessionRecord>(keys.session(sessionId));
  if (!session) {
    return null;
  }

  const expired = Date.parse(session.expiresAt) <= Date.now();
  if (expired) {
    return null;
  }

  return session;
}

export async function getSessionFromRequest(request: Request): Promise<SessionRecord | null> {
  const sessionId = readCookie(request.headers.get('cookie'), SESSION_COOKIE_NAME);
  if (!sessionId) {
    return null;
  }
  return getSessionById(sessionId);
}

export function setSessionCookie(response: NextResponse, session: SessionRecord): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: session.id,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(session.expiresAt)
  });
}

function readCookie(cookieHeader: string | null, key: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const [name, ...valueParts] = part.trim().split('=');
    if (name === key) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}
