import { NextResponse } from 'next/server';
import type { AccountRecord } from '@/server/auth/account-service';
import { getSessionFromRequest } from '@/server/auth/session';
import { getCStore } from '@/server/platform/cstore';
import { getWorldSnapshot, WorldServiceError } from '@/server/world/world-service';
import { keys } from '@/shared/persistence/keys';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const characterId = await resolveCharacterId(session);
  if (!characterId) {
    return NextResponse.json({ error: 'Active character required.' }, { status: 409 });
  }

  try {
    const snapshot = await getWorldSnapshot(characterId);
    return NextResponse.json({ snapshot });
  } catch (error) {
    if (error instanceof WorldServiceError && error.code === 'CHARACTER_NOT_FOUND') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to load world snapshot.' }, { status: 500 });
  }
}

async function resolveCharacterId(session: {
  id: string;
  accountId: string;
  characterId?: string;
}) {
  if (session.characterId) {
    return session.characterId;
  }

  const account = await getCStore().getJson<AccountRecord>(keys.account(session.accountId));
  if (!account?.activeCharacterId) {
    return null;
  }

  await getCStore().setJson(keys.session(session.id), {
    ...session,
    characterId: account.activeCharacterId
  });
  return account.activeCharacterId;
}
