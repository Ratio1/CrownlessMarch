import { z } from 'zod';
import { attributes, characterClasses } from '../domain/types';

export const alignments = ['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'] as const;
export const defenseTypes = ['ac', 'fortitude', 'reflex', 'will'] as const;
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

export const characterActionSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['at-will', 'encounter', 'daily', 'utility']),
  description: z.string(),
});

export const progressionRulesSchema = z
  .object({
    maxLevel: z.number().int().positive(),
    xpLevelTable: z.array(z.number().int().min(0)).min(1),
    targetXpPerHour: z.number().positive(),
  })
  .superRefine((rules, context) => {
    if (rules.xpLevelTable.length !== rules.maxLevel) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['xpLevelTable'],
        message: 'XP level table must contain one entry per level',
      });
    }

    for (let index = 1; index < rules.xpLevelTable.length; index += 1) {
      if (rules.xpLevelTable[index] <= rules.xpLevelTable[index - 1]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['xpLevelTable', index],
          message: 'XP level table must strictly increase after level 1',
        });
      }
    }
  });

export const classRuleSchema = z
  .object({
    id: z.enum(characterClasses),
    attackAbility: z.enum(attributes),
    targetDefense: z.enum(defenseTypes),
    attackProgression: z.array(z.number().int().min(0)),
    hitPoints: z.number().int().positive(),
    healingSurges: z.number().int().nonnegative(),
    speed: z.number().int().positive(),
    armorClassBonus: z.number().int().nonnegative(),
    defaultDamageDice: z.string(),
    actions: z.array(characterActionSchema).min(1),
  })
  .superRefine((rule, context) => {
    if (rule.attackProgression.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attackProgression'],
        message: 'class attack progression must contain at least one level',
      });
    }
  });

export const weaponRuleSchema = z.object({
  weaponType: z.enum(weaponTypes),
  label: z.string(),
  category: z.string(),
  damage: z.string(),
  criticalRangeMin: z.number().int().min(18).max(20),
  criticalMultiplier: z.union([z.literal(2), z.literal(3)]),
});

export const combatRulesSchema = z.object({
  maxWeaponEnhancement: z.number().int().min(0),
  maxBossMinimumEnhancementToHit: z.number().int().min(0),
  holyDamageMultiplier: z.number().int().min(1),
  criticalConfirmation: z.boolean(),
  naturalOneAlwaysMisses: z.boolean(),
  naturalTwentyAlwaysHits: z.boolean(),
});

export const alignmentRuleSchema = z.object({
  code: z.enum(alignments),
  label: z.string(),
  evil: z.boolean(),
});

export const gameRulesSchema = z
  .object({
    progression: progressionRulesSchema,
    classes: z.array(classRuleSchema),
    weapons: z.array(weaponRuleSchema),
    combat: combatRulesSchema,
    alignments: z.array(alignmentRuleSchema),
  })
  .superRefine((rules, context) => {
    const classIds = new Set(rules.classes.map((entry) => entry.id));
    for (const classId of characterClasses) {
      if (!classIds.has(classId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['classes'],
          message: `missing class rules for ${classId}`,
        });
      }
    }

    for (const classRule of rules.classes) {
      if (classRule.attackProgression.length !== rules.progression.maxLevel) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['classes', classRule.id, 'attackProgression'],
          message: 'class attack progression must contain one entry per level',
        });
      }
    }

    const weaponIds = new Set(rules.weapons.map((entry) => entry.weaponType));
    for (const weaponType of weaponTypes) {
      if (!weaponIds.has(weaponType)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['weapons'],
          message: `missing weapon rules for ${weaponType}`,
        });
      }
    }

    const alignmentCodes = new Set(rules.alignments.map((entry) => entry.code));
    for (const alignment of alignments) {
      if (!alignmentCodes.has(alignment)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['alignments'],
          message: `missing alignment rules for ${alignment}`,
        });
      }
    }
  });

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

    for (const field of ['weaponType'] as const) {
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
export type DefenseCode = (typeof defenseTypes)[number];
export type ItemRecord = z.infer<typeof itemSchema>;
export type MonsterRecord = z.infer<typeof monsterSchema>;
export type QuestRecord = z.infer<typeof questSchema>;
export type RegionRecord = z.infer<typeof regionSchema>;
export type ProgressionRules = z.infer<typeof progressionRulesSchema>;
export type ClassRuleRecord = z.infer<typeof classRuleSchema>;
export type WeaponRuleRecord = z.infer<typeof weaponRuleSchema>;
export type CombatRules = z.infer<typeof combatRulesSchema>;
export type AlignmentRuleRecord = z.infer<typeof alignmentRuleSchema>;
export type GameRules = z.infer<typeof gameRulesSchema>;
