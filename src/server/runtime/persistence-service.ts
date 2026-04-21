import type { CharacterCheckpoint } from '../platform/r1fs-characters';
import type { PresenceLease } from '../../shared/domain/types';
import type { ProgressionSnapshot } from '../../shared/domain/progression';
import { normalizeDurableProgression } from '../../shared/domain/progression';

export interface PersistenceServiceDependencies {
  nodeId: string;
  readPresenceLease(characterId: string): Promise<PresenceLease | null>;
  writePresenceLease(characterId: string, lease: PresenceLease): Promise<unknown>;
  saveCharacterCheckpoint(input: {
    cid: string;
    persistRevision: number;
    snapshot: Record<string, unknown>;
  }): Promise<CharacterCheckpoint>;
  now?: () => number;
}

export interface PersistProgressionInput {
  characterId: string;
  connectionId: string;
  progression: ProgressionSnapshot | Record<string, unknown>;
}

export interface PersistProgressionResult extends CharacterCheckpoint {}

function isLeaseExpired(lease: PresenceLease, now: number) {
  const expiresAt = Date.parse(lease.lease_expires_at);

  return Number.isNaN(expiresAt) || expiresAt <= now;
}

function hasValidPersistRevision(lease: PresenceLease) {
  return Number.isInteger(lease.persist_revision) && lease.persist_revision >= 0;
}

export function createPersistenceService(dependencies: PersistenceServiceDependencies) {
  const now = dependencies.now ?? Date.now;
  const inFlightPersists = new Map<string, Promise<void>>();

  function getLiveLease(
    lease: PresenceLease | null,
    input: PersistProgressionInput
  ): PresenceLease | null {
    if (!lease) {
      return null;
    }

    const ownsLease =
      lease.connection_id === input.connectionId &&
      lease.session_host_node_id === dependencies.nodeId &&
      hasValidPersistRevision(lease) &&
      !isLeaseExpired(lease, now());

    return ownsLease ? lease : null;
  }

  async function runSerial<T>(characterId: string, task: () => Promise<T>) {
    const previous = inFlightPersists.get(characterId) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => current);
    inFlightPersists.set(characterId, tail);

    await previous.catch(() => undefined);

    try {
      return await task();
    } finally {
      releaseCurrent();

      if (inFlightPersists.get(characterId) === tail) {
        inFlightPersists.delete(characterId);
      }
    }
  }

  async function persistProgression(input: PersistProgressionInput): Promise<PersistProgressionResult> {
    return await runSerial(input.characterId, async () => {
      const lease = getLiveLease(await dependencies.readPresenceLease(input.characterId), input);

      if (!lease) {
        throw new Error('Stale ownership');
      }

      const saved = await dependencies.saveCharacterCheckpoint({
        cid: lease.current_character_cid,
        persistRevision: lease.persist_revision,
        snapshot: normalizeDurableProgression(input.progression),
      });

      const currentLease = getLiveLease(await dependencies.readPresenceLease(input.characterId), input);

      if (!currentLease) {
        throw new Error('Stale ownership');
      }

      const nextLease: PresenceLease = {
        ...currentLease,
        current_character_cid: saved.cid,
        persist_revision: saved.persist_revision,
        last_persisted_at: new Date(now()).toISOString(),
      };

      await dependencies.writePresenceLease(input.characterId, nextLease);

      return saved;
    });
  }

  return {
    persistProgression,
  };
}
