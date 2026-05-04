import * as fs from 'node:fs';
import * as path from 'node:path';

const appRoot = path.resolve(__dirname, '../..');

describe('app icon', () => {
  it('declares a browser icon asset to keep the live smoke console clean', () => {
    const layoutSource = fs.readFileSync(path.join(appRoot, 'app/layout.tsx'), 'utf8');
    const iconSource = fs.readFileSync(path.join(appRoot, 'public/icon.svg'), 'utf8');

    expect(layoutSource).toContain('export const metadata');
    expect(layoutSource).toContain("icon: '/icon.svg'");
    expect(iconSource).toContain('<title>Thornwrithe</title>');
    expect(iconSource).toContain('viewBox="0 0 64 64"');
  });
});
