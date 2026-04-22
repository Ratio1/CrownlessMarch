import { createCharacterCheckpointStore } from '../platform/r1fs-characters';
import {
  createPresenceLeaseStore,
  getPresenceHkey,
  parsePresenceLease,
} from '../platform/cstore-presence';
import { createRosterStore, getRosterHkey, parseRosterEntry, type ThornwritheRosterEntry } from '../platform/cstore-roster';
import { getRatio1ServerClient, type Ratio1CStoreClient, type Ratio1R1fsClient } from '../platform/ratio1';
import { resolveThornwritheGameId } from '../platform/runtime-env';
import { ensureAuthInitialized, getAuthClient, isSharedAuthConfigured } from '../auth/cstore';
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

interface SharedAuthMetadata {
  email: string;
  characterId?: string;
  characterName?: string;
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

function isSharedAuthMetadata(value: unknown): value is SharedAuthMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return typeof record.email === 'string';
}

function hasBackfillableCharacterMetadata(value: SharedAuthMetadata): value is SharedAuthMetadata & {
  characterId: string;
  characterName: string;
} {
  return typeof value.characterId === 'string' && typeof value.characterName === 'string';
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

  const [initialRosterRawRows, presenceRawRows] = await Promise.all([
    rosterStore.readAllRosterRows(),
    presenceStore.readAllPresenceRows(),
  ]);
  const rosterRawRows = { ...initialRosterRawRows };

  if (isSharedAuthConfigured(env)) {
    const authClient = getAuthClient();
    await ensureAuthInitialized(authClient);
    const users = await authClient.simple.getAllUsers<unknown>();

    for (const user of users) {
      if (!isSharedAuthMetadata(user.metadata)) {
        continue;
      }

      const accountId = user.metadata.email.trim().toLowerCase();

      if (rosterRawRows[accountId]) {
        continue;
      }

      if (!hasBackfillableCharacterMetadata(user.metadata)) {
        continue;
      }

      let persistRevision = 0;

      try {
        const checkpoint = await checkpointStore.loadCharacterByCid(user.metadata.characterId);
        persistRevision = checkpoint.persist_revision;
      } catch {
        persistRevision = 0;
      }

      const fallbackEntry: ThornwritheRosterEntry = {
        version: 1,
        accountId,
        email: accountId,
        characterName: user.metadata.characterName,
        latestCharacterCid: user.metadata.characterId,
        persistRevision,
        registeredAt: user.createdAt,
        lastPersistedAt: null,
      };

      await rosterStore.writeRosterEntry(accountId, fallbackEntry);
      rosterRawRows[accountId] = JSON.stringify({
        version: 1,
        account_id: fallbackEntry.accountId,
        email: fallbackEntry.email,
        character_name: fallbackEntry.characterName,
        latest_character_cid: fallbackEntry.latestCharacterCid,
        persist_revision: fallbackEntry.persistRevision,
        registered_at: fallbackEntry.registeredAt,
        last_persisted_at: fallbackEntry.lastPersistedAt,
      });
    }
  }

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
