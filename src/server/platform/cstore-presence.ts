import type { PresenceLease } from '../../shared/domain/types';
import { getRatio1ServerClient, type Ratio1CStoreClient } from './ratio1';

export interface PresenceLeaseStoreOptions {
  cstore: Ratio1CStoreClient;
  env?: NodeJS.ProcessEnv;
  gameId?: string;
}

function resolvePresenceGameId(gameId: string | undefined, env: NodeJS.ProcessEnv) {
  const resolvedGameId = gameId ?? env.THORNWRITHE_GAME_ID;

  if (!resolvedGameId) {
    throw new Error('THORNWRITHE_GAME_ID is required to use presence leases');
  }

  return resolvedGameId;
}

function parsePresenceLease(payload: string | null): PresenceLease | null {
  if (!payload) {
    return null;
  }

  return JSON.parse(payload) as PresenceLease;
}

export function getPresenceHkey(gameId: string) {
  return `thornwrithe-${gameId}`;
}

export function createPresenceLeaseStore(options: PresenceLeaseStoreOptions) {
  const env = options.env ?? process.env;
  const hkey = getPresenceHkey(resolvePresenceGameId(options.gameId, env));

  return {
    async syncPresenceHset() {
      return await options.cstore.hsync({ hkey });
    },

    async readPresenceLease(characterId: string) {
      return parsePresenceLease(
        await options.cstore.hget({
          hkey,
          key: characterId,
        })
      );
    },

    async writePresenceLease(characterId: string, lease: PresenceLease) {
      await options.cstore.hset({
        hkey,
        key: characterId,
        value: JSON.stringify(lease),
      });

      return lease;
    },

    async clearPresenceLease(characterId: string, connectionId: string) {
      const currentLease = await this.readPresenceLease(characterId);

      if (!currentLease || currentLease.connection_id !== connectionId) {
        return false;
      }

      await options.cstore.hset({
        hkey,
        key: characterId,
        value: null,
      });

      return true;
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

export async function readPresenceLease(characterId: string) {
  return await getDefaultPresenceLeaseStore().readPresenceLease(characterId);
}

export async function writePresenceLease(characterId: string, lease: PresenceLease) {
  return await getDefaultPresenceLeaseStore().writePresenceLease(characterId, lease);
}

export async function clearPresenceLease(characterId: string, connectionId: string) {
  return await getDefaultPresenceLeaseStore().clearPresenceLease(characterId, connectionId);
}
