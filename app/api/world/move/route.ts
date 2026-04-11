import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/server/auth/session';
import { moveCharacter, WorldServiceError } from '@/server/world/world-service';

const moveBodySchema = z.object({
  direction: z.enum(['north', 'south', 'east', 'west'])
});

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  if (!session.characterId) {
    return NextResponse.json({ error: 'Active character required.' }, { status: 409 });
  }

  try {
    const body = moveBodySchema.parse(await request.json());
    const result = await moveCharacter(session.characterId, body.direction);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid move payload.' }, { status: 400 });
    }
    if (error instanceof WorldServiceError) {
      if (error.code === 'CHARACTER_NOT_FOUND') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.code === 'MOVE_BLOCKED' || error.code === 'OUT_OF_BOUNDS') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    }
    return NextResponse.json({ error: 'Failed to move character.' }, { status: 500 });
  }
}
