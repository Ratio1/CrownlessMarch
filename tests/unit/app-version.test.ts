import * as path from 'node:path';

const appRoot = path.resolve(__dirname, '../..');

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    ...overrides,
  };
}

describe('app version', () => {
  beforeEach(async () => {
    jest.resetModules();
    (await import('../../src/server/app-version')).__resetVersionCacheForTests();
  });

  it('reads the package version as the default release label', async () => {
    const mod = await import('../../src/server/app-version');

    const version = mod.resolveThornwritheVersion(
      env({
        THORNWRITHE_GIT_SHA: 'abc123def456',
      }),
      appRoot
    );

    expect(version).toMatchObject({
      game: 'thornwrithe',
      label: '1.13.0',
      release: 1,
      feature: 13,
      build: 0,
      packageVersion: '1.13.0',
      commitSha: 'abc123def456',
      source: 'package',
    });
  });

  it('prefers THORNWRITHE_VERSION over the package version', async () => {
    const mod = await import('../../src/server/app-version');

    const version = mod.resolveThornwritheVersion(
      env({
        THORNWRITHE_VERSION: '2.7.19',
        THORNWRITHE_GIT_SHA: 'feedbead9876',
      }),
      appRoot
    );

    expect(version).toMatchObject({
      label: '2.7.19',
      release: 2,
      feature: 7,
      build: 19,
      packageVersion: '1.13.0',
      commitSha: 'feedbead9876',
      source: 'env',
    });
  });

  it('accepts the split release, feature, and build env contract', async () => {
    const mod = await import('../../src/server/app-version');

    const version = mod.resolveThornwritheVersion(
      env({
        THORNWRITHE_RELEASE: '3',
        THORNWRITHE_FEATURE: '4',
        THORNWRITHE_BUILD: '12',
        THORNWRITHE_GIT_SHA: '123456789abc',
      }),
      appRoot
    );

    expect(version).toMatchObject({
      label: '3.4.12',
      release: 3,
      feature: 4,
      build: 12,
      commitSha: '123456789abc',
      source: 'env',
    });
  });

  it('rejects a partial split env contract', async () => {
    const mod = await import('../../src/server/app-version');

    expect(() =>
      mod.resolveThornwritheVersion(
        env({
          THORNWRITHE_RELEASE: '3',
          THORNWRITHE_FEATURE: '4',
        }),
        appRoot
      )
    ).toThrow(
      'THORNWRITHE_RELEASE, THORNWRITHE_FEATURE, and THORNWRITHE_BUILD must all be set together'
    );
  });
});
