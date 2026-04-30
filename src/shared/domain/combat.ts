export type DefenseType = 'ac' | 'fortitude' | 'reflex' | 'will';
export type CombatStatus = 'active' | 'won' | 'lost' | 'escaped';

export interface CombatLogEntry {
  round: number;
  text: string;
  kind?: 'system' | 'initiative' | 'roll' | 'effect' | 'reward';
}

export type EncounterCombatantKind = 'hero' | 'monster';

export interface EncounterCombatant {
  id: string;
  kind: EncounterCombatantKind;
  name: string;
  initiativeModifier: number;
  currentHp: number;
  maxHp: number;
  attackBonus: number;
  damageDice: string;
  damageBonus: number;
  targetDefense: DefenseType;
  weaponLabel?: string;
  weaponEnhancement?: number;
  criticalRangeMin?: number;
  criticalMultiplier?: number;
  weaponModifiers?: string[];
  alignment?: string;
  minimumEnhancementToHit?: number;
  defenses: {
    ac: number;
    fortitude: number;
    reflex: number;
    will: number;
  };
  encounterPowerUsed?: boolean;
}

export interface EncounterOverride {
  actorId: string;
  command: string;
  queuedAt: string;
}

export interface EncounterRewards {
  xp: number;
  gold: number;
  lootItemIds: string[];
}

export interface EncounterSnapshot {
  id: string;
  status: CombatStatus;
  round: number;
  nextRoundAt: string;
  logs: CombatLogEntry[];
  characterId?: string;
  monsterId?: string;
  monsterName?: string;
  combatants: EncounterCombatant[];
  initiativeOrder: string[];
  queuedOverrides: EncounterOverride[];
  rewards: EncounterRewards;
}
