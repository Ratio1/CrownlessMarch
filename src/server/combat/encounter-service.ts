import { randomUUID } from 'node:crypto';
import { advanceEncounterSnapshot, hydrateEncounterSnapshot, ROUND_CADENCE_MS } from '@/server/combat/engine';
import { getCStore } from '@/server/platform/cstore';
import type { EncounterSnapshot } from '@/shared/domain/combat';
import { keys } from '@/shared/persistence/keys';

const DEFAULT_MONSTER_NAME = 'Briar Goblin';
const DEFAULT_TILE_KIND = 'wilds';

export class EncounterServiceError extends Error {
  constructor(readonly code: 'ENCOUNTER_NOT_FOUND' | 'INVALID_OVERRIDE', message: string) {
    super(message);
    this.name = 'EncounterServiceError';
  }
}

export interface CreateEncounterInput {
  characterId: string;
  characterName?: string;
  monsterName?: string;
  tileKind?: string;
  encounterId?: string;
}

export async function createEncounter(input: CreateEncounterInput): Promise<EncounterSnapshot> {
  const now = new Date();
  const baseEncounter: EncounterSnapshot = {
    id: input.encounterId ?? randomUUID(),
    characterId: input.characterId,
    status: 'active',
    round: 1,
    nextRoundAt: new Date(now.getTime() + ROUND_CADENCE_MS).toISOString(),
    logs: [
      {
        round: 1,
        text: `A ${input.monsterName ?? DEFAULT_MONSTER_NAME} lunges from the ${input.tileKind ?? DEFAULT_TILE_KIND}.`
      }
    ],
    combatants: [
      {
        id: `hero:${input.characterId}`,
        kind: 'hero',
        name: input.characterName ?? 'Adventurer',
        initiativeModifier: 2
      },
      {
        id: 'monster:briar-goblin',
        kind: 'monster',
        name: input.monsterName ?? DEFAULT_MONSTER_NAME,
        initiativeModifier: 1
      }
    ],
    queuedOverrides: []
  };

  const encounter = hydrateEncounterSnapshot(baseEncounter);
  await getCStore().setJson(keys.encounter(encounter.id), encounter);
  return encounter;
}

export async function getEncounterSnapshot(encounterId: string): Promise<EncounterSnapshot> {
  const encounter = await loadEncounter(encounterId);
  if (!encounter) {
    throw new EncounterServiceError('ENCOUNTER_NOT_FOUND', 'Encounter not found.');
  }

  const hydrated = hydrateEncounterSnapshot(encounter);
  await getCStore().setJson(keys.encounter(hydrated.id), hydrated);
  return hydrated;
}

export async function pollEncounter(encounterId: string, characterId?: string): Promise<EncounterSnapshot> {
  const encounter = await getEncounterSnapshot(encounterId);
  if (characterId && encounter.characterId && encounter.characterId !== characterId) {
    throw new EncounterServiceError('ENCOUNTER_NOT_FOUND', 'Encounter not found.');
  }

  const scopedEncounter: EncounterSnapshot = {
    ...encounter,
    characterId: encounter.characterId ?? characterId
  };
  const advanced = advanceEncounterSnapshot(scopedEncounter, { now: new Date() });
  await getCStore().setJson(keys.encounter(encounterId), advanced);
  return advanced;
}

export interface QueueEncounterOverrideInput {
  command: string;
  characterId?: string;
}

export async function queueEncounterOverride(
  encounterId: string,
  input: QueueEncounterOverrideInput
): Promise<EncounterSnapshot> {
  const command = input.command.trim();
  if (!command) {
    throw new EncounterServiceError('INVALID_OVERRIDE', 'Override command cannot be empty.');
  }

  const encounter = await getEncounterSnapshot(encounterId);
  if (input.characterId && encounter.characterId && encounter.characterId !== input.characterId) {
    throw new EncounterServiceError('ENCOUNTER_NOT_FOUND', 'Encounter not found.');
  }

  const heroActorId = resolveHeroActorId(encounter, input.characterId);
  const queued: EncounterSnapshot = {
    ...encounter,
    characterId: encounter.characterId ?? input.characterId,
    queuedOverrides: [
      ...(encounter.queuedOverrides ?? []),
      {
        actorId: heroActorId,
        command,
        queuedAt: new Date().toISOString()
      }
    ]
  };

  await getCStore().setJson(keys.encounter(encounterId), queued);
  return queued;
}

async function loadEncounter(encounterId: string): Promise<EncounterSnapshot | null> {
  return getCStore().getJson<EncounterSnapshot>(keys.encounter(encounterId));
}

function resolveHeroActorId(encounter: EncounterSnapshot, characterId?: string) {
  const hero = encounter.combatants?.find((entry) => entry.kind === 'hero');
  if (hero) {
    return hero.id;
  }
  return `hero:${characterId ?? encounter.characterId ?? encounter.id}`;
}
