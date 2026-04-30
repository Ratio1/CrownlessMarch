import { z } from 'zod';
import { attributes, characterClasses } from '../domain/types';

export const alignments = ['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'] as const;
export const weaponTypes = [
  'dagger',
  'club',
  'quarterstaff',
  'mace',
  'longsword',
  'scimitar',
  'warhammer',
  'bastard-sword',
  'katana',
  'greatsword',
] as const;
export const weaponModifiers = ['holy'] as const;

export const classSchema = z.object({
  id: z.enum(characterClasses),
  label: z.string(),
  primaryAttributes: z.array(z.enum(attributes)).min(1),
  passive: z.string(),
  encounterAbility: z.string(),
  utilityAbility: z.string(),
});

export const itemSchema = z
  .object({
    id: z.string(),
    slot: z.enum(['weapon', 'armor', 'shield', 'consumable']),
    label: z.string(),
    bonus: z.number().int().min(0).max(5),
    effect: z.string(),
    weaponType: z.enum(weaponTypes).optional(),
    damage: z.string().optional(),
    criticalRangeMin: z.number().int().min(18).max(20).optional(),
    criticalMultiplier: z.union([z.literal(2), z.literal(3)]).optional(),
    modifiers: z.array(z.enum(weaponModifiers)).default([]),
  })
  .superRefine((item, context) => {
    if (item.slot !== 'weapon') {
      return;
    }

    for (const field of ['weaponType', 'damage', 'criticalRangeMin', 'criticalMultiplier'] as const) {
      if (item[field] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `weapon items must define ${field}`,
        });
      }
    }
  });

export const monsterSchema = z
  .object({
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
    alignment: z.enum(alignments).default('N'),
    minimumEnhancementToHit: z.number().int().min(0).max(3).default(0),
    vulnerabilities: z.array(z.enum(weaponModifiers)).default([]),
  })
  .superRefine((monster, context) => {
    if (monster.minimumEnhancementToHit > 0 && monster.behavior !== 'boss') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minimumEnhancementToHit'],
        message: 'only boss monsters may require minimum weapon enhancement',
      });
    }
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
export type AlignmentCode = (typeof alignments)[number];
export type ItemRecord = z.infer<typeof itemSchema>;
export type MonsterRecord = z.infer<typeof monsterSchema>;
export type QuestRecord = z.infer<typeof questSchema>;
export type RegionRecord = z.infer<typeof regionSchema>;
