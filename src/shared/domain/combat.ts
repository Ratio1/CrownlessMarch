export type DefenseType = 'ac' | 'fortitude' | 'reflex' | 'will';
export type CombatStatus = 'active' | 'won' | 'lost' | 'escaped';

export interface CombatLogEntry {
  round: number;
  text: string;
}

export interface EncounterSnapshot {
  id: string;
  status: CombatStatus;
  round: number;
  nextRoundAt: string;
  logs: CombatLogEntry[];
}
