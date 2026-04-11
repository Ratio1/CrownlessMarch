import type { WorldSnapshot } from '@/client/hooks/useGameSnapshot';

export interface ThornwritheGameBridge {
  render(snapshot: WorldSnapshot): void;
  destroy(): void;
}

const TILE_SIZE = 42;
const TILE_GAP = 3;

export async function createGame(container: HTMLElement): Promise<ThornwritheGameBridge> {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'test') {
    return createNoopBridge();
  }

  const Phaser = (await import('phaser')).default;
  const width = Math.max(container.clientWidth, 420);
  const height = Math.max(container.clientHeight, 420);

  let activeScene: any = null;
  let graphics: any = null;
  let pendingSnapshot: WorldSnapshot | null = null;

  const scene = {
    key: 'thornwrithe-world',
    create(this: any) {
      activeScene = this;
      graphics = this.add.graphics();
      if (pendingSnapshot) {
        drawSnapshot(this, graphics, pendingSnapshot);
      }
    }
  };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width,
    height,
    backgroundColor: '#0c120e',
    render: { antialias: false, pixelArt: true },
    scene
  });

  return {
    render(snapshot) {
      pendingSnapshot = snapshot;
      if (!activeScene || !graphics) {
        return;
      }
      drawSnapshot(activeScene, graphics, snapshot);
    },
    destroy() {
      game.destroy(true);
      activeScene = null;
      graphics = null;
      pendingSnapshot = null;
    }
  };
}

function createNoopBridge(): ThornwritheGameBridge {
  return {
    render() {},
    destroy() {}
  };
}

function drawSnapshot(
  scene: any,
  graphics: any,
  snapshot: WorldSnapshot
) {
  graphics.clear();
  graphics.fillStyle(0x0b100d, 1);
  graphics.fillRect(0, 0, scene.scale.width, scene.scale.height);

  const allX = snapshot.visibleTiles.map((tile) => tile.x).concat(snapshot.position.x);
  const allY = snapshot.visibleTiles.map((tile) => tile.y).concat(snapshot.position.y);
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);

  const gridWidth = (maxX - minX + 1) * TILE_SIZE + Math.max(maxX - minX, 0) * TILE_GAP;
  const gridHeight = (maxY - minY + 1) * TILE_SIZE + Math.max(maxY - minY, 0) * TILE_GAP;
  const originX = (scene.scale.width - gridWidth) / 2;
  const originY = (scene.scale.height - gridHeight) / 2;

  for (const tile of snapshot.visibleTiles) {
    const tileX = originX + (tile.x - minX) * (TILE_SIZE + TILE_GAP);
    const tileY = originY + (tile.y - minY) * (TILE_SIZE + TILE_GAP);
    graphics.fillStyle(resolveTileColor(tile.kind, tile.blocked), 1);
    graphics.fillRect(tileX, tileY, TILE_SIZE, TILE_SIZE);
    graphics.lineStyle(1, 0x223128, 1);
    graphics.strokeRect(tileX, tileY, TILE_SIZE, TILE_SIZE);

    if (tile.blocked) {
      graphics.lineStyle(2, 0x7b2d1f, 0.95);
      graphics.beginPath();
      graphics.moveTo(tileX + 8, tileY + 8);
      graphics.lineTo(tileX + TILE_SIZE - 8, tileY + TILE_SIZE - 8);
      graphics.moveTo(tileX + TILE_SIZE - 8, tileY + 8);
      graphics.lineTo(tileX + 8, tileY + TILE_SIZE - 8);
      graphics.strokePath();
    }
  }

  const heroX = originX + (snapshot.position.x - minX) * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2;
  const heroY = originY + (snapshot.position.y - minY) * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2;
  graphics.fillStyle(0xe8dcae, 1);
  graphics.fillCircle(heroX, heroY, 10);
  graphics.lineStyle(2, 0x2f1f10, 1);
  graphics.strokeCircle(heroX, heroY, 10);
}

function resolveTileColor(kind: string, blocked: boolean): number {
  if (blocked) {
    return 0x2c3140;
  }
  switch (kind) {
    case 'town':
      return 0x5e7150;
    case 'road':
      return 0x6a5b3a;
    case 'roots':
      return 0x4f3f28;
    case 'forest':
      return 0x2b4c33;
    case 'ruin':
      return 0x56505e;
    case 'shrine':
      return 0x6b7f68;
    case 'water':
      return 0x2f5676;
    default:
      return 0x355037;
  }
}
