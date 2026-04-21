import {
  resolveAttachTokenSecret,
  resolveSessionSecret,
  resolveThornwritheGameId,
  resolveThornwritheNodeId,
} from '../../src/server/platform/runtime-env';

function env(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    ...overrides,
  };
}

describe('runtime env fallbacks', () => {
  it('derives the deployment game id from the worker auth namespace', () => {
    expect(
      resolveThornwritheGameId(env({
        R1EN_CSTORE_AUTH_HKEY: 'thornwrithe-d_ef7d156_WORKER_APP_RU_db5453:auth',
      }))
    ).toBe('thornwrithe-d_ef7d156');
  });

  it('uses the Ratio1 auth secret for session and attach fallbacks', () => {
    const runtimeEnv = env({
      R1EN_CSTORE_AUTH_SECRET: 'fallback-secret',
    });

    expect(resolveSessionSecret(runtimeEnv)).toBe('fallback-secret');
    expect(resolveAttachTokenSecret(runtimeEnv)).toBe('fallback-secret');
  });

  it('uses the injected host id when Thornwrithe node id is absent', () => {
    expect(
      resolveThornwritheNodeId(env({
        R1EN_HOST_ID: 'dr1-thorn-01-4c',
      }))
    ).toBe('dr1-thorn-01-4c');
  });
});
