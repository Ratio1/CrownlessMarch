import { getRatio1ServerClient, type Ratio1R1fsClient } from './ratio1';

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
      const result = await options.r1fs.addJson({
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

function getDefaultCharacterCheckpointStore() {
  return createCharacterCheckpointStore({
    r1fs: getRatio1ServerClient().r1fs,
  });
}

export async function loadCharacterByCid(cid: string) {
  return await getDefaultCharacterCheckpointStore().loadCharacterByCid(cid);
}

export async function saveCharacterCheckpoint(input: {
  cid: string;
  persistRevision: number;
  snapshot: Record<string, unknown>;
}) {
  return await getDefaultCharacterCheckpointStore().saveCharacterCheckpoint(input);
}
