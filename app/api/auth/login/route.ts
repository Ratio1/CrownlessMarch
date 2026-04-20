import { authenticateAccount } from '../../../../src/server/auth/account-service';
import { createSessionCookieValue } from '../../../../src/server/auth/session';

export async function POST(request: Request) {
  let body: {
    email?: string;
    password?: string;
  };

  try {
    const payload = await request.json();

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return Response.json({ error: 'Invalid login payload' }, { status: 400 });
    }

    body = payload as {
      email?: string;
      password?: string;
    };
  } catch {
    return Response.json({ error: 'Invalid login payload' }, { status: 400 });
  }

  try {
    const account = await authenticateAccount({
      email: body.email ?? '',
      password: body.password ?? '',
    });

    if (!account) {
      return Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const response = Response.json(account);

    response.headers.set('set-cookie', await createSessionCookieValue(account));

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'SESSION_SECRET is required') {
      return Response.json({ error: 'Session configuration invalid' }, { status: 500 });
    }

    return Response.json({ error: 'Login failed' }, { status: 500 });
  }
}
