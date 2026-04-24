import type { EncounterCombatant, EncounterSnapshot } from '../../shared/domain/combat';

function findCombatant(encounter: EncounterSnapshot, kind: EncounterCombatant['kind']) {
  return encounter.combatants.find((entry) => entry.kind === kind) ?? null;
}

function hpLabel(combatant: EncounterCombatant | null) {
  return combatant ? `${combatant.currentHp}/${combatant.maxHp}` : 'unknown';
}

export function buildCombatHudModel(encounter: EncounterSnapshot | null) {
  if (!encounter) {
    return null;
  }

  const hero = findCombatant(encounter, 'hero');
  const monster = findCombatant(encounter, 'monster');
  const queuedActions = encounter.queuedOverrides.length;
  const latestLog = encounter.logs[encounter.logs.length - 1]?.text ?? null;

  return {
    statusLabel: encounter.status.toUpperCase(),
    threatLabel: encounter.monsterName ?? monster?.name ?? 'Unknown threat',
    roundLabel: `Round ${encounter.round}`,
    heroHpLabel: hpLabel(hero),
    threatHpLabel: hpLabel(monster),
    queueLabel: queuedActions > 0 ? `${queuedActions} queued` : 'queue open',
    latestLog,
    isActive: encounter.status === 'active',
  };
}
