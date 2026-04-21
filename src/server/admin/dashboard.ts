import { createCharacterCheckpointStore } from '../platform/r1fs-characters';
import {
  createPresenceLeaseStore,
  getPresenceHkey,
  parsePresenceLease,
  type PresenceLeaseStoreOptions,
} from '../platform/cstore-presence';
import { createRosterStore, getRosterHkey, parseRosterEntry, type ThornwritheRosterEntry } from '../platform/cstore-roster';
import { getRatio1ServerClient, type Ratio1CStoreClient, type Ratio1R1fsClient } from '../platform/ratio1';
import { resolveThornwritheGameId } from '../platform/runtime-env';
import type { PresenceLease } from '../../shared/domain/types';

export interface AdminDashboardHsetRow {
  key: string;
  raw: string | null;
  status: 'ok' | 'error';
  parsed: unknown;
  error?: string;
}

export interface AdminCharacterRow {
  accountId: string;
  email: string;
  characterName: string;
  latestCharacterCid: string;
  persistRevision: number;
  registeredAt: string;
  lastPersistedAt: string | null;
  online: boolean;
  presence: PresenceLease | null;
  snapshot: Record<string, unknown> | null;
  snapshotError: string | null;
}

export interface AdminDashboardData {
  gameId: string;
  rosterHkey: string;
  presenceHkey: string;
  rosterRows: AdminDashboardHsetRow[];
  presenceRows: AdminDashboardHsetRow[];
  characters: AdminCharacterRow[];
}

export interface LoadAdminDashboardDataOptions {
  cstore?: Ratio1CStoreClient;
  env?: NodeJS.ProcessEnv;
  gameId?: string;
  r1fs?: Ratio1R1fsClient;
}

function getDefaultClients() {
  return getRatio1ServerClient();
}

function sortCharacters(left: ThornwritheRosterEntry, right: ThornwritheRosterEntry) {
  return (
    left.characterName.localeCompare(right.characterName, undefined, { sensitivity: 'base' }) ||
    left.email.localeCompare(right.email, undefined, { sensitivity: 'base' })
  );
}

export async function loadAdminDashboardData(options: LoadAdminDashboardDataOptions = {}): Promise<AdminDashboardData> {
  const env = options.env ?? process.env;
  const clients = getDefaultClients();
  const cstore = options.cstore ?? clients.cstore;
  const r1fs = options.r1fs ?? clients.r1fs;
  const gameId = options.gameId ?? resolveThornwritheGameId(env);
  const rosterStore = createRosterStore({ cstore, env, gameId });
  const presenceStore = createPresenceLeaseStore({ cstore, env, gameId });
  const checkpointStore = createCharacterCheckpointStore({ r1fs });

  await Promise.all([rosterStore.syncRosterHset(), presenceStore.syncPresenceHset()]);

  const [rosterRawRows, presenceRawRows] = await Promise.all([
    rosterStore.readAllRosterRows(),
    presenceStore.readAllPresenceRows(),
  ]);

  const rosterRows = Object.entries(rosterRawRows).map<AdminDashboardHsetRow>(([key, raw]) => {
    try {
      return {
        key,
        raw,
        status: 'ok',
        parsed: parseRosterEntry(raw),
      };
    } catch (error) {
      return {
        key,
        raw,
        status: 'error',
        parsed: null,
        error: error instanceof Error ? error.message : 'Invalid roster row',
      };
    }
  });
  const presenceRows = Object.entries(presenceRawRows).map<AdminDashboardHsetRow>(([key, raw]) => {
    try {
      return {
        key,
        raw,
        status: 'ok',
        parsed: parsePresenceLease(raw),
      };
    } catch (error) {
      return {
        key,
        raw,
        status: 'error',
        parsed: null,
        error: error instanceof Error ? error.message : 'Invalid presence row',
      };
    }
  });

  const presenceByAccountId = new Map<string, PresenceLease | null>(
    presenceRows
      .filter((row) => row.status === 'ok')
      .map((row) => [row.key, row.parsed as PresenceLease | null]),
  );

  const validRosterEntries = rosterRows
    .filter((row) => row.status === 'ok' && row.parsed)
    .map((row) => row.parsed as ThornwritheRosterEntry)
    .sort(sortCharacters);

  const characters = await Promise.all(
    validRosterEntries.map(async (entry) => {
      let snapshot: Record<string, unknown> | null = null;
      let snapshotError: string | null = null;

      try {
        const checkpoint = await checkpointStore.loadCharacterByCid(entry.latestCharacterCid);
        snapshot = checkpoint.snapshot;
      } catch (error) {
        snapshotError = error instanceof Error ? error.message : 'Unable to load R1FS checkpoint';
      }

      const presence = presenceByAccountId.get(entry.accountId) ?? null;

      return {
        accountId: entry.accountId,
        email: entry.email,
        characterName: entry.characterName,
        latestCharacterCid: entry.latestCharacterCid,
        persistRevision: entry.persistRevision,
        registeredAt: entry.registeredAt,
        lastPersistedAt: entry.lastPersistedAt,
        online: !!presence,
        presence,
        snapshot,
        snapshotError,
      } satisfies AdminCharacterRow;
    }),
  );

  return {
    gameId,
    rosterHkey: getRosterHkey(gameId),
    presenceHkey: getPresenceHkey(gameId),
    rosterRows,
    presenceRows,
    characters,
  };
}
