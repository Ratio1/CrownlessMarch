'use client';

import type { GameplayShardSnapshot } from '@/shared/gameplay';
import { WorldCanvas } from './WorldCanvas';

interface WorldFieldProps {
  snapshot: GameplayShardSnapshot | null;
  revealFog: boolean;
}

export function WorldField({ snapshot, revealFog }: WorldFieldProps) {
  if (!snapshot) {
    return (
      <section className="panel world-field" aria-label="World field">
        <div className="world-field__empty">Awaiting the first shard snapshot.</div>
      </section>
    );
  }

  const fightActive = snapshot.encounter?.status === 'active';

  return (
    <section className="panel world-field" aria-label="World field">
      {fightActive ? (
        <div className="world-field__fight-banner" role="status">
          <strong>Fight</strong>
          <span>Only flee is available until this encounter resolves.</span>
        </div>
      ) : null}

      <WorldCanvas snapshot={snapshot} revealFog={revealFog} />
    </section>
  );
}
