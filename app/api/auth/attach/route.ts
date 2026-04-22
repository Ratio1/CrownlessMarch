import { issueAttachToken } from '../../../../src/server/auth/attach-token';
import { getAccountById } from '../../../../src/server/auth/account-service';
import { readSessionFromRequest } from '../../../../src/server/auth/session';

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);

    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const account = await getAccountById(session.accountId);

    if (!account) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!account.characterId) {
      return Response.json({ error: 'Character creation required' }, { status: 409 });
    }

    const { token } = await issueAttachToken({
      accountId: account.accountId,
      characterId: account.characterId,
    });

    return Response.json({ attachToken: token });
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_SECRET is required') {
      return Response.json({ error: 'Session configuration invalid' }, { status: 500 });
    }

    if (error instanceof Error && error.message === 'ATTACH_TOKEN_SECRET is required') {
      return Response.json({ error: 'Attach token configuration invalid' }, { status: 500 });
    }

    return Response.json({ error: 'Attach token minting failed' }, { status: 500 });
  }
}
