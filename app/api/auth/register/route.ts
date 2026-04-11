import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AccountServiceError, registerAccount } from '@/server/auth/account-service';

const registerBodySchema = z.object({
  username: z.string().trim().min(3).max(64),
  email: z.string().trim().email(),
  password: z.string().min(8).max(200)
});

export async function POST(request: Request) {
  try {
    const body = registerBodySchema.parse(await request.json());
    const result = await registerAccount(body);

    const payload: {
      account: typeof result.account;
      verificationToken?: string;
    } = { account: result.account };

    if (process.env.NODE_ENV === 'test' || process.env.THORNWRITHE_EXPOSE_VERIFICATION_TOKEN === '1') {
      payload.verificationToken = result.verificationToken;
    }

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid registration payload.' }, { status: 400 });
    }
    if (error instanceof AccountServiceError) {
      if (error.code === 'ACCOUNT_EXISTS') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.code === 'INVALID_INPUT') {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Failed to register account.' }, { status: 500 });
  }
}
