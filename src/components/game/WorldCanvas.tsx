'use client';

import { useEffect, useRef } from 'react';
import { createGame, type ThornwritheGameBridge } from '@/client/phaser/createGame';
import type { GameplayShardSnapshot } from '@/shared/gameplay';

interface WorldCanvasProps {
  snapshot: GameplayShardSnapshot | null;
}

function classCrest(value: string) {
  return value.slice(0, 3).toUpperCase();
}

export function WorldCanvas({ snapshot }: WorldCanvasProps) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<ThornwritheGameBridge | null>(null);
  const latestSnapshotRef = useRef<GameplayShardSnapshot | null>(null);
  const encounter = snapshot?.encounter ?? null;
  const activeQuest = snapshot?.character.quests[0] ?? null;
  const objectiveFocus = snapshot?.objectiveFocus ?? null;

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
        game.render(queuedSnapshot);
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

    gameRef.current.render(snapshot);
  }, [snapshot]);

  return (
    <section className="world-canvas" aria-label="World canvas">
      <div ref={canvasHostRef} className="world-canvas__host" />
      <div className="world-canvas__chrome">
        <span className="status-pill">Renderer Phaser</span>
        <span className="status-pill">Surface Live fog window</span>
        {snapshot ? <span className="status-pill">Hostiles {Object.keys(snapshot.monsters).length}</span> : null}
        {snapshot ? <span className="status-pill">Tile {snapshot.currentTile.kind}</span> : null}
      </div>
      {snapshot ? (
        <div className="world-canvas__hero">
          <span className="world-canvas__hero-crest">{classCrest(snapshot.character.classId)}</span>
          <div className="world-canvas__hero-copy">
            <strong>{snapshot.character.name}</strong>
            <span>
              {snapshot.character.classLabel} | HP {snapshot.character.hitPoints.current}/{snapshot.character.hitPoints.max}
            </span>
          </div>
        </div>
      ) : null}
      {activeQuest ? (
        <div className="world-canvas__objective">
          <div className="panel-title">March order</div>
          <strong>{objectiveFocus?.label ?? activeQuest.label}</strong>
          <p>{objectiveFocus?.detail ?? activeQuest.progress}</p>
          {objectiveFocus ? (
            <div className="play-chip-row">
              <span className="status-pill">{objectiveFocus.stateLabel}</span>
              <span className="status-pill">
                {objectiveFocus.target.x},{objectiveFocus.target.y}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      {encounter ? (
        <div className="world-canvas__alert">
          <strong>{encounter.status.toUpperCase()}</strong>
          <span>
            {encounter.monsterName ?? 'Unknown threat'} | round {encounter.round}
          </span>
        </div>
      ) : null}
      {!snapshot ? <p className="world-canvas__placeholder">Awaiting the first shard snapshot.</p> : null}
    </section>
  );
}
