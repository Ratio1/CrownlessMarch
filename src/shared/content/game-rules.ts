import progression from '../../../content/rules/progression.json';
import classes from '../../../content/rules/classes.json';
import weapons from '../../../content/rules/weapons.json';
import combat from '../../../content/rules/combat.json';
import alignments from '../../../content/rules/alignments.json';
import { gameRulesSchema, type ClassRuleRecord, type GameRules, type WeaponRuleRecord } from './schema';
import type { CharacterClass } from '../domain/types';

export const DEFAULT_GAME_RULES: GameRules = gameRulesSchema.parse({
  progression,
  classes,
  weapons,
  combat,
  alignments,
});

export function getClassRule(rules: GameRules, classId: CharacterClass): ClassRuleRecord {
  return rules.classes.find((entry) => entry.id === classId) ?? rules.classes[0];
}

export function getWeaponRule(rules: GameRules, weaponType: string | undefined): WeaponRuleRecord | null {
  if (!weaponType) {
    return null;
  }

  return rules.weapons.find((entry) => entry.weaponType === weaponType) ?? null;
}

export function isEvilAlignment(rules: GameRules, alignment: string | undefined) {
  return !!alignment && rules.alignments.some((entry) => entry.code === alignment && entry.evil);
}
