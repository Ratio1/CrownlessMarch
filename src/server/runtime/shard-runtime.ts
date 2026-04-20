export interface PresencePosition {
  x: number;
  y: number;
}

export type Direction = 'north' | 'south' | 'west' | 'east';

export interface CharacterSnapshot extends Record<string, unknown> {
  cid: string;
  position: PresencePosition;
}

export interface ShardSnapshot {
  characters: Record<string, CharacterSnapshot>;
}

export interface ShardRuntimeLike {
  addPlayer(character: CharacterSnapshot): void;
  removePlayer(characterId: string): void;
  movePlayer(characterId: string, direction: Direction): void;
  snapshotFor(characterId: string): ShardSnapshot;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizePosition(position: unknown): PresencePosition {
  if (!position || typeof position !== 'object' || Array.isArray(position)) {
    return { x: 0, y: 0 };
  }

  const record = position as Record<string, unknown>;
  const x = typeof record.x === 'number' ? record.x : 0;
  const y = typeof record.y === 'number' ? record.y : 0;

  return { x, y };
}

export class ShardRuntime implements ShardRuntimeLike {
  private readonly players = new Map<string, CharacterSnapshot>();

  addPlayer(character: CharacterSnapshot): void {
    this.players.set(character.cid, clone({ ...character, position: normalizePosition(character.position) }));
  }

  removePlayer(characterId: string): void {
    this.players.delete(characterId);
  }

  movePlayer(characterId: string, direction: Direction): void {
    const current = this.players.get(characterId);

    if (!current) {
      return;
    }

    const next = clone(current);

    switch (direction) {
      case 'north':
        next.position = { x: next.position.x, y: next.position.y - 1 };
        break;
      case 'south':
        next.position = { x: next.position.x, y: next.position.y + 1 };
        break;
      case 'west':
        next.position = { x: next.position.x - 1, y: next.position.y };
        break;
      case 'east':
        next.position = { x: next.position.x + 1, y: next.position.y };
        break;
    }

    this.players.set(characterId, next);
  }

  snapshotFor(_characterId: string): ShardSnapshot {
    return {
      characters: Object.fromEntries(
        Array.from(this.players.entries(), ([characterId, character]) => [characterId, clone(character)])
      ),
    };
  }
}
