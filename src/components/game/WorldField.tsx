'use client';

import type { GameplayShardSnapshot } from '@/shared/gameplay';

interface WorldFieldProps {
  snapshot: GameplayShardSnapshot | null;
}

const TERRAIN_DETAILS: Record<
  GameplayShardSnapshot['currentTile']['kind'],
  { code: string; label: string; summary: string }
> = {
  town: {
    code: 'TN',
    label: 'Town Hearth',
    summary: 'Safe ground for rest, turn-ins, and regrouping.',
  },
  road: {
    code: 'RD',
    label: 'Road Lane',
    summary: 'Clear travel lines with better sight.',
  },
  forest: {
    code: 'FR',
    label: 'Dark Forest',
    summary: 'Dense canopy and low-visibility hunting ground.',
  },
  roots: {
    code: 'RT',
    label: 'Briar Roots',
    summary: 'Aggressive thorn corridors where goblins break cover.',
  },
  ruin: {
    code: 'RU',
    label: 'Watchpost Ruin',
    summary: 'Broken stone lanes with loot and old blood in the moss.',
  },
  shrine: {
    code: 'SH',
    label: 'Ember Shrine',
    summary: 'Ancient refuge where the march briefly loosens its grip.',
  },
  water: {
    code: 'WT',
    label: 'Blackwater',
    summary: 'Flooded and blocked ground.',
  },
};

const LEGEND_ORDER: Array<keyof typeof TERRAIN_DETAILS> = ['town', 'road', 'forest', 'roots', 'ruin', 'shrine', 'water'];

function tileAt(snapshot: GameplayShardSnapshot, x: number, y: number) {
  return snapshot.visibleTiles.find((entry) => entry.x === x && entry.y === y) ?? null;
}

function characterAt(snapshot: GameplayShardSnapshot, x: number, y: number) {
  return Object.values(snapshot.characters).find((entry) => entry.position.x === x && entry.position.y === y) ?? null;
}

function monsterAt(snapshot: GameplayShardSnapshot, x: number, y: number) {
  return Object.values(snapshot.monsters).find((entry) => entry.position.x === x && entry.position.y === y) ?? null;
}

function shortMarkerLabel(value: string, fallback: string) {
  const compact = value
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return compact || fallback;
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

  const xs = snapshot.visibleTiles.map((tile) => tile.x);
  const ys = snapshot.visibleTiles.map((tile) => tile.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const activeQuest = snapshot.character.quests[0] ?? null;
  const currentTerrain = TERRAIN_DETAILS[snapshot.currentTile.kind];
  const cells = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const tile = tileAt(snapshot, x, y);
      const character = characterAt(snapshot, x, y);
      const monster = monsterAt(snapshot, x, y);

      if (!tile) {
        continue;
      }

      const terrain = TERRAIN_DETAILS[tile.kind];
      const isCurrent = snapshot.position.x === x && snapshot.position.y === y;

      cells.push(
        <article
          className={`world-tile world-tile--${tile.kind}${tile.blocked ? ' world-tile--blocked' : ''}${
            isCurrent ? ' world-tile--current' : ''
          }${monster ? ' world-tile--hostile' : ''}`}
          key={`${x}:${y}`}
        >
          <div className="world-tile__terrain">
            <span className="world-tile__sigil">{terrain.code}</span>
            <span className="world-tile__label">{terrain.label}</span>
          </div>
          <div className="world-tile__occupants">
            {monster ? (
              <span className="world-token world-token--monster">
                <span className="world-token__badge">{shortMarkerLabel(monster.label, 'MN')}</span>
                <span className="world-token__label">{monster.label}</span>
              </span>
            ) : null}
            {character ? (
              <span
                className={
                  character.cid === snapshot.character.cid ? 'world-token world-token--hero' : 'world-token world-token--ally'
                }
              >
                <span className="world-token__badge">
                  {shortMarkerLabel(character.name ?? character.cid, character.cid === snapshot.character.cid ? 'ME' : 'AL')}
                </span>
                <span className="world-token__label">{character.name ?? character.cid}</span>
              </span>
            ) : null}
          </div>
        </article>
      );
    }
  }

  return (
    <section className="panel world-field" aria-label="World field">
      <div className="world-field__header">
        <div>
          <p className="eyebrow">Briar March</p>
          <h2>Forest Field</h2>
        </div>
        <div className="world-field__badges">
          <span className="status-pill">Ground {currentTerrain.label}</span>
          <span className="status-pill">Vision {snapshot.vision.size}x{snapshot.vision.size}</span>
          <span className="status-pill">Hostiles {Object.keys(snapshot.monsters).length}</span>
        </div>
      </div>

      <div className="world-field__scene">
        <article className="world-field__objective">
          <div className="panel-title">Field directive</div>
          <strong>{activeQuest?.label ?? 'Hold the line until the shard resolves.'}</strong>
          <p>{activeQuest?.progress ?? 'No active objective yet. Stay mobile and read the field.'}</p>
        </article>

        <article className="world-field__objective world-field__objective--terrain">
          <div className="panel-title">Current ground</div>
          <strong>{currentTerrain.label}</strong>
          <p>{currentTerrain.summary}</p>
        </article>
      </div>

      <div className="world-field__legend" aria-label="Terrain legend">
        {LEGEND_ORDER.map((terrainId) => (
          <div className="world-legend-item" key={terrainId}>
            <span className={`world-legend-item__swatch world-legend-item__swatch--${terrainId}`} />
            <span>{TERRAIN_DETAILS[terrainId].label}</span>
          </div>
        ))}
      </div>

      <div
        className="world-grid"
        style={{
          gridTemplateColumns: `repeat(${maxX - minX + 1}, minmax(0, 1fr))`,
        }}
      >
        {cells}
      </div>
    </section>
  );
}
