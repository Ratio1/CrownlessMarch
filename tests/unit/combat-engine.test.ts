/**
 * @jest-environment node
 */
import type { EncounterSnapshot } from '@/shared/domain/combat';
import { rollInitiativeOrder } from '@/server/combat/initiative';
import { ROUND_CADENCE_MS, advanceEncounterSnapshot } from '@/server/combat/engine';

function makeRandom(sequence: number[]) {
  let index = 0;
  return () => {
    const value = sequence[index];
    index += 1;
    return value ?? 0;
  };
}

function buildEncounter(overrides?: Partial<EncounterSnapshot>): EncounterSnapshot {
  return {
    id: 'enc-unit',
    status: 'active',
    round: 1,
    nextRoundAt: new Date('2026-01-01T00:00:02.000Z').toISOString(),
    logs: [{ round: 1, text: 'A Briar Goblin lunges from the roots.' }],
    combatants: [
      {
        id: 'hero:char-1',
        kind: 'hero',
        name: 'Mossblade',
        initiativeModifier: 3
      },
      {
        id: 'monster:briar-goblin',
        kind: 'monster',
        name: 'Briar Goblin',
        initiativeModifier: 1
      }
    ],
    initiativeOrder: ['hero:char-1', 'monster:briar-goblin'],
    queuedOverrides: [],
    ...overrides
  };
}

describe('combat engine', () => {
  it('sorts initiative by total descending with deterministic tie breaks', () => {
    const order = rollInitiativeOrder(
      [
        { id: 'hero:char-1', name: 'Mossblade', initiativeModifier: 3 },
        { id: 'monster:a', name: 'Briar Goblin', initiativeModifier: 3 },
        { id: 'monster:b', name: 'Sap Wolf', initiativeModifier: 0 }
      ],
      makeRandom([0.45, 0.45, 0.95])
    );

    expect(order.map((entry) => entry.id)).toEqual(['monster:b', 'hero:char-1', 'monster:a']);
    expect(order.map((entry) => entry.total)).toEqual([20, 13, 13]);
  });

  it('advances rounds only when cadence is due and schedules the next round +2s', () => {
    const encounter = buildEncounter();

    const beforeDue = advanceEncounterSnapshot(encounter, {
      now: new Date('2026-01-01T00:00:01.999Z')
    });
    expect(beforeDue.round).toBe(1);
    expect(beforeDue.logs).toHaveLength(1);

    const afterDue = advanceEncounterSnapshot(encounter, {
      now: new Date('2026-01-01T00:00:02.000Z')
    });

    expect(afterDue.round).toBe(2);
    expect(afterDue.nextRoundAt).toBe(new Date('2026-01-01T00:00:04.000Z').toISOString());
    expect(afterDue.logs).toHaveLength(3);
    expect(afterDue.logs.at(-2)?.text).toMatch(/Mossblade/);
    expect(afterDue.logs.at(-1)?.text).toMatch(/Briar Goblin/);
    expect(new Date(afterDue.nextRoundAt).getTime() - new Date(encounter.nextRoundAt).getTime()).toBe(
      ROUND_CADENCE_MS
    );
  });
});
