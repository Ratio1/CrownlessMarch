import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { regionSchema } from '@/shared/content/schema';

export type RegionRecord = ReturnType<typeof regionSchema.parse>;

let cachedStarterRegion: RegionRecord | null = null;

export async function loadStarterRegion(rootDir = process.cwd()): Promise<RegionRecord> {
  if (cachedStarterRegion) {
    return cachedStarterRegion;
  }

  const raw = await readFile(path.join(rootDir, 'content/regions/briar-march.json'), 'utf8');
  cachedStarterRegion = regionSchema.parse(JSON.parse(raw));
  return cachedStarterRegion;
}

export function __resetRegionLoaderForTests() {
  cachedStarterRegion = null;
}
