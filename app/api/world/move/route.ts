import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { AccountRecord } from '@/server/auth/account-service';
import { getSessionFromRequest } from '@/server/auth/session';
import { getCStore } from '@/server/platform/cstore';
import { moveCharacter, WorldServiceError } from '@/server/world/world-service';
import { keys } from '@/shared/persistence/keys';

const moveBodySchema = z.object({
  direction: z.enum(['north', 'south', 'east', 'west'])
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const characterId = await resolveCharacterId(session);
  if (!characterId) {
    return NextResponse.json({ error: 'Active character required.' }, { status: 409 });
  }

  try {
    const body = moveBodySchema.parse(await request.json());
    const result = await moveCharacter(characterId, body.direction);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid move payload.' }, { status: 400 });
    }
    if (error instanceof WorldServiceError) {
      if (error.code === 'CHARACTER_NOT_FOUND') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.code === 'MOVE_BLOCKED' || error.code === 'OUT_OF_BOUNDS' || error.code === 'ENCOUNTER_ACTIVE') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    }
    return NextResponse.json({ error: 'Failed to move character.' }, { status: 500 });
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
