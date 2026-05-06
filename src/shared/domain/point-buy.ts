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

export function levelUpAttributePoints(level: number) {
  const normalizedLevel = Math.max(1, Math.floor(level));

  return (
    (normalizedLevel >= 4 ? 1 : 0) +
    (normalizedLevel >= 8 ? 1 : 0) +
    (normalizedLevel >= 14 ? 1 : 0)
  );
}

export function pointBuyBudgetForLevel(level: number) {
  return POINT_BUY_BUDGET + levelUpAttributePoints(level);
}

function pointBuyCost(input: AttributeSet) {
  return attributes.reduce((sum, key) => {
    const value = input[key];
    return sum + (pointCosts[value] ?? Number.POSITIVE_INFINITY);
  }, 0);
}

function canFitWithLevelUpPoints(input: AttributeSet, extraPoints: number) {
  const normalizedExtraPoints = Math.max(0, Math.floor(extraPoints));
  const keys = [...attributes];

  function search(index: number, remaining: number, candidate: AttributeSet): boolean {
    if (index >= keys.length) {
      return pointBuyCost(candidate) <= POINT_BUY_BUDGET;
    }

    const key = keys[index];
    const value = input[key];
    const maxReduction = Math.min(remaining, Math.max(0, value - 8));

    for (let reduction = 0; reduction <= maxReduction; reduction += 1) {
      const nextCandidate = {
        ...candidate,
        [key]: value - reduction,
      };

      if (search(index + 1, remaining - reduction, nextCandidate)) {
        return true;
      }
    }

    return false;
  }

  return search(0, normalizedExtraPoints, { ...input });
}

export function validatePointBuy(input: AttributeSet, budget = POINT_BUY_BUDGET) {
  const spent = pointBuyCost(input);
  const extraPoints = Math.max(0, Math.floor(budget - POINT_BUY_BUDGET));

  return {
    valid:
      Number.isFinite(spent) &&
      (spent <= budget || canFitWithLevelUpPoints(input, extraPoints)),
    spent,
    budget,
    attributes: input,
  };
}

export function buildAttributes(attributesInput: AttributeSet) {
  return { ...attributesInput };
}
