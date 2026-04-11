export type DefenseType = 'ac' | 'fortitude' | 'reflex' | 'will';
export type CombatStatus = 'active' | 'won' | 'lost' | 'escaped';

export interface CombatLogEntry {
  round: number;
  text: string;
}

export type EncounterCombatantKind = 'hero' | 'monster';

export interface EncounterCombatant {
  id: string;
  kind: EncounterCombatantKind;
  name: string;
  initiativeModifier: number;
}

export interface EncounterOverride {
  actorId: string;
  command: string;
  queuedAt: string;
}

export interface EncounterSnapshot {
  id: string;
  status: CombatStatus;
  round: number;
  nextRoundAt: string;
  logs: CombatLogEntry[];
  characterId?: string;
  combatants?: EncounterCombatant[];
  initiativeOrder?: string[];
  queuedOverrides?: EncounterOverride[];
}
