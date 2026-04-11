'use client';

import { useEffect, useRef } from 'react';
import { createGame, type ThornwritheGameBridge } from '@/client/phaser/createGame';
import type { WorldSnapshot } from '@/client/hooks/useGameSnapshot';

interface WorldCanvasProps {
  snapshot: WorldSnapshot | null;
}

export function WorldCanvas({ snapshot }: WorldCanvasProps) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<ThornwritheGameBridge | null>(null);
  const latestSnapshotRef = useRef<WorldSnapshot | null>(null);

  useEffect(() => {
    let disposed = false;
    const host = canvasHostRef.current;
    if (!host) {
      return;
    }

    void createGame(host).then((game) => {
      if (disposed) {
        game.destroy();
        return;
      }
      gameRef.current = game;
      const queuedSnapshot = latestSnapshotRef.current;
      if (queuedSnapshot) {
        game.render(queuedSnapshot);
      }
    });

    return () => {
      disposed = true;
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    latestSnapshotRef.current = snapshot;
    if (!snapshot || !gameRef.current) {
      return;
    }
    gameRef.current.render(snapshot);
  }, [snapshot]);

  return (
    <section className="world-canvas" role="region" aria-label="World Canvas">
      <div ref={canvasHostRef} className="world-canvas__host" />
      {!snapshot ? <p className="world-canvas__placeholder">Awaiting world snapshot...</p> : null}
    </section>
  );
}
