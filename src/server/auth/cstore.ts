import type { CStoreAuth as CStoreAuthType } from '@ratio1/cstore-auth-ts';

const { CStoreAuth, resolveAuthEnv } = require('@ratio1/cstore-auth-ts') as typeof import('@ratio1/cstore-auth-ts');

const AUTH_OVERRIDES: Partial<Record<'hkey' | 'secret', string>> = {};

let authClient: CStoreAuthType | null = null;
let authInitPromise: Promise<void> | null = null;

function readNonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function isSharedAuthConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(
    readNonEmpty(env.R1EN_CSTORE_AUTH_HKEY ?? env.EE_CSTORE_AUTH_HKEY) &&
      readNonEmpty(env.R1EN_CSTORE_AUTH_SECRET ?? env.EE_CSTORE_AUTH_SECRET)
  );
}

export function getAuthClient(): CStoreAuthType {
  if (!authClient) {
    const resolved = resolveAuthEnv(AUTH_OVERRIDES, process.env);

    authClient = new CStoreAuth({
      hkey: resolved.hkey,
      secret: resolved.secret,
      logger: console,
    });
  }

  return authClient;
}

export async function ensureAuthInitialized(client: CStoreAuthType = getAuthClient()): Promise<void> {
  if (!authInitPromise) {
    authInitPromise = client.simple.init().catch((error: unknown) => {
      authInitPromise = null;
      throw error;
    });
  }

  await authInitPromise;
}
