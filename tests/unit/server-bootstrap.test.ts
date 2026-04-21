describe('server bootstrap', () => {
  it('exports a createServer function', async () => {
    const mod = await import('../../server');

    expect(typeof mod.createServer).toBe('function');
  });

  it('fails fast when required runtime env is missing', async () => {
    const mod = await import('../../server');
    const originalEnv = process.env;

    process.env = {
      ...originalEnv,
    };

    delete process.env.THORNWRITHE_GAME_ID;
    delete process.env.SESSION_SECRET;
    delete process.env.ATTACH_TOKEN_SECRET;

    try {
      expect(typeof mod.assertRequiredRuntimeEnv).toBe('function');
      expect(() => mod.assertRequiredRuntimeEnv()).toThrow(
        'Missing required Thornwrithe runtime env: THORNWRITHE_GAME_ID, SESSION_SECRET, ATTACH_TOKEN_SECRET'
      );
    } finally {
      process.env = originalEnv;
    }
  });

  it('accepts Deeploy runtime fallbacks when explicit Thornwrithe env is absent', async () => {
    const mod = await import('../../server');
    const originalEnv = process.env;

    process.env = {
      ...originalEnv,
      R1EN_CSTORE_AUTH_HKEY: 'thornwrithe-d_ef7d156_WORKER_APP_RU_db5453:auth',
      R1EN_CSTORE_AUTH_SECRET: 'fallback-secret',
      R1EN_HOST_ID: 'dr1-thorn-01-4c',
    };

    delete process.env.THORNWRITHE_GAME_ID;
    delete process.env.SESSION_SECRET;
    delete process.env.ATTACH_TOKEN_SECRET;
    delete process.env.THORNWRITHE_NODE_ID;

    try {
      expect(() => mod.assertRequiredRuntimeEnv()).not.toThrow();
    } finally {
      process.env = originalEnv;
    }
  });
});
