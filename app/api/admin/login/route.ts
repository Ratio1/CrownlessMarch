import { createAdminSessionCookieValue, verifyAdminCredentials } from '../../../../src/server/admin/auth';

export async function POST(request: Request) {
  let body: {
    username?: string;
    password?: string;
  };

  try {
    const payload = await request.json();

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return Response.json({ error: 'Invalid admin login payload' }, { status: 400 });
    }

    body = payload as {
      username?: string;
      password?: string;
    };
  } catch {
    return Response.json({ error: 'Invalid admin login payload' }, { status: 400 });
  }

  try {
    const isValid = verifyAdminCredentials(body.username ?? '', body.password ?? '');

    if (!isValid) {
      return Response.json({ error: 'Invalid admin credentials' }, { status: 401 });
    }

    const response = Response.json({ ok: true });
    response.headers.set(
      'set-cookie',
      await createAdminSessionCookieValue({
        username: body.username ?? '',
        role: 'admin',
      }),
    );

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'ADMIN credentials are required') {
      return Response.json({ error: 'Admin configuration invalid' }, { status: 500 });
    }

    if (error instanceof Error && error.message === 'SESSION_SECRET is required') {
      return Response.json({ error: 'Admin session configuration invalid' }, { status: 500 });
    }

    return Response.json({ error: 'Admin login failed' }, { status: 500 });
  }
}
