import { z } from 'zod';
import { attributes, characterClasses } from '../domain/types';

export const classSchema = z.object({
  id: z.enum(characterClasses),
  label: z.string(),
  primaryAttributes: z.array(z.enum(attributes)).min(1),
  passive: z.string(),
  encounterAbility: z.string(),
  utilityAbility: z.string(),
});

export const itemSchema = z.object({
  id: z.string(),
  slot: z.enum(['weapon', 'armor', 'shield', 'consumable']),
  label: z.string(),
  bonus: z.number().int().min(0).max(9),
  effect: z.string(),
});

export const monsterSchema = z.object({
  id: z.string(),
  label: z.string(),
  level: z.number().int().positive(),
  defenses: z.object({
    ac: z.number(),
    fortitude: z.number(),
    reflex: z.number(),
    will: z.number(),
  }),
  hitPoints: z.number().int().positive(),
  attackBonus: z.number(),
  damage: z.object({
    dice: z.string(),
    bonus: z.number(),
  }),
  behavior: z.enum(['bruiser', 'skirmisher', 'caster', 'boss']),
});

export const questSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['scout', 'purge', 'hunt', 'recover', 'escort', 'delivery']),
  objective: z.string(),
  rewardXp: z.number().positive(),
});

export const regionSchema = z.object({
  id: z.literal('briar-march'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  spawn: z.object({ x: z.number().int(), y: z.number().int() }),
  tiles: z.array(
    z.object({
      x: z.number().int(),
      y: z.number().int(),
      kind: z.enum(['town', 'road', 'forest', 'roots', 'ruin', 'shrine', 'water']),
      blocked: z.boolean(),
    })
  ),
});

export type ClassRecord = z.infer<typeof classSchema>;
export type ItemRecord = z.infer<typeof itemSchema>;
export type MonsterRecord = z.infer<typeof monsterSchema>;
export type QuestRecord = z.infer<typeof questSchema>;
export type RegionRecord = z.infer<typeof regionSchema>;
