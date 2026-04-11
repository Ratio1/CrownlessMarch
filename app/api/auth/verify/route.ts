import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AccountServiceError, verifyAccountEmail } from '@/server/auth/account-service';

const verifyBodySchema = z.object({
  token: z.string().trim().min(1)
});

export async function POST(request: Request) {
  try {
    const body = verifyBodySchema.parse(await request.json());
    return await completeVerification(body.token);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid verification payload.' }, { status: 400 });
    }
    if (error instanceof AccountServiceError) {
      if (error.code === 'INVALID_VERIFICATION_TOKEN') {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.code === 'ACCOUNT_NOT_FOUND') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    return NextResponse.json({ error: 'Failed to verify account.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')?.trim() ?? '';
  if (!token) {
    return NextResponse.json({ error: 'Verification token is required.' }, { status: 400 });
  }

  try {
    return await completeVerification(token);
  } catch (error) {
    if (error instanceof AccountServiceError) {
      if (error.code === 'INVALID_VERIFICATION_TOKEN') {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.code === 'ACCOUNT_NOT_FOUND') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Failed to verify account.' }, { status: 500 });
  }
}

async function completeVerification(token: string) {
  const account = await verifyAccountEmail(token);
  return NextResponse.json({ account });
}
