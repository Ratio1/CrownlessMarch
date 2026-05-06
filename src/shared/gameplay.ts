import type { EncounterSnapshot } from './domain/combat';
import type { AttributeSet, CharacterAction, CharacterDefenses, CharacterHitPoints } from './domain/types';

export type GameplayDirection = 'north' | 'south' | 'west' | 'east';
export type GameplayOverrideCommand = 'encounter power' | 'potion' | 'retreat';
export type GameplayMudCommand = string;

export interface GameplayTileSnapshot {
  x: number;
  y: number;
  kind: 'grass' | 'mud' | 'forest' | 'stone';
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
  status: 'active' | 'ready_to_turn_in' | 'turned_in';
  progress: string;
  completedAt?: string;
}

export interface GameplayObjectiveFocus {
  label: string;
  detail: string;
  stateLabel: string;
  target: {
    x: number;
    y: number;
  };
  terrain: GameplayTileSnapshot['kind'];
}

export interface GameplayActivityEntry {
  id: string;
  text: string;
  kind: 'system' | 'quest' | 'reward' | 'check' | 'move';
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
  realLevel: number;
  currentLevel: number;
  xp: number;
  gold: number;
  hitPoints: CharacterHitPoints;
  defenses: CharacterDefenses;
  attributes: AttributeSet;
  position: {
    x: number;
    y: number;
  };
  actions: CharacterAction[];
  inventory: GameplayInventoryItem[];
  equipment: GameplayEquipmentItem[];
  unlocks: string[];
  quests: GameplayQuestEntry[];
  completedQuests: GameplayQuestEntry[];
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
  currentTile: GameplayTileSnapshot;
  visibleTiles: GameplayTileSnapshot[];
  characters: Record<string, GameplayCharacterMarker>;
  monsters: Record<string, GameplayMonsterMarker>;
  character: GameplayCharacterCard;
  objectiveFocus: GameplayObjectiveFocus | null;
  encounter: EncounterSnapshot | null;
  movementLocked: boolean;
  activityLog: GameplayActivityEntry[];
}

export type GameplaySocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
