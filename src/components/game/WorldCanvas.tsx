'use client';

import { useEffect, useRef } from 'react';
import { createGame, type ThornwritheGameBridge } from '@/client/phaser/createGame';
import type { GameplayShardSnapshot } from '@/shared/gameplay';

interface WorldCanvasProps {
  snapshot: GameplayShardSnapshot | null;
  revealFog: boolean;
}

export function WorldCanvas({ snapshot, revealFog }: WorldCanvasProps) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<ThornwritheGameBridge | null>(null);
  const latestSnapshotRef = useRef<GameplayShardSnapshot | null>(null);
  const latestRevealFogRef = useRef(revealFog);
  const encounter = snapshot?.encounter ?? null;

  useEffect(() => {
    latestRevealFogRef.current = revealFog;
  }, [revealFog]);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
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

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];

          if (!entry) {
            return;
          }

          game.resize(entry.contentRect.width, entry.contentRect.height);
        });

        resizeObserver.observe(host);
      }

      const queuedSnapshot = latestSnapshotRef.current;

      if (queuedSnapshot) {
        game.render(queuedSnapshot, { revealFog: latestRevealFogRef.current });
      }
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    latestSnapshotRef.current = snapshot;

    if (!snapshot || !gameRef.current) {
      return;
    }

    gameRef.current.render(snapshot, { revealFog });
  }, [revealFog, snapshot]);

  return (
    <section className="world-canvas" aria-label="World canvas">
      <div ref={canvasHostRef} className="world-canvas__host" />
      {encounter?.status === 'active' ? (
        <div className="world-canvas__alert world-canvas__alert--active">
          <strong>Fight</strong>
          <span>Movement is locked. Use flee in field commands.</span>
        </div>
      ) : null}
      {!snapshot ? <p className="world-canvas__placeholder">Awaiting the first shard snapshot.</p> : null}
    </section>
  );
}
