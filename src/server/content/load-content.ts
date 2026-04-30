import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  classSchema,
  itemSchema,
  monsterSchema,
  questSchema,
  regionSchema,
  type ClassRecord,
  type ItemRecord,
  type MonsterRecord,
  type QuestRecord,
  type RegionRecord,
} from '../../shared/content/schema';

export interface ContentBundle {
  classes: ClassRecord[];
  items: ItemRecord[];
  monsters: MonsterRecord[];
  quests: QuestRecord[];
  region: RegionRecord;
}

export async function loadContentBundle(rootDir: string): Promise<ContentBundle> {
  const readJson = async <Schema extends z.ZodTypeAny>(relativePath: string, schema: Schema): Promise<z.infer<Schema>> => {
    const raw = await readFile(path.join(rootDir, relativePath), 'utf8');
    return schema.parse(JSON.parse(raw));
  };

  return {
    classes: await readJson('content/classes.json', z.array(classSchema)),
    items: await readJson('content/items.json', z.array(itemSchema)),
    monsters: await readJson('content/monsters.json', z.array(monsterSchema)),
    quests: await readJson('content/quests.json', z.array(questSchema)),
    region: await readJson('content/regions/briar-march.json', regionSchema),
  };
}
