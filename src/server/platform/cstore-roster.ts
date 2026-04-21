import { getRatio1ServerClient, type Ratio1CStoreClient } from './ratio1';
import { resolveThornwritheGameId } from './runtime-env';

export interface ThornwritheRosterEntry {
  version: 1;
  accountId: string;
  email: string;
  characterName: string;
  latestCharacterCid: string;
  persistRevision: number;
  registeredAt: string;
  lastPersistedAt: string | null;
}

export interface RosterStoreOptions {
  cstore: Ratio1CStoreClient;
  env?: NodeJS.ProcessEnv;
  gameId?: string;
}

function resolveRosterGameId(gameId: string | undefined, env: NodeJS.ProcessEnv) {
  return gameId ?? resolveThornwritheGameId(env);
}

function isRosterEntry(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRosterEntry(value: Record<string, unknown>): ThornwritheRosterEntry | null {
  if (
    value.version !== 1 ||
    typeof value.account_id !== 'string' ||
    typeof value.email !== 'string' ||
    typeof value.character_name !== 'string' ||
    typeof value.latest_character_cid !== 'string' ||
    typeof value.persist_revision !== 'number' ||
    typeof value.registered_at !== 'string' ||
    !(typeof value.last_persisted_at === 'string' || value.last_persisted_at === null)
  ) {
    return null;
  }

  return {
    version: 1,
    accountId: value.account_id,
    email: value.email,
    characterName: value.character_name,
    latestCharacterCid: value.latest_character_cid,
    persistRevision: value.persist_revision,
    registeredAt: value.registered_at,
    lastPersistedAt: value.last_persisted_at,
  };
}

function serializeRosterEntry(entry: ThornwritheRosterEntry) {
  return JSON.stringify({
    version: entry.version,
    account_id: entry.accountId,
    email: entry.email,
    character_name: entry.characterName,
    latest_character_cid: entry.latestCharacterCid,
    persist_revision: entry.persistRevision,
    registered_at: entry.registeredAt,
    last_persisted_at: entry.lastPersistedAt,
  });
}

export function parseRosterEntry(payload: string | null): ThornwritheRosterEntry | null {
  if (payload === null) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('Invalid Thornwrithe roster entry');
  }

  if (!isRosterEntry(parsed)) {
    throw new Error('Invalid Thornwrithe roster entry');
  }

  const entry = normalizeRosterEntry(parsed);

  if (!entry) {
    throw new Error('Invalid Thornwrithe roster entry');
  }

  return entry;
}

export function getRosterHkey(gameId: string) {
  return `thornwrithe-${gameId}:pcs`;
}

export function createRosterStore(options: RosterStoreOptions) {
  const env = options.env ?? process.env;
  const hkey = getRosterHkey(resolveRosterGameId(options.gameId, env));

  return {
    async syncRosterHset() {
      return await options.cstore.hsync({ hkey });
    },

    async readRosterEntry(accountId: string) {
      return parseRosterEntry(
        await options.cstore.hget({
          hkey,
          key: accountId,
        }),
      );
    },

    async writeRosterEntry(accountId: string, entry: ThornwritheRosterEntry) {
      await options.cstore.hset({
        hkey,
        key: accountId,
        value: serializeRosterEntry(entry),
      });

      return entry;
    },

    async readAllRosterRows() {
      return await options.cstore.hgetall({ hkey });
    },
  };
}

function getDefaultRosterStore() {
  return createRosterStore({
    cstore: getRatio1ServerClient().cstore,
  });
}

export async function syncRosterHset() {
  return await getDefaultRosterStore().syncRosterHset();
}

export async function readRosterEntry(accountId: string) {
  return await getDefaultRosterStore().readRosterEntry(accountId);
}

export async function writeRosterEntry(accountId: string, entry: ThornwritheRosterEntry) {
  return await getDefaultRosterStore().writeRosterEntry(accountId, entry);
}

export async function readAllRosterRows() {
  return await getDefaultRosterStore().readAllRosterRows();
}
