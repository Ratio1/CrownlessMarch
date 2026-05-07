import { attributes, type AttributeSet } from './types';

const pointCosts: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 6,
  15: 8,
  16: 10,
  17: 13,
  18: 16,
};

export const POINT_BUY_BUDGET = 30;
export const POINT_BUY_MIN_SCORE = 8;
export const POINT_BUY_MAX_SCORE = 18;

export function getDefaultAttributes(): AttributeSet {
  return {
    strength: POINT_BUY_MIN_SCORE,
    dexterity: POINT_BUY_MIN_SCORE,
    constitution: POINT_BUY_MIN_SCORE,
    intelligence: POINT_BUY_MIN_SCORE,
    wisdom: POINT_BUY_MIN_SCORE,
    charisma: POINT_BUY_MIN_SCORE,
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
  void level;
  return POINT_BUY_BUDGET;
}

export function pointBuyCost(input: AttributeSet) {
  return attributes.reduce((sum, key) => {
    const value = input[key];
    return sum + (pointCosts[value] ?? Number.POSITIVE_INFINITY);
  }, 0);
}

export interface PointBuyValidationOptions {
  abilityRaises?: number;
  budget?: number;
}

interface PointBuyFit {
  attributes: AttributeSet;
  spent: number;
  usedAbilityRaises: number;
}

function normalizeValidationOptions(options: PointBuyValidationOptions | number | undefined): Required<PointBuyValidationOptions> {
  if (typeof options === 'number') {
    return {
      budget: POINT_BUY_BUDGET,
      abilityRaises: Math.max(0, Math.floor(options - POINT_BUY_BUDGET)),
    };
  }

  return {
    budget: Math.max(0, Math.floor(options?.budget ?? POINT_BUY_BUDGET)),
    abilityRaises: Math.max(0, Math.floor(options?.abilityRaises ?? 0)),
  };
}

function findBaseAttributesForAbilityRaises(input: AttributeSet, abilityRaises: number, budget: number): PointBuyFit | null {
  const normalizedAbilityRaises = Math.max(0, Math.floor(abilityRaises));
  const keys = [...attributes];
  let best: PointBuyFit | null = null;

  function consider(candidate: AttributeSet) {
    const spent = pointBuyCost(candidate);

    if (!Number.isFinite(spent) || spent > budget) {
      return;
    }

    const usedAbilityRaises = attributes.reduce((sum, key) => sum + Math.max(0, input[key] - candidate[key]), 0);

    if (
      !best ||
      usedAbilityRaises < best.usedAbilityRaises ||
      (usedAbilityRaises === best.usedAbilityRaises && spent > best.spent)
    ) {
      best = {
        attributes: candidate,
        spent,
        usedAbilityRaises,
      };
    }
  }

  function search(index: number, remaining: number, candidate: AttributeSet) {
    if (index >= keys.length) {
      consider(candidate);
      return;
    }

    const key = keys[index];
    const value = input[key];
    const maxReduction = Math.min(remaining, Math.max(0, value - POINT_BUY_MIN_SCORE));

    for (let reduction = 0; reduction <= maxReduction; reduction += 1) {
      const nextCandidate = {
        ...candidate,
        [key]: value - reduction,
      };

      search(index + 1, remaining - reduction, nextCandidate);
    }
  }

  search(0, normalizedAbilityRaises, { ...input });
  return best as PointBuyFit | null;
}

export function validatePointBuy(input: AttributeSet, options?: PointBuyValidationOptions | number) {
  const { budget, abilityRaises } = normalizeValidationOptions(options);
  const scoresInRange = attributes.every((key) => {
    const value = input[key];
    return Number.isInteger(value) && value >= POINT_BUY_MIN_SCORE && value <= POINT_BUY_MAX_SCORE;
  });
  const rawSpent = pointBuyCost(input);
  const bestFit = findBaseAttributesForAbilityRaises(input, abilityRaises, budget);
  const spent = bestFit?.spent ?? rawSpent;

  return {
    valid: scoresInRange && !!bestFit,
    spent,
    rawSpent,
    budget,
    remaining: Number.isFinite(spent) ? Math.max(0, budget - spent) : 0,
    abilityRaises,
    usedAbilityRaises: bestFit?.usedAbilityRaises ?? 0,
    baseAttributes: bestFit?.attributes ?? input,
    attributes: input,
  };
}

export function buildAttributes(attributesInput: AttributeSet) {
  return { ...attributesInput };
}
