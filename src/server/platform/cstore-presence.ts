import type { PresenceLease } from '../../shared/domain/types';
import { getRatio1ServerClient, type Ratio1CStoreClient } from './ratio1';
import { resolveThornwritheGameId } from './runtime-env';

export interface PresenceLeaseStoreOptions {
  cstore: Ratio1CStoreClient;
  env?: NodeJS.ProcessEnv;
  gameId?: string;
}

function resolvePresenceGameId(gameId: string | undefined, env: NodeJS.ProcessEnv) {
  return gameId ?? resolveThornwritheGameId(env);
}

function isPresenceLease(value: unknown): value is PresenceLease {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.current_character_cid === 'string' &&
    typeof record.shard_world_instance_id === 'string' &&
    typeof record.session_host_node_id === 'string' &&
    typeof record.connection_id === 'string' &&
    Array.isArray(record.buffs_debuffs) &&
    typeof record.lease_expires_at === 'string' &&
    (typeof record.last_persisted_at === 'string' || record.last_persisted_at === null) &&
    typeof record.persist_revision === 'number'
  );
}

export function parsePresenceLease(payload: string | null): PresenceLease | null {
  if (!payload) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('Invalid Thornwrithe presence lease');
  }

  if (!isPresenceLease(parsed)) {
    throw new Error('Invalid Thornwrithe presence lease');
  }

  return parsed;
}

export function getPresenceHkey(gameId: string) {
  return `thornwrithe-${gameId}:presence`;
}

export function createPresenceLeaseStore(options: PresenceLeaseStoreOptions) {
  const env = options.env ?? process.env;
  const hkey = getPresenceHkey(resolvePresenceGameId(options.gameId, env));

  return {
    async syncPresenceHset() {
      return await options.cstore.hsync({ hkey });
    },

    async readPresenceLease(accountId: string) {
      return parsePresenceLease(
        await options.cstore.hget({
          hkey,
          key: accountId,
        })
      );
    },

    async writePresenceLease(accountId: string, lease: PresenceLease) {
      await options.cstore.hset({
        hkey,
        key: accountId,
        value: JSON.stringify(lease),
      });

      return lease;
    },

    async clearPresenceLease(accountId: string, connectionId: string) {
      const currentLease = await this.readPresenceLease(accountId);

      if (!currentLease || currentLease.connection_id !== connectionId) {
        return false;
      }

      await options.cstore.hset({
        hkey,
        key: accountId,
        value: null,
      });

      return true;
    },

    async readAllPresenceRows() {
      return await options.cstore.hgetall({ hkey });
    },
  };
}

function getDefaultPresenceLeaseStore() {
  return createPresenceLeaseStore({
    cstore: getRatio1ServerClient().cstore,
  });
}

export async function syncPresenceHset() {
  return await getDefaultPresenceLeaseStore().syncPresenceHset();
}

export async function readPresenceLease(accountId: string) {
  return await getDefaultPresenceLeaseStore().readPresenceLease(accountId);
}

export async function writePresenceLease(accountId: string, lease: PresenceLease) {
  return await getDefaultPresenceLeaseStore().writePresenceLease(accountId, lease);
}

export async function clearPresenceLease(accountId: string, connectionId: string) {
  return await getDefaultPresenceLeaseStore().clearPresenceLease(accountId, connectionId);
}

export async function readAllPresenceRows() {
  return await getDefaultPresenceLeaseStore().readAllPresenceRows();
}
