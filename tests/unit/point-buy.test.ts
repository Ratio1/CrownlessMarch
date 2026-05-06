import { POINT_BUY_BUDGET, buildAttributes, levelUpAttributePoints, pointBuyBudgetForLevel, validatePointBuy } from '../../src/shared/domain/point-buy';

describe('point buy', () => {
  it('accepts a valid 22-point build', () => {
    const result = validatePointBuy({
      strength: 15,
      dexterity: 14,
      constitution: 11,
      intelligence: 10,
      wisdom: 9,
      charisma: 8,
    });

    expect(result.valid).toBe(true);
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
    expect(pointBuyBudgetForLevel(14)).toBe(POINT_BUY_BUDGET + 3);
  });

  it('validates reset builds against the level-adjusted budget', () => {
    const result = validatePointBuy(
      {
        strength: 15,
        dexterity: 15,
        constitution: 11,
        intelligence: 10,
        wisdom: 9,
        charisma: 8,
      },
      pointBuyBudgetForLevel(4)
    );

    expect(result.valid).toBe(true);
    expect(result.budget).toBe(23);
  });
});
