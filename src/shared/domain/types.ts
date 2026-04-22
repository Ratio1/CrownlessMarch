export interface PresencePosition {
  x: number;
  y: number;
}

export interface PresenceLease {
  current_character_cid: string;
  shard_world_instance_id: string;
  session_host_node_id: string;
  connection_id: string;
  position: PresencePosition | null;
  buffs_debuffs: string[];
  lease_expires_at: string;
  last_persisted_at: string | null;
  persist_revision: number;
}

export const attributes = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

export type AttributeName = (typeof attributes)[number];
export type AttributeSet = Record<AttributeName, number>;

export const characterClasses = ['fighter', 'rogue', 'wizard', 'cleric'] as const;
export type CharacterClass = (typeof characterClasses)[number];

export interface CharacterModifiers extends AttributeSet {}

export interface CharacterDefenses {
  armorClass: number;
  fortitude: number;
  reflex: number;
  will: number;
}

export interface CharacterHitPoints {
  current: number;
  max: number;
  bloodied: number;
}

export interface CharacterAction {
  id: string;
  name: string;
  kind: 'at-will' | 'encounter' | 'daily' | 'utility';
  description: string;
}

export interface DurableCharacterSnapshot {
  name: string;
  classId: CharacterClass;
  level: number;
  xp: number;
  attributes: AttributeSet;
  modifiers: CharacterModifiers;
  defenses: CharacterDefenses;
  hitPoints: CharacterHitPoints;
  healingSurges: number;
  speed: number;
  initiative: number;
  passivePerception: number;
  passiveInsight: number;
  inventory: string[];
  equipment: Record<string, unknown>;
  currency: number;
  gold: number;
  quest_progress: Record<string, unknown>;
  activeQuestIds: string[];
  skills: string[];
  unlocks: string[];
  actions: CharacterAction[];
}

export interface CharacterRecord extends DurableCharacterSnapshot {
  id: string;
  accountId: string;
  position: PresencePosition;
  activeEncounterId?: string;
}
