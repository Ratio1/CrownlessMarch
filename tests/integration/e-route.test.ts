export {};

describe('/e route', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      THORNWRITHE_VERSION: '4.2.9',
      THORNWRITHE_GIT_SHA: 'deadbeefcafe',
    };
    (await import('../../src/server/app-version')).__resetVersionCacheForTests();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns the live Thornwrithe version contract and verification headers', async () => {
    const route = await import('../../app/e/route');

    const response = await route.GET();
    const body = (await response.json()) as {
      ok: boolean;
      game: string;
      version: string;
      release: number;
      feature: number;
      build: number;
      packageVersion: string;
      commitSha: string | null;
      source: string;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      game: 'thornwrithe',
      version: '4.2.9',
      release: 4,
      feature: 2,
      build: 9,
      packageVersion: '1.10.1',
      commitSha: 'deadbeefcafe',
      source: 'env',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-thornwrithe-version')).toBe('4.2.9');
    expect(response.headers.get('x-thornwrithe-release')).toBe('4');
    expect(response.headers.get('x-thornwrithe-feature')).toBe('2');
    expect(response.headers.get('x-thornwrithe-build')).toBe('9');
    expect(response.headers.get('x-thornwrithe-commit')).toBe('deadbeefcafe');
  });
});
