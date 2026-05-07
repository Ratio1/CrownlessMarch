import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('play layout UI', () => {
  it('keeps the main field view focused on map, D20 log, movement, notes, and commands', () => {
    const shellSource = readSource('src/components/game/GameShell.tsx');
    const worldFieldSource = readSource('src/components/game/WorldField.tsx');
    const combatLogSource = readSource('src/components/game/CombatLogPanel.tsx');
    const globalCss = readSource('app/globals.css');

    expect(shellSource).toContain('<WorldField snapshot={snapshot} revealFog={revealFog} />');
    expect(shellSource).toContain('<CombatLogPanel');
    expect(shellSource).toContain('<CommandPanel');
    expect(shellSource).toContain('<MovementPad');
    expect(shellSource).not.toContain('ShortCharacterPanel');
    expect(shellSource).not.toContain('<InfoTabs');
    expect(shellSource).toContain("type GameView = 'field' | 'character' | 'quests';");
    expect(shellSource).toContain('Character Sheet');
    expect(shellSource).toContain('aria-label="Primary play tabs"');
    expect(shellSource).toContain("ArrowUp: 'north'");
    expect(shellSource).toContain('revealFog');
    expect(shellSource).toContain('Beta Max View');
    expect(worldFieldSource).toContain('world-field__fight-banner');
    expect(worldFieldSource).toContain('FieldNotesPanel');
    expect(worldFieldSource).toContain('field-notes');
    expect(worldFieldSource).not.toContain('Field directive');
    expect(worldFieldSource).not.toContain('Current ground');
    expect(worldFieldSource).not.toContain('Trail state');
    expect(worldFieldSource).not.toContain('Objective target');
    expect(worldFieldSource).not.toContain('Threats in sight');
    expect(worldFieldSource).not.toContain('Allies in sight');
    expect(worldFieldSource).not.toContain('Terrain legend');
    expect(combatLogSource).toContain('D20 Rolls');
    expect(combatLogSource).not.toContain('Dice Log');
    expect(globalCss).toContain('.play-sidebar,\n.play-controls,\n.play-panel,\n.command-panel');
    expect(globalCss).toContain('min-width: 0;');
    expect(globalCss).toContain('.dpad button {\n  width: 100%;');
    expect(globalCss).toContain('.play-tabs');
    expect(globalCss).toContain('.field-notes');
    expect(globalCss).toContain('@media (max-width: 720px)');
    expect(globalCss).toContain('.command-panel__form {\n    grid-template-columns: 1fr;');
  });
});
