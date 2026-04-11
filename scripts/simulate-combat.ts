process.env.THORNWRITHE_USE_IN_MEMORY_CSTORE = '1';

import { createEncounter, pollEncounter, queueEncounterOverride } from '@/server/combat/encounter-service';
import { getCStore } from '@/server/platform/cstore';
import { keys } from '@/shared/persistence/keys';

async function main() {
  const created = await createEncounter({
    characterId: 'sim-character',
    characterName: 'Simblade',
    monsterName: 'Briar Goblin',
    tileKind: 'forest'
  });

  await queueEncounterOverride(created.id, {
    characterId: 'sim-character',
    command: 'escape'
  });

  await forceEncounterDue(created.id);
  const afterFirstTick = await pollEncounter(created.id);

  const output = {
    encounterId: created.id,
    status: afterFirstTick.status,
    round: afterFirstTick.round,
    queuedOverrides: afterFirstTick.queuedOverrides?.length ?? 0,
    logs: afterFirstTick.logs
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

async function forceEncounterDue(encounterId: string) {
  const encounter = await getCStore().getJson(keys.encounter(encounterId));
  if (!encounter) {
    return;
  }
  await getCStore().setJson(keys.encounter(encounterId), {
    ...encounter,
    nextRoundAt: new Date(0).toISOString()
  });
}

void main().catch((error) => {
  process.stderr.write(`simulate-combat failed: ${String(error)}\n`);
  process.exitCode = 1;
});
