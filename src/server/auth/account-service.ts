import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

interface AccountRecord {
  id: string;
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

export async function registerAccount(input: {
  email: string;
  password: string;
  characterName: string;
}): Promise<AuthenticatedAccount> {
  const email = normalizeEmail(input.email);

  if (!email || !input.password || !input.characterName.trim()) {
    throw new Error('Invalid registration payload');
  }

  if (accountsByEmail.has(email)) {
    throw new Error('Account already exists');
  }

  const account: AccountRecord = {
    id: randomUUID(),
    email,
    passwordDigest: hashPassword(input.password),
    characterId: randomUUID(),
    characterName: input.characterName.trim(),
  };

  accountsByEmail.set(email, account);

  return {
    accountId: account.id,
    characterId: account.characterId,
  };
}

export async function authenticateAccount(input: {
  email: string;
  password: string;
}): Promise<AuthenticatedAccount | null> {
  const account = accountsByEmail.get(normalizeEmail(input.email));

  if (!account || !verifyPassword(input.password, account.passwordDigest)) {
    return null;
  }

  return {
    accountId: account.id,
    characterId: account.characterId,
  };
}

export async function getAccountById(accountId: string): Promise<AuthenticatedAccount | null> {
  for (const account of accountsByEmail.values()) {
    if (account.id === accountId) {
      return {
        accountId: account.id,
        characterId: account.characterId,
      };
    }
  }

  return null;
}
