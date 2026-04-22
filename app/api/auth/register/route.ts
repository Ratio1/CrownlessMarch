import { AccountServiceError, registerAccount } from '../../../../src/server/auth/account-service';
import { resolveRequestOrigin } from '../../../../src/server/http/request-origin';

export async function POST(request: Request) {
  let body: {
    email?: string;
    password?: string;
  };

  try {
    const payload = await request.json();

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return Response.json({ error: 'Invalid registration payload' }, { status: 400 });
    }

    body = payload as {
      email?: string;
      password?: string;
    };
  } catch {
    return Response.json({ error: 'Invalid registration payload' }, { status: 400 });
  }

  try {
    const origin = resolveRequestOrigin(request);
    const result = await registerAccount({
      email: body.email ?? '',
      password: body.password ?? '',
      appOrigin: origin,
    });

    return Response.json(
      {
        account: result.account,
        verificationToken:
          process.env.NODE_ENV === 'test' || process.env.THORNWRITHE_EXPOSE_VERIFICATION_TOKEN === '1'
            ? result.verificationToken
            : undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AccountServiceError) {
      if (error.code === 'ACCOUNT_EXISTS') {
        return Response.json({ error: error.message, code: 'account_exists' }, { status: 409 });
      }

      if (error.code === 'INVALID_INPUT') {
        return Response.json({ error: error.message }, { status: 400 });
      }

      if (error.code === 'VERIFICATION_UNAVAILABLE') {
        return Response.json({ error: error.message }, { status: 503 });
      }
    }

    return Response.json({ error: 'Registration failed' }, { status: 500 });
  }
}
