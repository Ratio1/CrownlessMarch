import { buildAttributes, validatePointBuy } from '@/shared/domain/point-buy';

describe('point buy', () => {
  it('accepts a valid 22-point build', () => {
    const result = validatePointBuy({
      strength: 15,
      dexterity: 14,
      constitution: 11,
      intelligence: 10,
      wisdom: 9,
      charisma: 8
    });

    expect(result.valid).toBe(true);
    expect(buildAttributes(result.attributes)).toMatchObject({
      strength: 15,
      dexterity: 14
    });
  });

  it('rejects overspent point totals', () => {
    const result = validatePointBuy({
      strength: 15,
      dexterity: 14,
      constitution: 12,
      intelligence: 10,
      wisdom: 9,
      charisma: 8
    });

    expect(result.valid).toBe(false);
  });

  it('rejects clearly overspent point totals', () => {
    const result = validatePointBuy({
      strength: 18,
      dexterity: 16,
      constitution: 16,
      intelligence: 12,
      wisdom: 10,
      charisma: 10
    });

    expect(result.valid).toBe(false);
  });
});
