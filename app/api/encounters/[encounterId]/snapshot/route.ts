import { NextResponse } from 'next/server';
import type { AccountRecord } from '@/server/auth/account-service';
import { getSessionFromRequest } from '@/server/auth/session';
import { getCStore } from '@/server/platform/cstore';
import { EncounterServiceError, pollEncounter } from '@/server/combat/encounter-service';
import { keys } from '@/shared/persistence/keys';

interface RouteContext {
  params: Promise<{ encounterId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const characterId = await resolveCharacterId(session);
  if (!characterId) {
    return NextResponse.json({ error: 'Active character required.' }, { status: 409 });
  }

  try {
    const { encounterId } = await context.params;
    const encounter = await pollEncounter(encounterId, characterId);

    return NextResponse.json({ encounter });
  } catch (error) {
    if (error instanceof EncounterServiceError && error.code === 'ENCOUNTER_NOT_FOUND') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to load encounter snapshot.' }, { status: 500 });
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
