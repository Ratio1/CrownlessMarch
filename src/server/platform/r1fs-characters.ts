import { getRatio1ServerClient, type Ratio1R1fsClient } from './ratio1';
import { normalizeDurableProgression } from '../../shared/domain/progression';

export interface CharacterCheckpointRecord<TSnapshot extends Record<string, unknown> = Record<string, unknown>> {
  persist_revision: number;
  snapshot: TSnapshot;
}

export interface CharacterCheckpoint<TSnapshot extends Record<string, unknown> = Record<string, unknown>>
  extends CharacterCheckpointRecord<TSnapshot> {
  cid: string;
}

export interface CharacterCheckpointStoreOptions {
  r1fs: Ratio1R1fsClient;
}

export interface CreateInitialCharacterCheckpointInput {
  characterName: string;
  snapshot?: Record<string, unknown>;
}

type GlobalWithCharacterCheckpoints = typeof globalThis & {
  __thornwritheCharacterCheckpoints?: Map<string, CharacterCheckpointRecord<Record<string, unknown>>>;
  __thornwritheCharacterCheckpointWrites?: number;
};

function getInMemoryCheckpoints() {
  const globalWithCharacterCheckpoints = globalThis as GlobalWithCharacterCheckpoints;

  if (!globalWithCharacterCheckpoints.__thornwritheCharacterCheckpoints) {
    globalWithCharacterCheckpoints.__thornwritheCharacterCheckpoints = new Map<
      string,
      CharacterCheckpointRecord<Record<string, unknown>>
    >();
  }

  return globalWithCharacterCheckpoints.__thornwritheCharacterCheckpoints;
}

function isCharacterCheckpointRecord(value: unknown): value is CharacterCheckpointRecord<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.persist_revision === 'number' &&
    !!record.snapshot &&
    typeof record.snapshot === 'object' &&
    !Array.isArray(record.snapshot)
  );
}

export function createCharacterCheckpointStore(options: CharacterCheckpointStoreOptions) {
  return {
    async createInitialCharacterCheckpoint(input: CreateInitialCharacterCheckpointInput): Promise<CharacterCheckpoint> {
      const snapshot = normalizeDurableProgression({
        name: input.characterName,
        ...(input.snapshot ?? {}),
      });
      const record: CharacterCheckpointRecord = {
        persist_revision: 0,
        snapshot,
      };
      const result = await options.r1fs.addYaml({
        data: record,
      });

      return {
        cid: result.cid,
        persist_revision: record.persist_revision,
        snapshot: record.snapshot,
      };
    },

    async loadCharacterByCid(cid: string): Promise<CharacterCheckpoint> {
      const payload = await options.r1fs.getYaml({ cid });

      if (!isCharacterCheckpointRecord(payload.file_data)) {
        throw new Error('Invalid character checkpoint payload');
      }

      return {
        cid,
        persist_revision: payload.file_data.persist_revision,
        snapshot: payload.file_data.snapshot,
      };
    },

    async saveCharacterCheckpoint(input: {
      cid: string;
      persistRevision: number;
      snapshot: Record<string, unknown>;
    }): Promise<CharacterCheckpoint> {
      const current = await this.loadCharacterByCid(input.cid);

      if (current.persist_revision > input.persistRevision) {
        throw new Error('Stale persist_revision');
      }

      const nextRecord: CharacterCheckpointRecord = {
        persist_revision: input.persistRevision + 1,
        snapshot: input.snapshot,
      };
      const result = await options.r1fs.addYaml({
        data: nextRecord,
      });

      return {
        cid: result.cid,
        persist_revision: nextRecord.persist_revision,
        snapshot: nextRecord.snapshot,
      };
    },
  };
}

function shouldUseInMemoryCheckpointStore(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === 'test' || env.THORNWRITHE_USE_IN_MEMORY_R1FS === '1';
}

function getNextInMemoryCid() {
  const globalWithCharacterCheckpoints = globalThis as GlobalWithCharacterCheckpoints;
  globalWithCharacterCheckpoints.__thornwritheCharacterCheckpointWrites =
    (globalWithCharacterCheckpoints.__thornwritheCharacterCheckpointWrites ?? 0) + 1;
  return `cid-local-${globalWithCharacterCheckpoints.__thornwritheCharacterCheckpointWrites}`;
}

function createInMemoryCharacterCheckpointStore() {
  return {
    async createInitialCharacterCheckpoint(input: CreateInitialCharacterCheckpointInput): Promise<CharacterCheckpoint> {
      const snapshot = normalizeDurableProgression({
        name: input.characterName,
        ...(input.snapshot ?? {}),
      });
      const record: CharacterCheckpointRecord = {
        persist_revision: 0,
        snapshot,
      };
      const cid = getNextInMemoryCid();
      getInMemoryCheckpoints().set(cid, record);

      return {
        cid,
        persist_revision: record.persist_revision,
        snapshot: record.snapshot,
      };
    },

    async loadCharacterByCid(cid: string): Promise<CharacterCheckpoint> {
      const record = getInMemoryCheckpoints().get(cid);

      if (!record) {
        throw new Error(`Unknown checkpoint ${cid}`);
      }

      return {
        cid,
        persist_revision: record.persist_revision,
        snapshot: record.snapshot,
      };
    },

    async saveCharacterCheckpoint(input: {
      cid: string;
      persistRevision: number;
      snapshot: Record<string, unknown>;
    }): Promise<CharacterCheckpoint> {
      const current = getInMemoryCheckpoints().get(input.cid);

      if (!current) {
        throw new Error(`Unknown checkpoint ${input.cid}`);
      }

      if (current.persist_revision > input.persistRevision) {
        throw new Error('Stale persist_revision');
      }

      const nextRecord: CharacterCheckpointRecord = {
        persist_revision: input.persistRevision + 1,
        snapshot: input.snapshot,
      };
      const cid = getNextInMemoryCid();
      getInMemoryCheckpoints().set(cid, nextRecord);

      return {
        cid,
        persist_revision: nextRecord.persist_revision,
        snapshot: nextRecord.snapshot,
      };
    },
  };
}

function getDefaultCharacterCheckpointStore() {
  if (shouldUseInMemoryCheckpointStore()) {
    return createInMemoryCharacterCheckpointStore();
  }

  return createCharacterCheckpointStore({
    r1fs: getRatio1ServerClient().r1fs,
  });
}

export async function loadCharacterByCid(cid: string) {
  return await getDefaultCharacterCheckpointStore().loadCharacterByCid(cid);
}

export async function createInitialCharacterCheckpoint(input: CreateInitialCharacterCheckpointInput) {
  return await getDefaultCharacterCheckpointStore().createInitialCharacterCheckpoint(input);
}

export async function saveCharacterCheckpoint(input: {
  cid: string;
  persistRevision: number;
  snapshot: Record<string, unknown>;
}) {
  return await getDefaultCharacterCheckpointStore().saveCharacterCheckpoint(input);
}

export function __resetCharacterCheckpointStoreForTests() {
  getInMemoryCheckpoints().clear();
  (globalThis as GlobalWithCharacterCheckpoints).__thornwritheCharacterCheckpointWrites = 0;
}
