import { buildCombatHudModel } from '../../src/components/game/combat-hud-model';
import type { EncounterSnapshot } from '../../src/shared/domain/combat';

function makeEncounter(): EncounterSnapshot {
  return {
    id: 'encounter-1',
    status: 'active',
    round: 3,
    nextRoundAt: '2026-04-24T10:00:00.000Z',
    characterId: 'cid-1',
    monsterId: 'briar-goblin',
    monsterName: 'Briar Goblin',
    combatants: [
      {
        id: 'hero:cid-1',
        kind: 'hero',
        name: 'Mossblade',
        initiativeModifier: 2,
        currentHp: 9,
        maxHp: 15,
        attackBonus: 4,
        damageDice: '1d8',
        damageBonus: 2,
        targetDefense: 'ac',
        defenses: { ac: 14, fortitude: 12, reflex: 12, will: 9 },
      },
      {
        id: 'monster:briar-goblin',
        kind: 'monster',
        name: 'Briar Goblin',
        initiativeModifier: 3,
        currentHp: 5,
        maxHp: 12,
        attackBonus: 2,
        damageDice: '1d4',
        damageBonus: 0,
        targetDefense: 'ac',
        defenses: { ac: 14, fortitude: 12, reflex: 13, will: 11 },
      },
    ],
    initiativeOrder: ['monster:briar-goblin', 'hero:cid-1'],
    queuedOverrides: [
      {
        actorId: 'hero:cid-1',
        command: 'encounter power',
        queuedAt: '2026-04-24T10:00:01.000Z',
      },
    ],
    rewards: {
      xp: 40,
      gold: 6,
      lootItemIds: ['health-potion'],
    },
    logs: [
      { round: 0, text: 'A Briar Goblin stalks the roots.', kind: 'system' },
      { round: 3, text: 'Mossblade queues Shield Rush.', kind: 'effect' },
    ],
  };
}

describe('combat HUD model', () => {
  it('summarizes active combat pressure for the field overlay', () => {
    expect(buildCombatHudModel(makeEncounter())).toEqual({
      statusLabel: 'ACTIVE',
      threatLabel: 'Briar Goblin',
      roundLabel: 'Round 3',
      heroHpLabel: '9/15',
      threatHpLabel: '5/12',
      queueLabel: '1 queued',
      initiativeLabel: 'Briar Goblin > Mossblade',
      heroAttackLabel: 'Hero +4 vs AC 14',
      threatAttackLabel: 'Threat +2 vs AC 14',
      heroDamageLabel: 'Hero 1d8+2',
      threatDamageLabel: 'Threat 1d4',
      queuedActionLabel: 'Queued encounter power',
      latestLog: 'Mossblade queues Shield Rush.',
      isActive: true,
    });
  });

  it('returns null when no encounter is active or recently resolved', () => {
    expect(buildCombatHudModel(null)).toBeNull();
  });
});
