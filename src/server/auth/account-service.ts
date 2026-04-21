import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { PublicUser } from '@ratio1/cstore-auth-ts';
import { createInitialCharacterCheckpoint } from '../platform/r1fs-characters';
import { ensureAuthInitialized, getAuthClient, isSharedAuthConfigured } from './cstore';

const { InvalidCredentialsError, UserExistsError } = require('@ratio1/cstore-auth-ts') as typeof import('@ratio1/cstore-auth-ts');

interface AccountRecord {
  email: string;
  passwordDigest: string;
  characterId: string;
  characterName: string;
}

export interface AuthenticatedAccount {
  accountId: string;
  characterId: string;
}

const accountsByEmail = new Map<string, AccountRecord>();

interface ThornwritheAccountMetadata {
  characterId: string;
  characterName: string;
  email: string;
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
    typeof record.email === 'string' &&
    typeof record.characterId === 'string' &&
    typeof record.characterName === 'string'
  );
}

function mapSharedUser(email: string, user: PublicUser<unknown> | null): AuthenticatedAccount | null {
  if (!user || !isSharedAccountMetadata(user.metadata)) {
    return null;
  }

  return {
    accountId: email,
    characterId: user.metadata.characterId,
  };
}

export async function registerAccount(input: {
  email: string;
  password: string;
  characterName: string;
}): Promise<AuthenticatedAccount> {
  const email = normalizeEmail(input.email);
  const characterName = normalizeCharacterName(input.characterName);

  if (!email || !input.password || !characterName) {
    throw new Error('Invalid registration payload');
  }

  if (isSharedAuthConfigured()) {
    const client = getAuthClient();
    const username = emailToUsername(email);

    await ensureAuthInitialized(client);

    if (await client.simple.getUser(username)) {
      throw new Error('Account already exists');
    }

    const checkpoint = await createInitialCharacterCheckpoint({
      characterName,
    });

    try {
      await client.simple.createUser<ThornwritheAccountMetadata>(username, input.password, {
        metadata: {
          email,
          characterId: checkpoint.cid,
          characterName,
        },
      });
    } catch (error) {
      if (error instanceof UserExistsError) {
        throw new Error('Account already exists');
      }

      throw error;
    }

    return {
      accountId: email,
      characterId: checkpoint.cid,
    };
  }

  if (accountsByEmail.has(email)) {
    throw new Error('Account already exists');
  }

  const account: AccountRecord = {
    email,
    passwordDigest: hashPassword(input.password),
    characterId: emailToUsername(`${email}:character`),
    characterName,
  };

  accountsByEmail.set(email, account);

  return {
    accountId: account.email,
    characterId: account.characterId,
  };
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
      return mapSharedUser(email, user);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return null;
      }

      throw error;
    }
  }

  const account = accountsByEmail.get(email);

  if (!account || !verifyPassword(input.password, account.passwordDigest)) {
    return null;
  }

  return {
    accountId: account.email,
    characterId: account.characterId,
  };
}

export async function getAccountById(accountId: string): Promise<AuthenticatedAccount | null> {
  const email = normalizeEmail(accountId);

  if (isSharedAuthConfigured()) {
    const client = getAuthClient();

    await ensureAuthInitialized(client);

    const user = await client.simple.getUser<ThornwritheAccountMetadata>(emailToUsername(email));
    return mapSharedUser(email, user);
  }

  for (const account of accountsByEmail.values()) {
    if (account.email === email) {
      return {
        accountId: account.email,
        characterId: account.characterId,
      };
    }
  }

  return null;
}
