import { attributes, type AttributeSet } from './types';

const pointCosts: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
  16: 12,
  17: 15,
  18: 19,
};

export const POINT_BUY_BUDGET = 22;

export function getDefaultAttributes(): AttributeSet {
  return {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  };
}

export function validatePointBuy(input: AttributeSet) {
  const spent = attributes.reduce((sum, key) => {
    const value = input[key];
    return sum + (pointCosts[value] ?? Number.POSITIVE_INFINITY);
  }, 0);

  return {
    valid: Number.isFinite(spent) && spent <= POINT_BUY_BUDGET,
    spent,
    attributes: input,
  };
}

export function buildAttributes(attributesInput: AttributeSet) {
  return { ...attributesInput };
}
