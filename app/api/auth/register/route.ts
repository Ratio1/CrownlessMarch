import { registerAccount } from '../../../../src/server/auth/account-service';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid registration payload' }, { status: 400 });
    }

    const payload = body as {
      characterName?: string;
      email?: string;
      password?: string;
    };
    const account = await registerAccount({
      email: payload.email ?? '',
      password: payload.password ?? '',
      characterName: payload.characterName ?? '',
    });

    return Response.json(account, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Account already exists') {
      return Response.json(
        { error: 'Account already exists', code: 'account_exists' },
        { status: 409 }
      );
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'Registration failed' },
      { status: 400 },
    );
  }
}
