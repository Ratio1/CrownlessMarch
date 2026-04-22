'use client';

import type { GameplayShardSnapshot } from '@/shared/gameplay';
import { WorldCanvas } from './WorldCanvas';
import { WORLD_LEGEND_ORDER, WORLD_TERRAIN_DETAILS, buildWorldRenderModel } from './world-render-model';

interface WorldFieldProps {
  snapshot: GameplayShardSnapshot | null;
}

export function WorldField({ snapshot }: WorldFieldProps) {
  if (!snapshot) {
    return (
      <section className="panel world-field" aria-label="World field">
        <div className="world-field__empty">
          Awaiting the first shard snapshot. The briarline is still binding.
        </div>
      </section>
    );
  }

  const model = buildWorldRenderModel(snapshot);
  const visibleHostiles = model.cells.filter((cell) => cell.monster).map((cell) => cell.monster);
  const visibleAllies = model.cells
    .filter((cell) => cell.character && cell.character.cid !== snapshot.character.cid)
    .map((cell) => cell.character);

  return (
    <section className="panel world-field" aria-label="World field">
      <div className="world-field__header">
        <div>
          <p className="eyebrow">Briar March</p>
          <h2>Forest Field</h2>
        </div>
        <div className="world-field__badges">
          <span className="status-pill">Ground {model.currentTerrain.label}</span>
          <span className="status-pill">Vision {snapshot.vision.size}x{snapshot.vision.size}</span>
          <span className="status-pill">Hostiles {Object.keys(snapshot.monsters).length}</span>
        </div>
      </div>

      <div className="world-field__scene">
        <article className="world-field__objective">
          <div className="panel-title">Field directive</div>
          <strong>{model.activeQuest?.label ?? 'Hold the line until the shard resolves.'}</strong>
          <p>{model.activeQuest?.progress ?? 'No active objective yet. Stay mobile and read the field.'}</p>
        </article>

        <article className="world-field__objective world-field__objective--terrain">
          <div className="panel-title">Current ground</div>
          <strong>{model.currentTerrain.label}</strong>
          <p>{model.currentTerrain.summary}</p>
        </article>
      </div>

      <div className="world-field__surface">
        <WorldCanvas snapshot={snapshot} />
      </div>

      <div className="world-sighting-strip">
        <article className="world-sighting-card">
          <div className="panel-title">Visible grid</div>
          <strong>
            {model.bounds.columns} x {model.bounds.rows}
          </strong>
          <p className="muted">Live fog window around the active PC.</p>
        </article>

        <article className="world-sighting-card">
          <div className="panel-title">Threats in sight</div>
          <strong>{visibleHostiles.length}</strong>
          <p className="muted">
            {visibleHostiles.length > 0
              ? visibleHostiles.map((monster) => monster?.label).filter(Boolean).join(', ')
              : 'No hostiles in the current window.'}
          </p>
        </article>

        <article className="world-sighting-card">
          <div className="panel-title">Allies in sight</div>
          <strong>{visibleAllies.length}</strong>
          <p className="muted">
            {visibleAllies.length > 0
              ? visibleAllies.map((character) => character?.name ?? character?.cid).filter(Boolean).join(', ')
              : 'No other PCs visible on this shard window.'}
          </p>
        </article>
      </div>

      <div className="world-field__legend" aria-label="Terrain legend">
        {WORLD_LEGEND_ORDER.map((terrainId) => (
          <div className="world-legend-item" key={terrainId}>
            <span className={`world-legend-item__swatch world-legend-item__swatch--${terrainId}`} />
            <span>{WORLD_TERRAIN_DETAILS[terrainId].label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
