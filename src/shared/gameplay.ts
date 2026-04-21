export type GameplayDirection = 'north' | 'south' | 'west' | 'east';

export interface GameplayCharacterSnapshot extends Record<string, unknown> {
  cid: string;
  name?: string;
  position: {
    x: number;
    y: number;
  };
}

export interface GameplayShardSnapshot {
  characters: Record<string, GameplayCharacterSnapshot>;
}

export type GameplaySocketStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';
