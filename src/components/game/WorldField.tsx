'use client';

import type { GameplayShardSnapshot } from '@/shared/gameplay';

interface WorldFieldProps {
  snapshot: GameplayShardSnapshot | null;
}

function tileAt(snapshot: GameplayShardSnapshot, x: number, y: number) {
  return snapshot.visibleTiles.find((entry) => entry.x === x && entry.y === y) ?? null;
}

function characterAt(snapshot: GameplayShardSnapshot, x: number, y: number) {
  return Object.values(snapshot.characters).find((entry) => entry.position.x === x && entry.position.y === y) ?? null;
}

function monsterAt(snapshot: GameplayShardSnapshot, x: number, y: number) {
  return Object.values(snapshot.monsters).find((entry) => entry.position.x === x && entry.position.y === y) ?? null;
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
  const cells = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const tile = tileAt(snapshot, x, y);
      const character = characterAt(snapshot, x, y);
      const monster = monsterAt(snapshot, x, y);

      if (!tile) {
        continue;
      }

      cells.push(
        <article
          className={`world-tile world-tile--${tile.kind}${tile.blocked ? ' world-tile--blocked' : ''}`}
          key={`${x}:${y}`}
        >
          <span className="world-tile__coords">
            {x}, {y}
          </span>
          <div className="world-tile__occupants">
            {monster ? <span className="world-token world-token--monster">{monster.label}</span> : null}
            {character ? (
              <span
                className={
                  character.cid === snapshot.character.cid ? 'world-token world-token--hero' : 'world-token world-token--ally'
                }
              >
                {character.name ?? character.cid}
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
          <span className="status-pill">Ground {snapshot.currentTile.kind}</span>
          <span className="status-pill">Vision {snapshot.vision.size}x{snapshot.vision.size}</span>
          <span className="status-pill">Hostiles {Object.keys(snapshot.monsters).length}</span>
        </div>
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
