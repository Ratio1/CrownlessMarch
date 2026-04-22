import { randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { getRatio1ServerClient } from '../platform/ratio1';
import { resolveThornwritheGameId } from '../platform/runtime-env';
import { isSharedAuthConfigured } from './cstore';

const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;

type GlobalWithVerificationRecords = typeof globalThis & {
  __thornwritheVerificationRecords?: Map<string, EmailVerificationRecord>;
};

function getInMemoryVerificationRecords() {
  const globalWithVerificationRecords = globalThis as GlobalWithVerificationRecords;

  if (!globalWithVerificationRecords.__thornwritheVerificationRecords) {
    globalWithVerificationRecords.__thornwritheVerificationRecords = new Map<string, EmailVerificationRecord>();
  }

  return globalWithVerificationRecords.__thornwritheVerificationRecords;
}

export interface EmailVerificationRecord {
  token: string;
  accountId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

export class VerificationDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerificationDeliveryError';
  }
}

function getVerificationHkey() {
  return `thornwrithe-${resolveThornwritheGameId()}:email-verification`;
}

function getResendToken() {
  return process.env.RESEND_TOKEN?.trim() || process.env.RESEND_API_KEY?.trim() || null;
}

export function getVerificationEmailFrom() {
  return (
    process.env.THORNWRITHE_EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    'onboarding@resend.dev'
  );
}

async function persistVerificationRecord(record: EmailVerificationRecord) {
  if (!isSharedAuthConfigured()) {
    getInMemoryVerificationRecords().set(record.token, record);
    return;
  }

  await getRatio1ServerClient().cstore.hset({
    hkey: getVerificationHkey(),
    key: record.token,
    value: JSON.stringify(record),
  });
}

async function loadVerificationRecord(token: string) {
  if (!isSharedAuthConfigured()) {
    return getInMemoryVerificationRecords().get(token) ?? null;
  }

  const raw = await getRatio1ServerClient().cstore.hget({
    hkey: getVerificationHkey(),
    key: token,
  });

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as EmailVerificationRecord;
  } catch {
    return null;
  }
}

async function clearVerificationRecord(token: string) {
  if (!isSharedAuthConfigured()) {
    getInMemoryVerificationRecords().delete(token);
    return;
  }

  await getRatio1ServerClient().cstore.hset({
    hkey: getVerificationHkey(),
    key: token,
    value: null,
  });
}

export async function issueEmailVerificationToken(input: {
  accountId: string;
  email: string;
}) {
  const now = Date.now();
  const token = randomBytes(24).toString('base64url');
  const record: EmailVerificationRecord = {
    token,
    accountId: input.accountId,
    email: input.email,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + EMAIL_VERIFICATION_TTL_MS).toISOString(),
  };

  await persistVerificationRecord(record);

  return record;
}

export async function consumeEmailVerificationToken(token: string) {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return null;
  }

  const record = await loadVerificationRecord(normalizedToken);
  await clearVerificationRecord(normalizedToken);

  if (!record) {
    return null;
  }

  if (Date.parse(record.expiresAt) <= Date.now()) {
    return null;
  }

  return record;
}

export async function sendVerificationEmail(input: {
  email: string;
  token: string;
  appOrigin: string;
}) {
  const apiKey = getResendToken();

  if (!apiKey) {
    return;
  }

  const resend = new Resend(apiKey);
  const verifyUrl = `${input.appOrigin.replace(/\/$/, '')}/api/auth/verify?token=${encodeURIComponent(input.token)}`;

  try {
    const result = await resend.emails.send({
      from: getVerificationEmailFrom(),
      to: input.email,
      subject: 'Verify your Thornwrithe account',
      text: `Verify your Thornwrithe account by opening ${verifyUrl}`,
    });

    if (!result || result.error || !result.data) {
      throw new VerificationDeliveryError('Verification email delivery failed.');
    }
  } catch (error) {
    if (error instanceof VerificationDeliveryError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new VerificationDeliveryError(`Verification email delivery failed. ${message}`);
  }
}

export function __resetEmailVerificationForTests() {
  getInMemoryVerificationRecords().clear();
}
