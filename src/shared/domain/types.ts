export const attributes = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
export type AttributeName = (typeof attributes)[number];
export type AttributeSet = Record<AttributeName, number>;

export type CharacterClass = 'fighter' | 'rogue' | 'wizard' | 'cleric';

export interface CharacterRecord {
  id: string;
  accountId: string;
  name: string;
  classId: CharacterClass;
  level: number;
  xp: number;
  attributes: AttributeSet;
  position: { x: number; y: number };
  hitPoints: { current: number; max: number };
  inventory: string[];
  equipped: { weapon?: string; armor?: string; shield?: string };
  activeQuestIds: string[];
  activeEncounterId?: string;
}
