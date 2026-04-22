import { AccountServiceError, verifyAccountEmail } from '../../../../src/server/auth/account-service';

function redirectTo(requestUrl: string, status: 'verified' | 'failed', error?: string) {
  const params = new URLSearchParams({ verification: status });

  if (error) {
    params.set('verification_error', error);
  }

  return Response.redirect(new URL(`/?${params.toString()}`, requestUrl), 302);
}

export async function POST(request: Request) {
  let body: { token?: string };

  try {
    const payload = await request.json();

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return Response.json({ error: 'Invalid verification payload' }, { status: 400 });
    }

    body = payload as { token?: string };
  } catch {
    return Response.json({ error: 'Invalid verification payload' }, { status: 400 });
  }

  try {
    const account = await verifyAccountEmail(body.token ?? '');
    return Response.json({ account });
  } catch (error) {
    if (
      error instanceof AccountServiceError &&
      (error.code === 'INVALID_VERIFICATION_TOKEN' || error.code === 'ACCOUNT_NOT_FOUND')
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ error: 'Failed to verify account.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')?.trim() ?? '';

  if (!token) {
    return redirectTo(request.url, 'failed', 'Verification token is required.');
  }

  try {
    await verifyAccountEmail(token);
    return redirectTo(request.url, 'verified');
  } catch (error) {
    if (error instanceof AccountServiceError) {
      return redirectTo(request.url, 'failed', error.message);
    }

    return redirectTo(request.url, 'failed', 'Failed to verify account.');
  }
}
