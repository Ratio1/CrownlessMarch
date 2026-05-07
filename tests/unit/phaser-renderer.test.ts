import fs from 'node:fs';
import path from 'node:path';

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Phaser renderer configuration', () => {
  it('uses the Canvas renderer so live mobile screenshots capture atlas graphics', () => {
    const source = readSource('src/client/phaser/createGame.ts');

    expect(source).toContain('type: Phaser.CANVAS');
    expect(source).not.toContain('type: Phaser.AUTO');
  });

  it('renders PCs and mobs through generated Phaser sprite textures', () => {
    const source = readSource('src/client/phaser/createGame.ts');

    expect(source).toContain('ensureActorSpriteTextures');
    expect(source).toContain('ensureActorSpriteAnimations');
    expect(source).toContain('scene.add.sprite');
    expect(source).toContain('actorSpriteTextureKey');
    expect(source).toContain('actorSpriteAnimationKey');
    expect(source).toContain('actorSprite.play');
    expect(source).toContain('characterSpriteKey');
    expect(source).toContain('monsterSpriteKey');
  });

  it('renders terrain as a seamless old-school bitmap field instead of separated square tiles', () => {
    const source = readSource('src/client/phaser/createGame.ts');

    expect(source).toContain('const TILE_GAP = 0;');
    expect(source).toContain('WORLD_GRASS_BASE_FILL');
    expect(source).toContain('drawIrregularMudPatch');
    expect(source).toContain('drawSeamlessTerrainPatch');
    expect(source).toContain('drawPixelTerrainDetail');
    expect(source).not.toContain('drawObjectiveTrail');
    expect(source).not.toContain('strokeRoundedRect(x, y, tileSize, tileSize');
    expect(source).not.toContain('fillRoundedRect(x, y, tileSize, tileSize');
  });
});
