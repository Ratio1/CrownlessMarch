import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { AccountRecord } from '@/server/auth/account-service';
import { getSessionFromRequest } from '@/server/auth/session';
import { getCStore } from '@/server/platform/cstore';
import { EncounterServiceError, queueEncounterOverride } from '@/server/combat/encounter-service';
import { keys } from '@/shared/persistence/keys';

interface RouteContext {
  params: Promise<{ encounterId: string }>;
}

const overrideBodySchema = z.object({
  command: z.string().trim().min(1).max(120)
});

export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const characterId = await resolveCharacterId(session);
  if (!characterId) {
    return NextResponse.json({ error: 'Active character required.' }, { status: 409 });
  }

  try {
    const body = overrideBodySchema.parse(await request.json());
    const { encounterId } = await context.params;
    const encounter = await queueEncounterOverride(encounterId, {
      characterId,
      command: body.command
    });

    return NextResponse.json({ encounter }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid override payload.' }, { status: 400 });
    }
    if (error instanceof EncounterServiceError) {
      if (error.code === 'ENCOUNTER_NOT_FOUND') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.code === 'INVALID_OVERRIDE') {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Failed to queue encounter override.' }, { status: 500 });
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
