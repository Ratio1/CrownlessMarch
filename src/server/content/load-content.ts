import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  classSchema,
  alignmentRuleSchema,
  classRuleSchema,
  combatRulesSchema,
  gameRulesSchema,
  itemSchema,
  monsterSchema,
  progressionRulesSchema,
  questSchema,
  regionSchema,
  weaponRuleSchema,
  type ClassRecord,
  type GameRules,
  type ItemRecord,
  type MonsterRecord,
  type QuestRecord,
  type RegionRecord,
} from '../../shared/content/schema';

export interface ContentBundle {
  rules: GameRules;
  classes: ClassRecord[];
  items: ItemRecord[];
  monsters: MonsterRecord[];
  quests: QuestRecord[];
  region: RegionRecord;
}

function hydrateWeaponItems(items: ItemRecord[], rules: GameRules): ItemRecord[] {
  return items.map((item) => {
    if (item.slot !== 'weapon') {
      return item;
    }

    const weaponRule = rules.weapons.find((entry) => entry.weaponType === item.weaponType);
    if (!weaponRule) {
      throw new Error(`Unknown weaponType "${item.weaponType}" on item "${item.id}"`);
    }

    return {
      ...item,
      damage: item.damage ?? weaponRule.damage,
      criticalRangeMin: item.criticalRangeMin ?? weaponRule.criticalRangeMin,
      criticalMultiplier: item.criticalMultiplier ?? weaponRule.criticalMultiplier,
    };
  });
}

function validateContentAgainstRules(bundle: ContentBundle) {
  const alignmentCodes = new Set(bundle.rules.alignments.map((entry) => entry.code));

  for (const item of bundle.items) {
    if (item.bonus > bundle.rules.combat.maxWeaponEnhancement) {
      throw new Error(`Item "${item.id}" exceeds max weapon enhancement +${bundle.rules.combat.maxWeaponEnhancement}`);
    }
  }

  for (const monster of bundle.monsters) {
    if (!alignmentCodes.has(monster.alignment)) {
      throw new Error(`Monster "${monster.id}" uses unknown alignment "${monster.alignment}"`);
    }

    if (monster.minimumEnhancementToHit > bundle.rules.combat.maxBossMinimumEnhancementToHit) {
      throw new Error(
        `Monster "${monster.id}" exceeds max boss enhancement gate +${bundle.rules.combat.maxBossMinimumEnhancementToHit}`
      );
    }
  }
}

export async function loadContentBundle(rootDir: string): Promise<ContentBundle> {
  const readJson = async <Schema extends z.ZodTypeAny>(relativePath: string, schema: Schema): Promise<z.infer<Schema>> => {
    const raw = await readFile(path.join(rootDir, relativePath), 'utf8');
    return schema.parse(JSON.parse(raw));
  };

  const rules = gameRulesSchema.parse({
    progression: await readJson('content/rules/progression.json', progressionRulesSchema),
    classes: await readJson('content/rules/classes.json', z.array(classRuleSchema)),
    weapons: await readJson('content/rules/weapons.json', z.array(weaponRuleSchema)),
    combat: await readJson('content/rules/combat.json', combatRulesSchema),
    alignments: await readJson('content/rules/alignments.json', z.array(alignmentRuleSchema)),
  });
  const items = hydrateWeaponItems(await readJson('content/items.json', z.array(itemSchema)), rules);
  const bundle: ContentBundle = {
    rules,
    classes: await readJson('content/classes.json', z.array(classSchema)),
    items,
    monsters: await readJson('content/monsters.json', z.array(monsterSchema)),
    quests: await readJson('content/quests.json', z.array(questSchema)),
    region: await readJson('content/regions/briar-march.json', regionSchema),
  };

  validateContentAgainstRules(bundle);

  return bundle;
}
