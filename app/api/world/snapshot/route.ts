import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/server/auth/session';
import { getWorldSnapshot, WorldServiceError } from '@/server/world/world-service';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  if (!session.characterId) {
    return NextResponse.json({ error: 'Active character required.' }, { status: 409 });
  }

  try {
    const snapshot = await getWorldSnapshot(session.characterId);
    return NextResponse.json({ snapshot });
  } catch (error) {
    if (error instanceof WorldServiceError && error.code === 'CHARACTER_NOT_FOUND') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to load world snapshot.' }, { status: 500 });
  }
}
