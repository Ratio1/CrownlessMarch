import type { GameplayDirection, GameplayMonsterMarker, GameplayShardSnapshot, GameplayTileSnapshot } from '@/shared/gameplay';

const DIRECTIONS: Array<{
  id: GameplayDirection;
  label: string;
  dx: number;
  dy: number;
}> = [
  { id: 'north', label: 'North', dx: 0, dy: -1 },
  { id: 'east', label: 'East', dx: 1, dy: 0 },
  { id: 'south', label: 'South', dx: 0, dy: 1 },
  { id: 'west', label: 'West', dx: -1, dy: 0 },
];

function tileAt(snapshot: GameplayShardSnapshot, x: number, y: number) {
  return snapshot.visibleTiles.find((tile) => tile.x === x && tile.y === y) ?? null;
}

function monsterAt(snapshot: GameplayShardSnapshot, x: number, y: number) {
  return Object.values(snapshot.monsters).find((monster) => monster.position.x === x && monster.position.y === y) ?? null;
}

function describeGround(tile: GameplayTileSnapshot) {
  switch (tile.kind) {
    case 'grass':
    case 'mud':
      return 'green open ground';
    case 'forest':
      return 'trees';
    case 'stone':
      return 'rock';
  }
}

function describeDirection(tile: GameplayTileSnapshot | null, monster: GameplayMonsterMarker | null) {
  if (!tile) {
    return 'unseen';
  }

  if (tile.blocked) {
    return `blocked by ${describeGround(tile)}`;
  }

  if (monster) {
    return `${monster.label} on ${describeGround(tile)}`;
  }

  return describeGround(tile);
}

function buildFieldNotes(snapshot: GameplayShardSnapshot) {
  const notes = DIRECTIONS.map((direction) => {
    const x = snapshot.position.x + direction.dx;
    const y = snapshot.position.y + direction.dy;
    const tile = tileAt(snapshot, x, y);
    const monster = monsterAt(snapshot, x, y);

    return `${direction.label}: ${describeDirection(tile, monster)}.`;
  });
  const latestMove = [...snapshot.activityLog].reverse().find((entry) => entry.kind === 'move')?.text;

  return latestMove ? [latestMove, ...notes] : notes;
}

export function FieldNotesPanel({ snapshot }: { snapshot: GameplayShardSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="field-notes" aria-label="Field notes">
        <div className="panel-title">Field Notes</div>
        <p className="muted">Awaiting the first shard snapshot.</p>
      </section>
    );
  }

  const notes = buildFieldNotes(snapshot);

  return (
    <section className="field-notes" aria-label="Field notes">
      <div className="panel-title">Field Notes</div>
      <ul>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
