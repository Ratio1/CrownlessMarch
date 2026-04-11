'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EncounterSnapshot } from '@/shared/domain/combat';

export type MoveDirection = 'north' | 'south' | 'east' | 'west';

export interface VisibleTile {
  x: number;
  y: number;
  kind: string;
  blocked: boolean;
}

export interface WorldSnapshot {
  regionId: string;
  position: { x: number; y: number };
  vision: { radius: number; size: number };
  visibleTiles: VisibleTile[];
  activeEncounter: EncounterSnapshot | null;
}

interface WorldSnapshotResponse {
  snapshot?: WorldSnapshot;
  error?: string;
}

interface EncounterSnapshotResponse {
  encounter?: EncounterSnapshot;
  error?: string;
}

interface MoveResponse {
  snapshot?: WorldSnapshot;
  encounter?: EncounterSnapshot | null;
  error?: string;
}

interface OverrideResponse {
  encounter?: EncounterSnapshot;
  error?: string;
}

interface UseGameSnapshotState {
  worldSnapshot: WorldSnapshot | null;
  encounterSnapshot: EncounterSnapshot | null;
  activeEncounter: EncounterSnapshot | null;
  loading: boolean;
  moving: boolean;
  overridePending: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  move: (direction: MoveDirection) => Promise<void>;
  queueOverride: (command: string) => Promise<void>;
}

const POLL_INTERVAL_MS = 2_500;

export function useGameSnapshot(): UseGameSnapshotState {
  const [worldSnapshot, setWorldSnapshot] = useState<WorldSnapshot | null>(null);
  const [encounterSnapshot, setEncounterSnapshot] = useState<EncounterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [overridePending, setOverridePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasBootstrappedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const worldResponse = await fetch('/api/world/snapshot', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store'
        });
        const worldBody = (await worldResponse.json()) as WorldSnapshotResponse;
        if (!worldResponse.ok || !worldBody.snapshot) {
          throw new Error(worldBody.error ?? 'Failed to load world snapshot.');
        }
        if (cancelled) {
          return;
        }

        setWorldSnapshot(worldBody.snapshot);

        const encounterId = worldBody.snapshot.activeEncounter?.id;
        if (!encounterId) {
          setEncounterSnapshot(null);
          setError(null);
          return;
        }

        const encounterResponse = await fetch(`/api/encounters/${encounterId}/snapshot`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store'
        });
        const encounterBody = (await encounterResponse.json()) as EncounterSnapshotResponse;
        if (!encounterResponse.ok || !encounterBody.encounter) {
          throw new Error(encounterBody.error ?? 'Failed to poll encounter snapshot.');
        }
        if (!cancelled) {
          setEncounterSnapshot(encounterBody.encounter);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Failed to load world state.');
        }
      } finally {
        if (!cancelled && !hasBootstrappedRef.current) {
          hasBootstrappedRef.current = true;
          setLoading(false);
        }
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const worldResponse = await fetch('/api/world/snapshot', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      const worldBody = (await worldResponse.json()) as WorldSnapshotResponse;
      if (!worldResponse.ok || !worldBody.snapshot) {
        throw new Error(worldBody.error ?? 'Failed to load world snapshot.');
      }

      setWorldSnapshot(worldBody.snapshot);
      if (!worldBody.snapshot.activeEncounter) {
        setEncounterSnapshot(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load world state.');
    } finally {
      setLoading(false);
    }
  }

  async function move(direction: MoveDirection) {
    setMoving(true);
    setError(null);
    try {
      const moveResponse = await fetch('/api/world/move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ direction })
      });
      const moveBody = (await moveResponse.json()) as MoveResponse;
      if (!moveResponse.ok || !moveBody.snapshot) {
        throw new Error(moveBody.error ?? 'Move failed.');
      }

      setWorldSnapshot(moveBody.snapshot);
      setEncounterSnapshot(moveBody.encounter ?? moveBody.snapshot.activeEncounter ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Move failed.');
    } finally {
      setMoving(false);
    }
  }

  async function queueOverride(command: string) {
    const trimmedCommand = command.trim();
    const encounterId = encounterSnapshot?.id ?? worldSnapshot?.activeEncounter?.id;

    if (!trimmedCommand || !encounterId) {
      return;
    }

    setOverridePending(true);
    setError(null);

    try {
      const response = await fetch(`/api/encounters/${encounterId}/override`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ command: trimmedCommand })
      });

      const body = (await response.json()) as OverrideResponse;
      if (!response.ok || !body.encounter) {
        throw new Error(body.error ?? 'Failed to queue override.');
      }

      setEncounterSnapshot(body.encounter);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to queue override.');
    } finally {
      setOverridePending(false);
    }
  }

  const activeEncounter = useMemo(() => {
    return encounterSnapshot ?? worldSnapshot?.activeEncounter ?? null;
  }, [encounterSnapshot, worldSnapshot]);

  return {
    worldSnapshot,
    encounterSnapshot,
    activeEncounter,
    loading,
    moving,
    overridePending,
    error,
    refresh,
    move,
    queueOverride
  };
}
