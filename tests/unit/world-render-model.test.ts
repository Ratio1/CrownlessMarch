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
      kind: 'town',
      blocked: false,
    },
    visibleTiles: [
      { x: 4, y: 4, kind: 'forest', blocked: false },
      { x: 5, y: 4, kind: 'road', blocked: false },
      { x: 6, y: 4, kind: 'roots', blocked: false },
      { x: 4, y: 5, kind: 'forest', blocked: false },
      { x: 5, y: 5, kind: 'town', blocked: false },
      { x: 6, y: 5, kind: 'ruin', blocked: true },
      { x: 4, y: 6, kind: 'water', blocked: true },
      { x: 5, y: 6, kind: 'road', blocked: false },
      { x: 6, y: 6, kind: 'shrine', blocked: false },
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
      terrain: 'shrine',
    },
    encounter: null,
    movementLocked: false,
    activityLog: [],
  };
}

describe('world render model', () => {
  it('builds stable bounds and row-major cells for the visible fog window', () => {
    const model = buildWorldRenderModel(createSnapshot());

    expect(model.bounds).toEqual({
      minX: 4,
      maxX: 6,
      minY: 4,
      maxY: 6,
      columns: 3,
      rows: 3,
    });
    expect(model.activeQuest?.id).toBe('survey-the-briar-edge');
    expect(model.currentTerrain.label).toBe('Town Hearth');
    expect(model.cells).toHaveLength(9);
    expect(model.cells[0]?.key).toBe('4:4');
    expect(model.cells[4]?.isCurrent).toBe(true);
    expect(model.cells[8]?.isObjectiveTarget).toBe(true);
    expect(model.cells[5]?.tile.blocked).toBe(true);
    expect(model.cells[2]?.monster?.label).toBe('Briar Goblin');
    expect(model.cells[2]?.monsterRole).toBe('visible-threat');
    expect(model.cells[1]?.character?.name).toBe('Reed Warden');
    expect(model.cells[1]?.characterRole).toBe('ally');
    expect(model.cells[4]?.characterRole).toBe('hero');
  });

  it('marks the current encounter monster as the active threat for stronger rendering', () => {
    const snapshot = createSnapshot();
    snapshot.position = { x: 6, y: 4 };
    snapshot.currentTile = { x: 6, y: 4, kind: 'roots', blocked: false };
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
