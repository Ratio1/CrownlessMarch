import type { EncounterCombatant, EncounterOverride, EncounterSnapshot } from '@/shared/domain/combat';
import { rollInitiativeOrder } from '@/server/combat/initiative';

export const ROUND_CADENCE_MS = 2_000;

interface HydrateOptions {
  random?: () => number;
}

export interface AdvanceEncounterOptions extends HydrateOptions {
  now: Date;
}

const DEFAULT_MONSTER_NAME = 'Briar Goblin';
const DEFAULT_HERO_NAME = 'Adventurer';

export function hydrateEncounterSnapshot(
  encounter: EncounterSnapshot,
  options?: HydrateOptions
): EncounterSnapshot {
  const random = options?.random ?? Math.random;
  const combatants = ensureCombatants(encounter);
  const initiativeOrder = hasValidInitiativeOrder(encounter.initiativeOrder, combatants)
    ? encounter.initiativeOrder
    : rollInitiativeOrder(combatants, random).map((entry) => entry.id);
  const queuedOverrides = encounter.queuedOverrides ?? [];

  return {
    ...encounter,
    combatants,
    initiativeOrder,
    queuedOverrides
  };
}

export function advanceEncounterSnapshot(
  encounter: EncounterSnapshot,
  options: AdvanceEncounterOptions
): EncounterSnapshot {
  const hydrated = hydrateEncounterSnapshot(encounter, options);
  if (hydrated.status !== 'active') {
    return hydrated;
  }

  const nowMs = options.now.getTime();
  let current = hydrated;

  while (current.status === 'active' && nowMs >= toTimestamp(current.nextRoundAt)) {
    current = processRound(current);
  }

  return current;
}

function processRound(encounter: EncounterSnapshot): EncounterSnapshot {
  const combatants = encounter.combatants ?? [];
  const initiativeOrder = encounter.initiativeOrder ?? [];
  const round = encounter.round;
  const logs = [...encounter.logs];
  let queuedOverrides = [...(encounter.queuedOverrides ?? [])];
  let status = encounter.status;

  for (const actorId of initiativeOrder) {
    const actor = combatants.find((entry) => entry.id === actorId);
    if (!actor) {
      continue;
    }

    if (actor.kind === 'hero') {
      const overrideIndex = queuedOverrides.findIndex((entry) => entry.actorId === actor.id);
      if (overrideIndex >= 0) {
        const [override] = queuedOverrides.splice(overrideIndex, 1);
        const outcome = applyOverride(actor, round, override);
        logs.push(outcome.log);
        if (outcome.status) {
          status = outcome.status;
          break;
        }
        continue;
      }

      logs.push({
        round,
        text: `${actor.name} attacks.`
      });
      continue;
    }

    logs.push({
      round,
      text: `${actor.name} strikes back.`
    });
  }

  return {
    ...encounter,
    status,
    round: encounter.round + 1,
    nextRoundAt: new Date(toTimestamp(encounter.nextRoundAt) + ROUND_CADENCE_MS).toISOString(),
    logs,
    queuedOverrides
  };
}

function applyOverride(actor: EncounterCombatant, round: number, override: EncounterOverride) {
  const normalizedCommand = override.command.trim().toLowerCase();
  if (normalizedCommand === 'escape') {
    return {
      log: { round, text: `${actor.name} uses ${override.command} and escapes.` },
      status: 'escaped' as const
    };
  }

  return {
    log: { round, text: `${actor.name} uses ${override.command}.` },
    status: null
  };
}

function ensureCombatants(encounter: EncounterSnapshot): EncounterCombatant[] {
  if (encounter.combatants?.length) {
    return encounter.combatants;
  }

  const characterId = encounter.characterId ?? encounter.id;
  const heroId = `hero:${characterId}`;
  return [
    {
      id: heroId,
      kind: 'hero',
      name: DEFAULT_HERO_NAME,
      initiativeModifier: 2
    },
    {
      id: 'monster:briar-goblin',
      kind: 'monster',
      name: inferMonsterName(encounter.logs),
      initiativeModifier: 1
    }
  ];
}

function inferMonsterName(logs: Array<{ text: string }>): string {
  const introLog = logs.find((entry) => entry.text.includes('lunges from'));
  if (!introLog) {
    return DEFAULT_MONSTER_NAME;
  }

  const match = introLog.text.match(/A\s+(.+?)\s+lunges from/i);
  if (!match?.[1]) {
    return DEFAULT_MONSTER_NAME;
  }

  return match[1].trim();
}

function hasValidInitiativeOrder(
  initiativeOrder: string[] | undefined,
  combatants: EncounterCombatant[]
): initiativeOrder is string[] {
  if (!initiativeOrder?.length) {
    return false;
  }
  if (initiativeOrder.length !== combatants.length) {
    return false;
  }
  const allCombatantIds = new Set(combatants.map((entry) => entry.id));
  return initiativeOrder.every((entry) => allCombatantIds.has(entry));
}

function toTimestamp(value: string) {
  return new Date(value).getTime();
}
