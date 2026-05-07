import { buildWorldRenderModel, shortMarkerLabel } from '../../src/components/game/world-render-model';
import type { GameplayShardSnapshot } from '../../src/shared/gameplay';

function createSnapshot(): GameplayShardSnapshot {
  return {
    regionId: 'briar-march',
    position: { x: 5, y: 5 },
    vision: {
      radius: 1,
      size: 3,
    },
    currentTile: {
      x: 5,
      y: 5,
      kind: 'grass',
      blocked: false,
    },
    visibleTiles: [
      { x: 4, y: 4, kind: 'forest', blocked: true },
      { x: 5, y: 4, kind: 'grass', blocked: false },
      { x: 6, y: 4, kind: 'mud', blocked: false },
      { x: 4, y: 5, kind: 'forest', blocked: true },
      { x: 5, y: 5, kind: 'grass', blocked: false },
      { x: 6, y: 5, kind: 'stone', blocked: true },
      { x: 4, y: 6, kind: 'stone', blocked: true },
      { x: 5, y: 6, kind: 'grass', blocked: false },
      { x: 6, y: 6, kind: 'grass', blocked: false },
    ],
    maximumVision: {
      radius: 2,
      size: 5,
    },
    maximumVisibleTiles: [
      { x: 3, y: 3, kind: 'grass', blocked: false },
      { x: 4, y: 3, kind: 'grass', blocked: false },
      { x: 5, y: 3, kind: 'grass', blocked: false },
      { x: 6, y: 3, kind: 'forest', blocked: true },
      { x: 7, y: 3, kind: 'mud', blocked: false },
      { x: 3, y: 4, kind: 'grass', blocked: false },
      { x: 4, y: 4, kind: 'forest', blocked: true },
      { x: 5, y: 4, kind: 'grass', blocked: false },
      { x: 6, y: 4, kind: 'mud', blocked: false },
      { x: 7, y: 4, kind: 'grass', blocked: false },
      { x: 3, y: 5, kind: 'grass', blocked: false },
      { x: 4, y: 5, kind: 'forest', blocked: true },
      { x: 5, y: 5, kind: 'grass', blocked: false },
      { x: 6, y: 5, kind: 'stone', blocked: true },
      { x: 7, y: 5, kind: 'mud', blocked: false },
      { x: 3, y: 6, kind: 'stone', blocked: true },
      { x: 4, y: 6, kind: 'stone', blocked: true },
      { x: 5, y: 6, kind: 'grass', blocked: false },
      { x: 6, y: 6, kind: 'grass', blocked: false },
      { x: 7, y: 6, kind: 'grass', blocked: false },
      { x: 3, y: 7, kind: 'grass', blocked: false },
      { x: 4, y: 7, kind: 'grass', blocked: false },
      { x: 5, y: 7, kind: 'grass', blocked: false },
      { x: 6, y: 7, kind: 'stone', blocked: true },
      { x: 7, y: 7, kind: 'grass', blocked: false },
    ],
    characters: {
      hero: {
        cid: 'hero-cid',
        name: 'Mossblade',
        classId: 'fighter',
        position: { x: 5, y: 5 },
      },
      ally: {
        cid: 'ally-cid',
        name: 'Reed Warden',
        classId: 'cleric',
        position: { x: 5, y: 4 },
      },
    },
    monsters: {
      goblin: {
        id: 'goblin-1',
        label: 'Briar Goblin',
        position: { x: 6, y: 4 },
        behavior: 'ambush',
        level: 1,
      },
    },
    maximumMonsters: {
      goblin: {
        id: 'goblin-1',
        label: 'Briar Goblin',
        position: { x: 6, y: 4 },
        behavior: 'ambush',
        level: 1,
      },
      wolf: {
        id: 'wolf-1',
        label: 'Sap Wolf',
        position: { x: 7, y: 5 },
        behavior: 'skirmisher',
        level: 2,
      },
    },
    character: {
      cid: 'hero-cid',
      name: 'Mossblade',
      classId: 'fighter',
      classLabel: 'Fighter',
      passive: 'Guarded Step',
      encounterAbility: 'Shield Bash',
      utilityAbility: 'Second Wind',
      level: 1,
      realLevel: 1,
      currentLevel: 1,
      xp: 0,
      gold: 7,
      hitPoints: { current: 24, max: 24, bloodied: 12 },
      defenses: { armorClass: 15, fortitude: 13, reflex: 11, will: 12 },
      attributes: {
        strength: 15,
        dexterity: 13,
        constitution: 12,
        intelligence: 10,
        wisdom: 10,
        charisma: 8,
      },
      position: { x: 5, y: 5 },
      actions: [],
      inventory: [],
      equipment: [],
      unlocks: [],
      completedQuests: [],
      quests: [
        {
          id: 'survey-the-briar-edge',
          label: 'Survey the Briar Edge',
          objective: 'Reach the Ember Shrine east of town.',
          rewardXp: 25,
          status: 'active',
          progress: 'Push east from the town hearth.',
        },
      ],
    },
    objectiveFocus: {
      label: 'Survey the Briar Edge',
      detail: 'Reach the Ember Shrine east of town.',
      stateLabel: 'March to shrine',
      target: { x: 6, y: 6 },
      terrain: 'grass',
    },
    encounter: null,
    movementLocked: false,
    activityLog: [],
  };
}

describe('world render model', () => {
  it('builds stable bounds and row-major cells for the max fog frame', () => {
    const model = buildWorldRenderModel(createSnapshot());

    expect(model.bounds).toEqual({
      minX: 3,
      maxX: 7,
      minY: 3,
      maxY: 7,
      columns: 5,
      rows: 5,
    });
    expect(model.activeQuest?.id).toBe('survey-the-briar-edge');
    expect(model.currentTerrain.label).toBe('Grass');
    expect(model.cells).toHaveLength(25);
    expect(model.cells[0]?.key).toBe('3:3');
    expect(model.cells.find((cell) => cell.key === '5:5')?.isCurrent).toBe(true);
    expect(model.cells.find((cell) => cell.key === '6:6')?.isObjectiveTarget).toBe(true);
    expect(model.cells.find((cell) => cell.key === '6:5')?.tile.blocked).toBe(true);
    expect(model.cells.find((cell) => cell.key === '6:4')?.monster?.label).toBe('Briar Goblin');
    expect(model.cells.find((cell) => cell.key === '6:4')?.monsterRole).toBe('visible-threat');
    expect(model.cells.find((cell) => cell.key === '5:4')?.character?.name).toBe('Reed Warden');
    expect(model.cells.find((cell) => cell.key === '5:4')?.characterRole).toBe('ally');
    expect(model.cells.find((cell) => cell.key === '5:5')?.characterRole).toBe('hero');
    expect(model.cells.find((cell) => cell.key === '3:3')?.fogged).toBe(true);
    expect(model.cells.find((cell) => cell.key === '5:5')?.fogged).toBe(false);
  });

  it('reveals max-view monsters when the beta fog override is active', () => {
    const model = buildWorldRenderModel(createSnapshot(), { revealFog: true });

    expect(model.cells.find((cell) => cell.key === '7:5')?.fogged).toBe(false);
    expect(model.cells.find((cell) => cell.key === '7:5')?.monster?.label).toBe('Sap Wolf');
  });

  it('marks the current encounter monster as the active threat for stronger rendering', () => {
    const snapshot = createSnapshot();
    snapshot.position = { x: 6, y: 4 };
    snapshot.currentTile = { x: 6, y: 4, kind: 'mud', blocked: false };
    snapshot.character.position = { x: 6, y: 4 };
    snapshot.characters.hero.position = { x: 6, y: 4 };
    snapshot.objectiveFocus = null;
    snapshot.encounter = {
      id: 'encounter-1',
      status: 'active',
      round: 2,
      nextRoundAt: '2026-05-06T10:00:00.000Z',
      logs: [],
      characterId: 'hero-cid',
      monsterId: 'briar-goblin',
      monsterName: 'Briar Goblin',
      combatants: [],
      initiativeOrder: [],
      queuedOverrides: [],
      rewards: { xp: 40, gold: 6, lootItemIds: [] },
    };

    const model = buildWorldRenderModel(snapshot);
    const activeThreatCell = model.cells.find((cell) => cell.monster?.label === 'Briar Goblin');

    expect(activeThreatCell?.monsterRole).toBe('active-threat');
    expect(activeThreatCell?.threatLabel).toBe('LV 1 ACTIVE');
    expect(activeThreatCell?.characterRole).toBe('hero');
  });

  it('builds compact token labels from multi-word names', () => {
    expect(shortMarkerLabel('Briar Goblin', 'MN')).toBe('BG');
    expect(shortMarkerLabel('Mossblade', 'ME')).toBe('M');
    expect(shortMarkerLabel('', 'ME')).toBe('ME');
  });
});
