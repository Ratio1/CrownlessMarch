import { randomUUID } from 'node:crypto';
import { CStoreAuth, InvalidCredentialsError, InvalidUsernameError, UserExistsError } from '@ratio1/cstore-auth-ts';
import { keys } from '@/shared/persistence/keys';
import { getCStore } from '@/server/platform/cstore';
import {
  consumeEmailVerificationToken,
  issueEmailVerificationToken,
  sendVerificationEmail
} from '@/server/auth/email-verification';

const AUTH_HKEY = process.env.THORNWRITHE_AUTH_HKEY ?? 'thornwrithe:auth:users';
const AUTH_SECRET = process.env.R1EN_CSTORE_AUTH_SECRET ?? 'thornwrithe-dev-secret';
const FALLBACK_BOOTSTRAP_PASSWORD = 'thornwrithe-bootstrap-admin';

export interface AccountRecord {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AccountMetadata {
  accountId: string;
  email: string;
  emailVerified: boolean;
}

export class AccountServiceError extends Error {
  constructor(
    readonly code:
      | 'INVALID_INPUT'
      | 'ACCOUNT_EXISTS'
      | 'INVALID_CREDENTIALS'
      | 'EMAIL_NOT_VERIFIED'
      | 'INVALID_VERIFICATION_TOKEN'
      | 'ACCOUNT_NOT_FOUND'
      | 'VERIFICATION_UNAVAILABLE',
    message: string
  ) {
    super(message);
    this.name = 'AccountServiceError';
  }
}

let authClient: CStoreAuth | null = null;

function getAuthClient() {
  if (!process.env.R1EN_CSTORE_AUTH_BOOTSTRAP_ADMIN_PWD) {
    process.env.R1EN_CSTORE_AUTH_BOOTSTRAP_ADMIN_PWD = FALLBACK_BOOTSTRAP_PASSWORD;
  }

  if (!authClient) {
    authClient = new CStoreAuth({
      hkey: AUTH_HKEY,
      secret: AUTH_SECRET,
      client: getCStore()
    });
  }

  return authClient;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateRegisterInput(input: { username: string; email: string; password: string }) {
  if (input.username.trim().length < 3) {
    throw new AccountServiceError('INVALID_INPUT', 'Username must be at least 3 characters.');
  }
  if (!normalizeEmail(input.email).includes('@')) {
    throw new AccountServiceError('INVALID_INPUT', 'Email must be valid.');
  }
  if (input.password.length < 8) {
    throw new AccountServiceError('INVALID_INPUT', 'Password must be at least 8 characters.');
  }
}

function canDeliverOrExposeVerificationToken(): boolean {
  const exposeVerificationToken =
    process.env.NODE_ENV === 'test' || process.env.THORNWRITHE_EXPOSE_VERIFICATION_TOKEN === '1';
  const emailDeliveryConfigured = Boolean(process.env.RESEND_API_KEY && process.env.THORNWRITHE_EMAIL_FROM);

  return exposeVerificationToken || emailDeliveryConfigured;
}

export async function registerAccount(input: {
  username: string;
  email: string;
  password: string;
}): Promise<{ account: AccountRecord; verificationToken: string }> {
  validateRegisterInput(input);
  if (!canDeliverOrExposeVerificationToken()) {
    throw new AccountServiceError(
      'VERIFICATION_UNAVAILABLE',
      'Verification delivery is unavailable. Configure email delivery or token exposure.'
    );
  }

  const auth = getAuthClient();
  await auth.simple.init();

  const accountId = randomUUID();
  const nowIso = new Date().toISOString();
  const email = normalizeEmail(input.email);

  try {
    const user = await auth.simple.createUser<AccountMetadata>(input.username, input.password, {
      metadata: {
        accountId,
        email,
        emailVerified: false
      }
    });

    const account: AccountRecord = {
      id: accountId,
      username: user.username,
      email,
      emailVerified: false,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await getCStore().setJson(keys.account(account.id), account);

    const verification = await issueEmailVerificationToken({
      accountId: account.id,
      username: account.username,
      email: account.email
    });

    await sendVerificationEmail({
      email: account.email,
      username: account.username,
      token: verification.token
    });

    return {
      account,
      verificationToken: verification.token
    };
  } catch (error) {
    if (error instanceof UserExistsError) {
      throw new AccountServiceError('ACCOUNT_EXISTS', 'Username is already taken.');
    }
    if (error instanceof InvalidUsernameError) {
      throw new AccountServiceError('INVALID_INPUT', error.message);
    }
    throw error;
  }
}

export async function verifyAccountEmail(token: string): Promise<AccountRecord> {
  const auth = getAuthClient();
  await auth.simple.init();

  const verification = await consumeEmailVerificationToken(token);
  if (!verification) {
    throw new AccountServiceError('INVALID_VERIFICATION_TOKEN', 'Verification token is invalid or expired.');
  }

  const account = await getCStore().getJson<AccountRecord>(keys.account(verification.accountId));
  if (!account) {
    throw new AccountServiceError('ACCOUNT_NOT_FOUND', 'Account record is missing.');
  }

  const updatedAccount: AccountRecord = {
    ...account,
    emailVerified: true,
    updatedAt: new Date().toISOString()
  };
  await getCStore().setJson(keys.account(updatedAccount.id), updatedAccount);

  const user = await auth.simple.getUser<AccountMetadata>(verification.username);
  if (user) {
    await auth.simple.updateUser<AccountMetadata>(verification.username, {
      metadata: {
        accountId: verification.accountId,
        email: verification.email,
        emailVerified: true
      }
    });
  }

  return updatedAccount;
}

export async function loginAccount(input: {
  username: string;
  password: string;
}): Promise<{ account: AccountRecord; accountId: string; username: string }> {
  const auth = getAuthClient();
  await auth.simple.init();

  try {
    const user = await auth.simple.authenticate<AccountMetadata>(input.username, input.password);
    const metadata = user.metadata;

    if (!metadata || !metadata.accountId) {
      throw new AccountServiceError('ACCOUNT_NOT_FOUND', 'Account metadata is missing.');
    }
    if (!metadata.emailVerified) {
      throw new AccountServiceError('EMAIL_NOT_VERIFIED', 'Email verification is required before login.');
    }

    const existing = await getCStore().getJson<AccountRecord>(keys.account(metadata.accountId));
    const account: AccountRecord = existing ?? {
      id: metadata.accountId,
      username: user.username,
      email: metadata.email,
      emailVerified: metadata.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    if (!existing) {
      await getCStore().setJson(keys.account(account.id), account);
    }

    return {
      account,
      accountId: metadata.accountId,
      username: user.username
    };
  } catch (error) {
    if (error instanceof AccountServiceError) {
      throw error;
    }
    if (error instanceof InvalidUsernameError) {
      throw new AccountServiceError('INVALID_INPUT', error.message);
    }
    if (error instanceof InvalidCredentialsError) {
      throw new AccountServiceError('INVALID_CREDENTIALS', 'Invalid username or password.');
    }
    throw error;
  }
}
