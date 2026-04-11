import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AccountServiceError, loginAccount } from '@/server/auth/account-service';
import { createSession, setSessionCookie } from '@/server/auth/session';

const loginBodySchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(200)
});

export async function POST(request: Request) {
  try {
    const body = loginBodySchema.parse(await request.json());
    const login = await loginAccount(body);
    const session = await createSession(login.accountId, login.username);

    const response = NextResponse.json({ account: login.account });
    setSessionCookie(response, session);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid login payload.' }, { status: 400 });
    }
    if (error instanceof AccountServiceError) {
      if (error.code === 'INVALID_CREDENTIALS') {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.code === 'ACCOUNT_NOT_FOUND') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Failed to login.' }, { status: 500 });
  }
}
