import {
  POINT_BUY_BUDGET,
  buildAttributes,
  getDefaultAttributes,
  levelUpAttributePoints,
  validatePointBuy,
} from '../../src/shared/domain/point-buy';

describe('point buy', () => {
  it('starts every ability at 8 with a 30-point pool', () => {
    expect(POINT_BUY_BUDGET).toBe(30);
    expect(getDefaultAttributes()).toEqual({
      strength: 8,
      dexterity: 8,
      constitution: 8,
      intelligence: 8,
      wisdom: 8,
      charisma: 8,
    });

    const allTens = validatePointBuy({
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    });

    expect(allTens).toMatchObject({
      valid: true,
      spent: 12,
      budget: 30,
      remaining: 18,
    });
  });

  it('uses the revised 8-based D20 point-buy cost bands', () => {
    const result = validatePointBuy({
      strength: 18,
      dexterity: 16,
      constitution: 14,
      intelligence: 8,
      wisdom: 8,
      charisma: 8,
    });

    expect(result).toMatchObject({
      valid: false,
      spent: 32,
      budget: 30,
    });

    expect(
      validatePointBuy({
        strength: 18,
        dexterity: 14,
        constitution: 12,
        intelligence: 10,
        wisdom: 8,
        charisma: 8,
      })
    ).toMatchObject({
      valid: true,
      spent: 28,
      remaining: 2,
    });
  });

  it('accepts a valid 30-point build', () => {
    const result = validatePointBuy({
      strength: 15,
      dexterity: 14,
      constitution: 11,
      intelligence: 10,
      wisdom: 9,
      charisma: 8,
    });

    expect(result.valid).toBe(true);
    expect(result.spent).toBe(20);
    expect(buildAttributes(result.attributes)).toMatchObject({
      strength: 15,
      dexterity: 14,
    });
  });

  it('rejects overspent point totals', () => {
    const result = validatePointBuy({
      strength: 18,
      dexterity: 16,
      constitution: 16,
      intelligence: 12,
      wisdom: 10,
      charisma: 10,
    });

    expect(result.valid).toBe(false);
  });

  it('adds beta reset attribute points at levels 4, 8, and 14', () => {
    expect(levelUpAttributePoints(1)).toBe(0);
    expect(levelUpAttributePoints(4)).toBe(1);
    expect(levelUpAttributePoints(8)).toBe(2);
    expect(levelUpAttributePoints(14)).toBe(3);
  });

  it('validates reset builds with level-up ability raises outside the point-buy pool', () => {
    const result = validatePointBuy(
      {
        strength: 15,
        dexterity: 15,
        constitution: 11,
        intelligence: 10,
        wisdom: 9,
        charisma: 8,
      },
      { abilityRaises: levelUpAttributePoints(4) }
    );

    expect(result.valid).toBe(true);
    expect(result.budget).toBe(30);
    expect(result.abilityRaises).toBe(1);
    expect(result.usedAbilityRaises).toBe(0);

    const raisedBeyondPool = validatePointBuy(
      {
        strength: 18,
        dexterity: 14,
        constitution: 14,
        intelligence: 12,
        wisdom: 8,
        charisma: 8,
      },
      { abilityRaises: 1 }
    );

    expect(raisedBeyondPool).toMatchObject({
      valid: true,
      spent: 29,
      budget: 30,
      abilityRaises: 1,
      usedAbilityRaises: 1,
      baseAttributes: expect.objectContaining({
        strength: 17,
      }),
    });
  });
});
