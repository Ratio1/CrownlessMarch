import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('D20 character sheet UI', () => {
  it('explains ability modifiers, skills, and inventory without placeholder combat features', () => {
    const source = readSource('src/components/game/CharacterPanel.tsx');

    expect(source).toContain('Ability Scores');
    expect(source).toContain('Ability Modifiers');
    expect(source).toContain('D20 Skills');
    expect(source).toContain('Inventory');
    expect(source).toContain('Math.floor((score - 10) / 2)');
    expect(source).toContain('Roll d20');
    expect(source).not.toContain('Actions');
    expect(source).not.toContain('Kit');
    expect(source).not.toContain('Passive:');
    expect(source).not.toContain('Encounter:');
  });
});
