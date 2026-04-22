import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { PublicUser } from '@ratio1/cstore-auth-ts';
import { createInitialCharacterCheckpoint } from '../platform/r1fs-characters';
import { readRosterEntry, writeRosterEntry, type ThornwritheRosterEntry } from '../platform/cstore-roster';
import { buildInitialCharacterSnapshot } from '../../shared/domain/progression';
import type { AttributeSet, CharacterClass } from '../../shared/domain/types';
import { ensureAuthInitialized, getAuthClient, isSharedAuthConfigured } from './cstore';
import {
  consumeEmailVerificationToken,
  getVerificationEmailFrom,
  issueEmailVerificationToken,
  sendVerificationEmail,
  VerificationDeliveryError,
} from './email-verification';

const { InvalidCredentialsError, UserExistsError } = require('@ratio1/cstore-auth-ts') as typeof import('@ratio1/cstore-auth-ts');

interface LocalAccountRecord {
  accountId: string;
  email: string;
  passwordDigest: string;
  emailVerified: boolean;
  latestCharacterCid: string | null;
  characterName: string | null;
}

type GlobalWithLocalAccounts = typeof globalThis & {
  __thornwritheLocalAccounts?: Map<string, LocalAccountRecord>;
};

interface ThornwritheAccountMetadata {
  accountId: string;
  email: string;
  emailVerified: boolean;
  latestCharacterCid?: string;
  characterName?: string;
}

export interface AccountRecord {
  accountId: string;
  email: string;
  emailVerified: boolean;
  characterId: string | null;
  characterName: string | null;
}

export interface AuthenticatedAccount extends AccountRecord {}

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

function getLocalAccountsStore() {
  const globalWithLocalAccounts = globalThis as GlobalWithLocalAccounts;

  if (!globalWithLocalAccounts.__thornwritheLocalAccounts) {
    globalWithLocalAccounts.__thornwritheLocalAccounts = new Map<string, LocalAccountRecord>();
  }

  return globalWithLocalAccounts.__thornwritheLocalAccounts;
}

function nowIso() {
  return new Date().toISOString();
}

function createRosterEntry(input: {
  accountId: string;
  email: string;
  characterName: string;
  latestCharacterCid: string;
  persistRevision: number;
  registeredAt?: string;
  lastPersistedAt?: string | null;
}): ThornwritheRosterEntry {
  return {
    version: 1,
    accountId: input.accountId,
    email: input.email,
    characterName: input.characterName,
    latestCharacterCid: input.latestCharacterCid,
    persistRevision: input.persistRevision,
    registeredAt: input.registeredAt ?? nowIso(),
    lastPersistedAt: input.lastPersistedAt ?? nowIso(),
  };
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');

  return `${salt}:${hash}`;
}

function verifyPassword(password: string, passwordDigest: string) {
  const [salt, storedHash] = passwordDigest.split(':');

  if (!salt || !storedHash) {
    return false;
  }

  const derivedHash = scryptSync(password, salt, 64);
  const storedHashBytes = Buffer.from(storedHash, 'hex');

  if (derivedHash.length !== storedHashBytes.length) {
    return false;
  }

  return timingSafeEqual(derivedHash, storedHashBytes);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeCharacterName(characterName: string) {
  return characterName.trim();
}

function emailToUsername(email: string) {
  return createHash('sha256').update(email).digest('hex');
}

function isSharedAccountMetadata(value: unknown): value is ThornwritheAccountMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.accountId === 'string' &&
    typeof record.email === 'string' &&
    typeof record.emailVerified === 'boolean'
  );
}

function buildAccountRecord(input: {
  accountId: string;
  email: string;
  emailVerified: boolean;
  characterId?: string | null;
  characterName?: string | null;
}): AccountRecord {
  return {
    accountId: input.accountId,
    email: input.email,
    emailVerified: input.emailVerified,
    characterId: input.characterId ?? null,
    characterName: input.characterName ?? null,
  };
}

function validateRegisterInput(input: { email: string; password: string }) {
  if (!normalizeEmail(input.email).includes('@')) {
    throw new AccountServiceError('INVALID_INPUT', 'Email must be valid.');
  }

  if (input.password.length < 8) {
    throw new AccountServiceError('INVALID_INPUT', 'Password must be at least 8 characters.');
  }
}

function validateCharacterNameInput(name: string) {
  const normalized = normalizeCharacterName(name);

  if (normalized.length < 3 || normalized.length > 24) {
    throw new AccountServiceError('INVALID_INPUT', 'Character name must be between 3 and 24 characters.');
  }

  return normalized;
}

function canDeliverOrExposeVerificationToken(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.THORNWRITHE_EXPOSE_VERIFICATION_TOKEN === '1' ||
    Boolean(process.env.RESEND_TOKEN?.trim() || process.env.RESEND_API_KEY?.trim())
  );
}

async function resolveSharedRosterEntry(
  email: string,
  metadata: ThornwritheAccountMetadata
): Promise<ThornwritheRosterEntry | null> {
  const rosterEntry = await readRosterEntry(email);

  if (rosterEntry) {
    return rosterEntry;
  }

  if (!metadata.latestCharacterCid || !metadata.characterName) {
    return null;
  }

  const fallback = createRosterEntry({
    accountId: email,
    email,
    characterName: metadata.characterName,
    latestCharacterCid: metadata.latestCharacterCid,
    persistRevision: 0,
    lastPersistedAt: null,
  });

  await writeRosterEntry(email, fallback);

  return fallback;
}

async function mapSharedUser(email: string, user: PublicUser<unknown> | null): Promise<AuthenticatedAccount | null> {
  if (!user || !isSharedAccountMetadata(user.metadata)) {
    return null;
  }

  const rosterEntry = await resolveSharedRosterEntry(email, user.metadata);

  return buildAccountRecord({
    accountId: email,
    email,
    emailVerified: user.metadata.emailVerified,
    characterId: rosterEntry?.latestCharacterCid ?? user.metadata.latestCharacterCid ?? null,
    characterName: rosterEntry?.characterName ?? user.metadata.characterName ?? null,
  });
}

async function authenticatePendingSharedAccount(email: string, password: string, metadata: ThornwritheAccountMetadata) {
  const client = getAuthClient();

  try {
    await client.simple.authenticate(emailToUsername(email), password);
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      throw new AccountServiceError('ACCOUNT_EXISTS', 'Account already exists.');
    }

    throw error;
  }

  return buildAccountRecord({
    accountId: metadata.accountId,
    email,
    emailVerified: metadata.emailVerified,
    characterId: metadata.latestCharacterCid ?? null,
    characterName: metadata.characterName ?? null,
  });
}

export async function registerAccount(input: {
  email: string;
  password: string;
  appOrigin: string;
}): Promise<{ account: AccountRecord; verificationToken: string }> {
  validateRegisterInput(input);

  if (!canDeliverOrExposeVerificationToken()) {
    throw new AccountServiceError(
      'VERIFICATION_UNAVAILABLE',
      'Verification delivery is unavailable. Configure RESEND_TOKEN or enable token exposure.'
    );
  }

  const email = normalizeEmail(input.email);
  let account: AccountRecord;

  if (isSharedAuthConfigured()) {
    const client = getAuthClient();
    const username = emailToUsername(email);

    await ensureAuthInitialized(client);

    const existingUser = await client.simple.getUser<ThornwritheAccountMetadata>(username);

    if (existingUser && isSharedAccountMetadata(existingUser.metadata)) {
      if (existingUser.metadata.emailVerified) {
        throw new AccountServiceError('ACCOUNT_EXISTS', 'Account already exists.');
      }

      account = await authenticatePendingSharedAccount(email, input.password, existingUser.metadata);
    } else {
      const accountId = email;

      try {
        await client.simple.createUser<ThornwritheAccountMetadata>(username, input.password, {
          metadata: {
            accountId,
            email,
            emailVerified: false,
          },
        });
      } catch (error) {
        if (error instanceof UserExistsError) {
          throw new AccountServiceError('ACCOUNT_EXISTS', 'Account already exists.');
        }

        throw error;
      }

      account = buildAccountRecord({
        accountId,
        email,
        emailVerified: false,
      });
    }
  } else {
    const accountsByEmail = getLocalAccountsStore();
    const existingAccount = accountsByEmail.get(email);

    if (existingAccount) {
      if (existingAccount.emailVerified || !verifyPassword(input.password, existingAccount.passwordDigest)) {
        throw new AccountServiceError('ACCOUNT_EXISTS', 'Account already exists.');
      }

      account = buildAccountRecord({
        accountId: existingAccount.accountId,
        email,
        emailVerified: false,
        characterId: existingAccount.latestCharacterCid,
        characterName: existingAccount.characterName,
      });
    } else {
      const localAccount: LocalAccountRecord = {
        accountId: email,
        email,
        passwordDigest: hashPassword(input.password),
        emailVerified: false,
        latestCharacterCid: null,
        characterName: null,
      };
      accountsByEmail.set(email, localAccount);

      account = buildAccountRecord({
        accountId: localAccount.accountId,
        email,
        emailVerified: false,
      });
    }
  }

  const verification = await issueEmailVerificationToken({
    accountId: account.accountId,
    email,
  });

  try {
    await sendVerificationEmail({
      email,
      token: verification.token,
      appOrigin: input.appOrigin,
    });
  } catch (error) {
    if (error instanceof VerificationDeliveryError) {
      throw new AccountServiceError(
        'VERIFICATION_UNAVAILABLE',
        'Failed to deliver verification email. Please retry registration.'
      );
    }

    throw error;
  }

  return {
    account,
    verificationToken: verification.token,
  };
}

export async function verifyAccountEmail(token: string): Promise<AccountRecord> {
  const verification = await consumeEmailVerificationToken(token);

  if (!verification) {
    throw new AccountServiceError('INVALID_VERIFICATION_TOKEN', 'Verification token is invalid or expired.');
  }

  const email = normalizeEmail(verification.email);

  if (isSharedAuthConfigured()) {
    const client = getAuthClient();
    const username = emailToUsername(email);

    await ensureAuthInitialized(client);

    const user = await client.simple.getUser<ThornwritheAccountMetadata>(username);

    if (!user || !isSharedAccountMetadata(user.metadata)) {
      throw new AccountServiceError('ACCOUNT_NOT_FOUND', 'Account record is missing.');
    }

    await client.simple.updateUser<ThornwritheAccountMetadata>(username, {
      metadata: {
        ...user.metadata,
        emailVerified: true,
      },
    });

    const rosterEntry = await resolveSharedRosterEntry(email, {
      ...user.metadata,
      emailVerified: true,
    });

    return buildAccountRecord({
      accountId: user.metadata.accountId,
      email,
      emailVerified: true,
      characterId: rosterEntry?.latestCharacterCid ?? user.metadata.latestCharacterCid ?? null,
      characterName: rosterEntry?.characterName ?? user.metadata.characterName ?? null,
    });
  }

  const accountsByEmail = getLocalAccountsStore();
  const account = accountsByEmail.get(email);

  if (!account) {
    throw new AccountServiceError('ACCOUNT_NOT_FOUND', 'Account record is missing.');
  }

  account.emailVerified = true;

  return buildAccountRecord({
    accountId: account.accountId,
    email,
    emailVerified: true,
    characterId: account.latestCharacterCid,
    characterName: account.characterName,
  });
}

export async function authenticateAccount(input: {
  email: string;
  password: string;
}): Promise<AuthenticatedAccount | null> {
  const email = normalizeEmail(input.email);

  if (isSharedAuthConfigured()) {
    const client = getAuthClient();

    await ensureAuthInitialized(client);

    try {
      const user = await client.simple.authenticate<ThornwritheAccountMetadata>(emailToUsername(email), input.password);
      const mapped = await mapSharedUser(email, user);

      if (!mapped) {
        throw new AccountServiceError('ACCOUNT_NOT_FOUND', 'Account record is missing.');
      }

      if (!mapped.emailVerified) {
        throw new AccountServiceError('EMAIL_NOT_VERIFIED', 'Verify your email before logging in.');
      }

      return mapped;
    } catch (error) {
      if (error instanceof AccountServiceError) {
        throw error;
      }

      if (error instanceof InvalidCredentialsError) {
        return null;
      }

      throw error;
    }
  }

  const accountsByEmail = getLocalAccountsStore();
  const account = accountsByEmail.get(email);

  if (!account || !verifyPassword(input.password, account.passwordDigest)) {
    return null;
  }

  if (!account.emailVerified) {
    throw new AccountServiceError('EMAIL_NOT_VERIFIED', 'Verify your email before logging in.');
  }

  return buildAccountRecord({
    accountId: account.accountId,
    email,
    emailVerified: true,
    characterId: account.latestCharacterCid,
    characterName: account.characterName,
  });
}

export async function createCharacterForAccount(input: {
  accountId: string;
  characterName: string;
  classId: CharacterClass;
  attributes: AttributeSet;
}) {
  const account = await getAccountById(input.accountId);

  if (!account || !account.emailVerified) {
    throw new AccountServiceError('ACCOUNT_NOT_FOUND', 'Account record is missing.');
  }

  if (account.characterId) {
    throw new AccountServiceError('ACCOUNT_EXISTS', 'This account already has a character.');
  }

  const characterName = validateCharacterNameInput(input.characterName);
  const snapshot = buildInitialCharacterSnapshot({
    name: characterName,
    classId: input.classId,
    attributes: input.attributes,
    inventory:
      input.classId === 'wizard'
        ? ['ash-staff', 'field-rations', 'health-potion']
        : ['rusted-sword', 'field-rations', 'health-potion'],
    equipment:
      input.classId === 'wizard'
        ? { implement: 'ash-staff', armor: 'travel-cloak' }
        : { weapon: 'rusted-sword', armor: 'patchwork-leather' },
    currency: 7,
    activeQuestIds: ['survey-the-briar-edge'],
  });
  const checkpoint = await createInitialCharacterCheckpoint({
    characterName,
    snapshot: snapshot as unknown as Record<string, unknown>,
  });
  const existingRoster = await readRosterEntry(input.accountId);
  const rosterEntry = createRosterEntry({
    accountId: input.accountId,
    email: account.email,
    characterName,
    latestCharacterCid: checkpoint.cid,
    persistRevision: checkpoint.persist_revision,
    registeredAt: existingRoster?.registeredAt,
    lastPersistedAt: null,
  });

  await writeRosterEntry(input.accountId, rosterEntry);

  if (isSharedAuthConfigured()) {
    const client = getAuthClient();
    const username = emailToUsername(account.email);

    await ensureAuthInitialized(client);

    const user = await client.simple.getUser<ThornwritheAccountMetadata>(username);

    if (user && isSharedAccountMetadata(user.metadata)) {
      await client.simple.updateUser<ThornwritheAccountMetadata>(username, {
        metadata: {
          ...user.metadata,
          latestCharacterCid: checkpoint.cid,
          characterName,
        },
      });
    }
  } else {
    const accountsByEmail = getLocalAccountsStore();
    const localAccount = accountsByEmail.get(account.email);

    if (localAccount) {
      localAccount.latestCharacterCid = checkpoint.cid;
      localAccount.characterName = characterName;
    }
  }

  return buildAccountRecord({
    accountId: input.accountId,
    email: account.email,
    emailVerified: true,
    characterId: checkpoint.cid,
    characterName,
  });
}

export async function getAccountById(accountId: string): Promise<AuthenticatedAccount | null> {
  const email = normalizeEmail(accountId);

  if (isSharedAuthConfigured()) {
    const client = getAuthClient();

    await ensureAuthInitialized(client);

    const user = await client.simple.getUser<ThornwritheAccountMetadata>(emailToUsername(email));
    return await mapSharedUser(email, user);
  }

  const accountsByEmail = getLocalAccountsStore();
  const account = accountsByEmail.get(email);

  if (!account) {
    return null;
  }

  return buildAccountRecord({
    accountId: account.accountId,
    email,
    emailVerified: account.emailVerified,
    characterId: account.latestCharacterCid,
    characterName: account.characterName,
  });
}

export function __resetAccountsForTests() {
  getLocalAccountsStore().clear();
}

export function __getVerificationEmailFromForTests() {
  return getVerificationEmailFrom();
}
