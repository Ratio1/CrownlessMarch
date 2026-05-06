import fs from 'node:fs';
import path from 'node:path';

function readGlobalCss() {
  return fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
}

function extractMediaBlock(css: string, query: string) {
  const start = css.indexOf(query);

  if (start < 0) {
    return '';
  }

  const open = css.indexOf('{', start);
  let depth = 0;

  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') {
      depth += 1;
    }

    if (css[index] === '}') {
      depth -= 1;

      if (depth === 0) {
        return css.slice(open + 1, index);
      }
    }
  }

  return '';
}

describe('mobile playfield CSS', () => {
  it('keeps desktop canvas chrome from crowding the atlas marquee', () => {
    const css = readGlobalCss();

    expect(css).toMatch(/\.world-canvas__chrome \.status-pill:not\(:first-child\)\s*\{[^}]*display:\s*none;/s);
  });

  it('hides duplicate canvas chrome and lifts the shard marquee into a clear mobile slot', () => {
    const mobileCss = extractMediaBlock(readGlobalCss(), '@media (max-width: 720px)');

    expect(mobileCss).toContain('.world-canvas__chrome');
    expect(mobileCss).toMatch(/\.world-canvas__chrome\s*\{[^}]*display:\s*none;/s);
    expect(mobileCss).toMatch(/\.world-canvas__marquee\s*\{[^}]*top:\s*16px;/s);
    expect(mobileCss).toMatch(/\.world-canvas__marquee\s*\{[^}]*width:\s*calc\(100% - 24px\);/s);
  });

  it('keeps the mobile hero panel below the absolute shard marquee', () => {
    const mobileCss = extractMediaBlock(readGlobalCss(), '@media (max-width: 720px)');

    expect(mobileCss).toMatch(/\.world-canvas__hero\s*\{[^}]*margin-top:\s*108px;/s);
  });

  it('keeps the live log above non-overlapping command controls on mobile', () => {
    const mobileCss = extractMediaBlock(readGlobalCss(), '@media (max-width: 720px)');
    const shellSource = fs.readFileSync(path.join(process.cwd(), 'src/components/game/GameShell.tsx'), 'utf8');

    expect(shellSource.indexOf('<CombatLogPanel')).toBeLessThan(shellSource.indexOf('<div className="play-controls">'));
    expect(mobileCss).not.toMatch(/\.play-controls\s*\{[^}]*order:\s*-1;/s);
    expect(mobileCss).not.toMatch(/\.play-controls\s*\{[^}]*position:\s*sticky;/s);
    expect(mobileCss).not.toMatch(/\.play-controls\s*\{[^}]*bottom:\s*12px;/s);
    expect(mobileCss).toMatch(/\.play-panel--terminal\s*\{[^}]*max-height:\s*520px;/s);
  });
});
