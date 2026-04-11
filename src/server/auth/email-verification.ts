import { randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { keys } from '@/shared/persistence/keys';
import { getCStore } from '@/server/platform/cstore';

const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;

export class VerificationDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerificationDeliveryError';
  }
}

export interface EmailVerificationRecord {
  token: string;
  accountId: string;
  username: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

export function getVerificationEmailFrom(): string | null {
  const configuredFrom = process.env.THORNWRITHE_EMAIL_FROM?.trim() || process.env.RESEND_FROM?.trim();
  return configuredFrom || null;
}

export async function issueEmailVerificationToken(params: {
  accountId: string;
  username: string;
  email: string;
}): Promise<EmailVerificationRecord> {
  const now = Date.now();
  const token = randomBytes(24).toString('base64url');
  const record: EmailVerificationRecord = {
    token,
    accountId: params.accountId,
    username: params.username,
    email: params.email,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + EMAIL_VERIFICATION_TTL_MS).toISOString()
  };

  await getCStore().setJson(keys.emailVerification(token), record);
  return record;
}

export async function consumeEmailVerificationToken(token: string): Promise<EmailVerificationRecord | null> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return null;
  }

  const record = await getCStore().getJson<EmailVerificationRecord>(keys.emailVerification(normalizedToken));
  if (!record) {
    return null;
  }

  await getCStore().setJson(keys.emailVerification(normalizedToken), null);

  if (Date.parse(record.expiresAt) <= Date.now()) {
    return null;
  }

  return record;
}

export async function sendVerificationEmail(params: {
  email: string;
  username: string;
  token: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = getVerificationEmailFrom();

  if (!apiKey || !from) {
    return;
  }

  const appOrigin = (process.env.THORNWRITHE_APP_ORIGIN ?? 'http://localhost:3020').replace(/\/$/, '');
  const verifyUrl = `${appOrigin}/api/auth/verify?token=${encodeURIComponent(params.token)}`;
  const resend = new Resend(apiKey);

  try {
    const result = await resend.emails.send({
      from,
      to: params.email,
      subject: 'Verify your Thornwrithe account',
      text: `Hello ${params.username}, verify your account: ${verifyUrl}`
    });

    if (!result || result.error || !result.data) {
      const detail = result?.error ? ` ${String(result.error)}` : '';
      throw new VerificationDeliveryError(`Verification email delivery failed.${detail}`);
    }
  } catch (error) {
    if (error instanceof VerificationDeliveryError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new VerificationDeliveryError(`Verification email delivery failed. ${message}`);
  }
}
