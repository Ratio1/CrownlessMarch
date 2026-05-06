import type { EncounterCombatant, EncounterSnapshot } from '../../shared/domain/combat';

function findCombatant(encounter: EncounterSnapshot, kind: EncounterCombatant['kind']) {
  return encounter.combatants.find((entry) => entry.kind === kind) ?? null;
}

function hpLabel(combatant: EncounterCombatant | null) {
  return combatant ? `${combatant.currentHp}/${combatant.maxHp}` : 'unknown';
}

function defenseLabel(defense: EncounterCombatant['targetDefense']) {
  switch (defense) {
    case 'ac':
      return 'AC';
    case 'fortitude':
      return 'Fort';
    case 'reflex':
      return 'Ref';
    case 'will':
      return 'Will';
  }
}

function defenseValue(combatant: EncounterCombatant | null, defense: EncounterCombatant['targetDefense']) {
  return combatant?.defenses[defense] ?? '?';
}

function attackLabel(
  actorLabel: string,
  actor: EncounterCombatant | null,
  target: EncounterCombatant | null
) {
  if (!actor) {
    return `${actorLabel} ?`;
  }

  const targetDefense = actor.targetDefense;
  return `${actorLabel} +${actor.attackBonus} vs ${defenseLabel(targetDefense)} ${defenseValue(target, targetDefense)}`;
}

function damageLabel(actorLabel: string, actor: EncounterCombatant | null) {
  if (!actor) {
    return `${actorLabel} ?`;
  }

  const bonus = actor.damageBonus === 0 ? '' : actor.damageBonus > 0 ? `+${actor.damageBonus}` : String(actor.damageBonus);
  return `${actorLabel} ${actor.damageDice}${bonus}`;
}

function initiativeLabel(encounter: EncounterSnapshot) {
  const combatants = new Map(encounter.combatants.map((entry) => [entry.id, entry.name]));

  return encounter.initiativeOrder.map((id) => combatants.get(id) ?? id).join(' > ') || 'unrolled';
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
    initiativeLabel: initiativeLabel(encounter),
    heroAttackLabel: attackLabel('Hero', hero, monster),
    threatAttackLabel: attackLabel('Threat', monster, hero),
    heroDamageLabel: damageLabel('Hero', hero),
    threatDamageLabel: damageLabel('Threat', monster),
    queuedActionLabel: encounter.queuedOverrides[0]?.command
      ? `Queued ${encounter.queuedOverrides[0].command}`
      : 'No override queued',
    latestLog,
    isActive: encounter.status === 'active',
  };
}
