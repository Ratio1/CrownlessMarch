'use client';

import type { GameplayShardSnapshot } from '@/shared/gameplay';
import { WorldCanvas } from './WorldCanvas';
import { WORLD_LEGEND_ORDER, WORLD_TERRAIN_DETAILS, buildWorldRenderModel } from './world-render-model';

interface WorldFieldProps {
  snapshot: GameplayShardSnapshot | null;
}

const SHRINE_UNLOCK_ID = 'location:ember-shrine';
const RUIN_CACHE_UNLOCK_ID = 'location:watchpost-cache';

function buildSiteNotes(snapshot: GameplayShardSnapshot) {
  const unlocks = new Set(snapshot.character.unlocks);
  const readyQuest = snapshot.character.quests.find((quest) => quest.status === 'ready_to_turn_in');

  switch (snapshot.currentTile.kind) {
    case 'town':
      return [
        readyQuest
          ? `${readyQuest.label} can be debriefed here for durable rewards.`
          : 'Quest debriefs resolve here once an objective is ready.',
        'Defeats now route back through the town hearth and restore full HP.',
      ];
    case 'shrine':
      return [
        unlocks.has(SHRINE_UNLOCK_ID)
          ? 'The Ember Shrine has already been rekindled and remains a rally point.'
          : 'First contact restores full HP and grants a health potion.',
        'Shrine visits drive the survey and shrine-road quest chain.',
      ];
    case 'ruin':
      return [
        unlocks.has(RUIN_CACHE_UNLOCK_ID)
          ? 'The watchpost cache is stripped, but goblin pressure still holds the lane.'
          : 'The first sweep yields field rations and 4 gold before the goblins close.',
        'Ruin lanes stay hostile even after the cache is cleared.',
      ];
    case 'roots':
      return ['Briar Goblins spawn here and advance the goblin-cull contract.'];
    case 'forest':
      return ['Sap Wolves prowl these woods and now drive the shrine-road hunt.'];
    case 'road':
      return ['Road tiles keep the route to town readable and fast under pursuit.'];
    case 'water':
      return ['Flooded ground blocks movement and breaks safe lines of retreat.'];
  }
}

function buildTrailState(snapshot: GameplayShardSnapshot) {
  const latest = snapshot.activityLog[snapshot.activityLog.length - 1];

  if (snapshot.encounter?.status === 'lost') {
    return {
      title: 'Recovery complete',
      detail: 'Town hearths restored the party after the defeat. Re-enter the march when ready.',
    };
  }

  if (snapshot.encounter?.status === 'won') {
    return {
      title: 'Field victory logged',
      detail: 'Rewards and quest updates have already been written into the active checkpoint state.',
    };
  }

  if (snapshot.encounter?.status === 'escaped') {
    return {
      title: 'Contact broken',
      detail: 'The line opened long enough to retreat. Reposition before the forest closes again.',
    };
  }

  if (latest) {
    return {
      title: latest.kind === 'quest' ? 'Quest update' : latest.kind === 'reward' ? 'Field reward' : 'Trail report',
      detail: latest.text,
    };
  }

  return {
    title: 'Trail quiet',
    detail: 'No fresh reports yet. Push outward until the forest answers.',
  };
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
  const siteNotes = buildSiteNotes(snapshot);
  const trailState = buildTrailState(snapshot);

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
          <ul className="world-field__note-list">
            {siteNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </article>

        <article className="world-field__objective world-field__objective--trail">
          <div className="panel-title">Trail state</div>
          <strong>{trailState.title}</strong>
          <p>{trailState.detail}</p>
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
