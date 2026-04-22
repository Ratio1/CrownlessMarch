import type { EncounterSnapshot } from './domain/combat';
import type { CharacterAction, CharacterDefenses, CharacterHitPoints } from './domain/types';

export type GameplayDirection = 'north' | 'south' | 'west' | 'east';
export type GameplayOverrideCommand = 'encounter power' | 'potion' | 'retreat';

export interface GameplayTileSnapshot {
  x: number;
  y: number;
  kind: 'town' | 'road' | 'forest' | 'roots' | 'ruin' | 'shrine' | 'water';
  blocked: boolean;
}

export interface GameplayCharacterMarker {
  cid: string;
  name?: string;
  classId?: string;
  position: {
    x: number;
    y: number;
  };
}

export interface GameplayMonsterMarker {
  id: string;
  label: string;
  position: {
    x: number;
    y: number;
  };
  behavior: string;
  level: number;
}

export interface GameplayInventoryItem {
  id: string;
  label: string;
  effect: string;
}

export interface GameplayEquipmentItem extends GameplayInventoryItem {
  slot: string;
}

export interface GameplayQuestEntry {
  id: string;
  label: string;
  objective: string;
  rewardXp: number;
}

export interface GameplayCharacterCard {
  cid: string;
  name: string;
  classId: string;
  classLabel: string;
  passive: string;
  encounterAbility: string;
  utilityAbility: string;
  level: number;
  xp: number;
  gold: number;
  hitPoints: CharacterHitPoints;
  defenses: CharacterDefenses;
  position: {
    x: number;
    y: number;
  };
  actions: CharacterAction[];
  inventory: GameplayInventoryItem[];
  equipment: GameplayEquipmentItem[];
  quests: GameplayQuestEntry[];
}

export interface GameplayShardSnapshot {
  regionId: string;
  position: {
    x: number;
    y: number;
  };
  vision: {
    radius: number;
    size: number;
  };
  visibleTiles: GameplayTileSnapshot[];
  characters: Record<string, GameplayCharacterMarker>;
  monsters: Record<string, GameplayMonsterMarker>;
  character: GameplayCharacterCard;
  encounter: EncounterSnapshot | null;
  movementLocked: boolean;
}

export type GameplaySocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
