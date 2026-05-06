'use client';

import type { GameplayShardSnapshot } from '@/shared/gameplay';
import { WorldCanvas } from './WorldCanvas';
import { WORLD_LEGEND_ORDER, WORLD_TERRAIN_DETAILS, buildWorldRenderModel } from './world-render-model';

interface WorldFieldProps {
  snapshot: GameplayShardSnapshot | null;
}

const SHRINE_UNLOCK_ID = 'location:ember-shrine';
const SHRINE_ROAD_SECURED_UNLOCK_ID = 'route:shrine-road-secured';
const TOWN_TILE = { x: 5, y: 5 } as const;
const WATCHPOST_LANE_TILE = { x: 6, y: 5 } as const;
const EMBER_SHRINE_TILE = { x: 7, y: 6 } as const;
const SHRINE_ROAD_GROVE_TILE = { x: 7, y: 5 } as const;

function sameTile(left: { x: number; y: number }, right: { x: number; y: number }) {
  return left.x === right.x && left.y === right.y;
}

function buildSiteNotes(snapshot: GameplayShardSnapshot) {
  const unlocks = new Set(snapshot.character.unlocks);
  const readyQuest = snapshot.character.quests.find((quest) => quest.status === 'ready_to_turn_in');
  const objectiveFocus = snapshot.objectiveFocus;
  const onObjectiveTile =
    objectiveFocus?.target.x === snapshot.position.x && objectiveFocus?.target.y === snapshot.position.y;
  const shrineRoadSecured = unlocks.has(SHRINE_ROAD_SECURED_UNLOCK_ID);

  if (sameTile(snapshot.position, TOWN_TILE)) {
    return [
      readyQuest
        ? `${readyQuest.label} can be debriefed here for durable rewards.`
        : 'Quest debriefs resolve here once an objective is ready.',
      shrineRoadSecured
        ? 'The shrine road is currently secured and marked safe on the field surface.'
        : 'Defeats route back through the town hearth and restore full HP.',
    ];
  }

  if (sameTile(snapshot.position, EMBER_SHRINE_TILE)) {
    return [
      unlocks.has(SHRINE_UNLOCK_ID)
        ? 'The Ember Shrine has already been rekindled and remains a rally point.'
        : 'First contact restores full HP and grants a health potion.',
      onObjectiveTile ? 'This shrine is the current objective anchor for the active contract.' : 'Shrine visits drive the survey and shrine-road quest chain.',
    ];
  }

  if (sameTile(snapshot.position, WATCHPOST_LANE_TILE)) {
    return [
      onObjectiveTile ? 'This mud lane is the current goblin-cull target tile.' : 'Briar Goblins spawn here and advance the goblin-cull contract.',
    ];
  }

  if (sameTile(snapshot.position, SHRINE_ROAD_GROVE_TILE)) {
    return [
      shrineRoadSecured && onObjectiveTile
        ? 'The grove is quiet now. Shrine-road hostiles no longer spawn on this tile.'
        : onObjectiveTile
          ? 'This mud grove is the shrine-road kill zone for the Sap Wolf contract.'
          : 'The grove mud marks the contested shrine-road approach.',
    ];
  }

  switch (snapshot.currentTile.kind) {
    case 'grass':
      return ['Green ground is normal walkable terrain.'];
    case 'mud':
      return ['Brown ground is walkable mud and dungeon floor.'];
    case 'forest':
      return ['Forest tiles are tree obstacles and block movement.'];
    case 'stone':
      return ['Stone tiles are rock obstacles and block movement.'];
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
  const objectiveFocus = snapshot.objectiveFocus;
  const shrineRoadSecured = snapshot.character.unlocks.includes(SHRINE_ROAD_SECURED_UNLOCK_ID);
  const fightActive = snapshot.encounter?.status === 'active';

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
          <span className={`status-pill ${shrineRoadSecured ? 'status-pill--online' : ''}`}>
            Shrine road {shrineRoadSecured ? 'secured' : 'contested'}
          </span>
        </div>
      </div>

      {fightActive ? (
        <div className="world-field__fight-banner" role="status">
          <strong>Fight</strong>
          <span>Only flee is available until this encounter resolves.</span>
        </div>
      ) : null}

      <div className="world-field__surface">
        <WorldCanvas snapshot={snapshot} />
      </div>

      <div className="world-sighting-strip">
        <article className="world-sighting-card">
          <div className="panel-title">Objective target</div>
          <strong>{objectiveFocus ? `${objectiveFocus.target.x},${objectiveFocus.target.y}` : 'None'}</strong>
          <p className="muted">
            {objectiveFocus
              ? `${objectiveFocus.stateLabel} on ${objectiveFocus.terrain}.`
              : 'No active route marker on the current shard.'}
          </p>
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

      <div className="world-field__scene">
        <article className="world-field__objective world-field__objective--primary">
          <div className="panel-title">Field directive</div>
          <strong>{objectiveFocus?.label ?? model.activeQuest?.label ?? 'Hold the line until the shard resolves.'}</strong>
          <p>{objectiveFocus?.detail ?? model.activeQuest?.progress ?? 'No active objective yet. Stay mobile and read the field.'}</p>
          {objectiveFocus ? (
            <div className="play-chip-row">
              <span className="status-pill status-pill--objective">{objectiveFocus.stateLabel}</span>
              <span className="status-pill">
                Target {objectiveFocus.target.x},{objectiveFocus.target.y}
              </span>
              <span className="status-pill">Ground {objectiveFocus.terrain}</span>
            </div>
          ) : null}
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
