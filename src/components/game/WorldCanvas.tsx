'use client';

import { useEffect, useRef } from 'react';
import { createGame, type ThornwritheGameBridge } from '@/client/phaser/createGame';
import type { GameplayShardSnapshot } from '@/shared/gameplay';
import { buildCombatHudModel } from './combat-hud-model';

interface WorldCanvasProps {
  snapshot: GameplayShardSnapshot | null;
}

function classCrest(value: string) {
  return value.slice(0, 3).toUpperCase();
}

function prettifyLabel(value: string) {
  return value
    .split('-')
    .filter(Boolean)
    .map((entry) => entry[0]?.toUpperCase() + entry.slice(1))
    .join(' ');
}

export function WorldCanvas({ snapshot }: WorldCanvasProps) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<ThornwritheGameBridge | null>(null);
  const latestSnapshotRef = useRef<GameplayShardSnapshot | null>(null);
  const encounter = snapshot?.encounter ?? null;
  const combatHud = encounter?.status === 'active' ? buildCombatHudModel(encounter) : null;
  const activeQuest = snapshot?.character.quests[0] ?? null;
  const objectiveFocus = snapshot?.objectiveFocus ?? null;
  const visibleMonsterCount = snapshot ? Object.keys(snapshot.monsters).length : 0;
  const visibleAllies =
    snapshot
      ? Object.values(snapshot.characters).filter((character) => character.cid !== snapshot.character.cid).length
      : 0;

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
      {snapshot ? (
        <div className="world-canvas__marquee">
          <span className="world-canvas__marquee-label">Shard atlas</span>
          <strong>{prettifyLabel(snapshot.regionId)}</strong>
          <span>{objectiveFocus?.stateLabel ?? activeQuest?.label ?? 'Read the watchfire line and hold.'}</span>
        </div>
      ) : null}
      <div className="world-canvas__chrome">
        <span className="status-pill">Surface live map</span>
        <span className="status-pill">Renderer Phaser</span>
        {snapshot ? <span className="status-pill">Hostiles {visibleMonsterCount}</span> : null}
        {snapshot ? <span className="status-pill">Allies {visibleAllies}</span> : null}
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
            <div className="play-chip-row world-canvas__hero-stats">
              <span className="status-pill">Level {snapshot.character.level}</span>
              <span className="status-pill">Gold {snapshot.character.gold}</span>
            </div>
          </div>
        </div>
      ) : null}
      {activeQuest ? (
        <div className="world-canvas__objective">
          <div className="panel-title">Trail warrant</div>
          <strong>{objectiveFocus?.label ?? activeQuest.label}</strong>
          <p>{objectiveFocus?.detail ?? activeQuest.progress}</p>
          {objectiveFocus ? (
            <div className="play-chip-row">
              <span className="status-pill status-pill--objective">{objectiveFocus.stateLabel}</span>
              <span className="status-pill">
                {objectiveFocus.target.x},{objectiveFocus.target.y}
              </span>
              <span className="status-pill">{objectiveFocus.terrain}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {combatHud ? (
        <div className={`world-canvas__alert ${combatHud.isActive ? 'world-canvas__alert--active' : ''}`}>
          <div className="world-canvas__alert-head">
            <strong>{combatHud.statusLabel}</strong>
            <span>{combatHud.roundLabel}</span>
          </div>
          <span>{combatHud.threatLabel}</span>
          <div className="world-canvas__combat-grid">
            <span>Hero {combatHud.heroHpLabel}</span>
            <span>Threat {combatHud.threatHpLabel}</span>
            <span>{combatHud.queueLabel}</span>
          </div>
          {combatHud.latestLog ? <p>{combatHud.latestLog}</p> : null}
        </div>
      ) : null}
      {!snapshot ? <p className="world-canvas__placeholder">Awaiting the first shard snapshot.</p> : null}
    </section>
  );
}
