function readNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();

    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function stripWorkerRunnerSuffix(authHkey: string) {
  const namespace = authHkey.replace(/:auth$/, '');

  return namespace.replace(/_(WORKER_APP_RU|CONTAINER_APP_RU)_[^:]+$/, '');
}

export function resolveThornwritheGameId(env: NodeJS.ProcessEnv = process.env) {
  const explicitGameId = readNonEmpty(env.THORNWRITHE_GAME_ID);

  if (explicitGameId) {
    return explicitGameId;
  }

  const authHkey = readNonEmpty(env.R1EN_CSTORE_AUTH_HKEY);

  if (authHkey) {
    return stripWorkerRunnerSuffix(authHkey);
  }

  throw new Error('THORNWRITHE_GAME_ID is required to use presence leases');
}

export function resolveSessionSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = readNonEmpty(env.SESSION_SECRET, env.R1EN_CSTORE_AUTH_SECRET);

  if (!secret) {
    throw new Error('SESSION_SECRET is required');
  }

  return secret;
}

export function resolveAttachTokenSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = readNonEmpty(env.ATTACH_TOKEN_SECRET, env.R1EN_CSTORE_AUTH_SECRET, env.SESSION_SECRET);

  if (!secret) {
    throw new Error('ATTACH_TOKEN_SECRET is required');
  }

  return secret;
}

export function resolveThornwritheNodeId(env: NodeJS.ProcessEnv = process.env) {
  return readNonEmpty(env.THORNWRITHE_NODE_ID, env.R1EN_HOST_ID, env.EE_HOST_ID) ?? 'node-a';
}
