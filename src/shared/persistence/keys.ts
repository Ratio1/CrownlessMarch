export const keys = {
  account: (accountId: string) => `thornwrithe:accounts:${accountId}`,
  character: (characterId: string) => `thornwrithe:characters:${characterId}`,
  session: (sessionId: string) => `thornwrithe:sessions:${sessionId}`,
  presence: (characterId: string) => `thornwrithe:presence:${characterId}`,
  tile: (x: number, y: number) => `thornwrithe:world:tiles:${x}:${y}`,
  mob: (mobId: string) => `thornwrithe:world:mobs:${mobId}`,
  quest: (questStateId: string) => `thornwrithe:world:quests:${questStateId}`,
  encounter: (encounterId: string) => `thornwrithe:combat:encounters:${encounterId}`,
  encounterLog: (encounterId: string) => `thornwrithe:combat:logs:${encounterId}`,
  emailVerification: (token: string) => `thornwrithe:auth:verification:${token}`
};
