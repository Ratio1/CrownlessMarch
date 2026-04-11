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
  18: 19
};

export function validatePointBuy(input: AttributeSet) {
  const spent = attributes.reduce((sum, key) => sum + (pointCosts[input[key]] ?? Number.POSITIVE_INFINITY), 0);
  return {
    valid: Number.isFinite(spent) && spent <= 28,
    spent,
    attributes: input
  };
}

export function buildAttributes(attributes: AttributeSet) {
  return attributes;
}
