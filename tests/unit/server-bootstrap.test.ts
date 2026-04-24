describe('server bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

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

  it('syncs the presence hset before binding gameplay sockets', async () => {
    const bindWebSocketServer = jest.fn();
    const prepare = jest.fn().mockResolvedValue(undefined);
    const requestHandler = jest.fn();
    const nextFactory = jest.fn(() => ({
      prepare,
      getRequestHandler: () => requestHandler,
    }));
    const hsync = jest.fn().mockResolvedValue({
      hkey: 'thornwrithe-thornwrithe-v1:presence',
      merged_fields: 0,
    });

    jest.doMock('next', () => ({
      __esModule: true,
      default: nextFactory,
    }));
    jest.doMock('ws', () => ({
      WebSocketServer: jest.fn().mockImplementation(() => ({
        handleUpgrade: jest.fn(),
        emit: jest.fn(),
      })),
    }));
    jest.doMock('../../src/server/auth/attach-token', () => ({
      verifyAttachToken: jest.fn(),
    }));
    jest.doMock('../../src/server/runtime/connection-manager', () => ({
      createSessionHost: jest.fn(() => ({
        bindWebSocketServer,
      })),
    }));
    jest.doMock('../../src/server/platform/cstore-roster', () => ({
      readRosterEntry: jest.fn(),
      writeRosterEntry: jest.fn(),
    }));
    jest.doMock('../../src/server/platform/r1fs-characters', () => ({
      createCharacterCheckpointStore: jest.fn(() => ({
        saveCharacterCheckpoint: jest.fn(),
        loadCharacterByCid: jest.fn(),
      })),
    }));
    jest.doMock('../../src/server/platform/ratio1', () => ({
      getRatio1ServerClient: jest.fn(() => ({
        cstore: {
          hset: jest.fn(),
          hget: jest.fn(),
          hgetall: jest.fn(),
          hsync,
        },
        r1fs: {},
      })),
    }));
    jest.doMock('../../src/server/platform/runtime-env', () => ({
      resolveThornwritheGameId: jest.fn(() => 'thornwrithe-v1'),
      resolveThornwritheNodeId: jest.fn(() => 'dr1-thorn-01-4c'),
    }));
    jest.doMock('../../src/server/runtime/persistence-service', () => ({
      createPersistenceService: jest.fn(() => ({
        persistProgression: jest.fn(),
      })),
    }));
    jest.doMock('../../src/server/runtime/shard-runtime', () => ({
      ShardRuntime: jest.fn().mockImplementation(() => ({})),
    }));
    jest.doMock('../../src/server/content/load-content', () => ({
      loadContentBundle: jest.fn().mockResolvedValue({}),
    }));

    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      THORNWRITHE_GAME_ID: 'thornwrithe-v1',
      SESSION_SECRET: 'session-secret',
      ATTACH_TOKEN_SECRET: 'attach-secret',
    };

    try {
      const mod = await import('../../server');

      await mod.createServer();

      expect(hsync).toHaveBeenCalledTimes(1);
      expect(bindWebSocketServer).toHaveBeenCalledTimes(1);
      expect(hsync.mock.invocationCallOrder[0]).toBeLessThan(bindWebSocketServer.mock.invocationCallOrder[0]);
    } finally {
      process.env = originalEnv;
    }
  });
});
