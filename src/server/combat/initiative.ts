export interface InitiativeCombatant {
  id: string;
  name: string;
  initiativeModifier: number;
}

export interface InitiativeRoll extends InitiativeCombatant {
  roll: number;
  total: number;
}

const D20_SIDES = 20;

export function rollInitiativeOrder(
  combatants: InitiativeCombatant[],
  random: () => number = Math.random
): InitiativeRoll[] {
  return combatants
    .map((combatant) => {
      const roll = 1 + Math.floor(random() * D20_SIDES);
      return {
        ...combatant,
        roll,
        total: roll + combatant.initiativeModifier
      };
    })
    .sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }
      if (right.initiativeModifier !== left.initiativeModifier) {
        return right.initiativeModifier - left.initiativeModifier;
      }
      return left.id.localeCompare(right.id);
    });
}
