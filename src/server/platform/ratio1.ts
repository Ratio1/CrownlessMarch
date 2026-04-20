export interface Ratio1HSetRequest {
  hkey: string;
  key: string;
  value: string | null;
}

export interface Ratio1HGetRequest {
  hkey: string;
  key: string;
}

export interface Ratio1HGetAllRequest {
  hkey: string;
}

export interface Ratio1HSyncRequest {
  hkey: string;
}

export interface Ratio1CStoreClient {
  hset(request: Ratio1HSetRequest): Promise<unknown>;
  hget(request: Ratio1HGetRequest): Promise<string | null>;
  hgetall(request: Ratio1HGetAllRequest): Promise<Record<string, string | null>>;
  hsync(request: Ratio1HSyncRequest): Promise<unknown>;
}

export interface Ratio1ServerClient {
  cstore: Ratio1CStoreClient;
}

export interface Ratio1BootstrapOptions {
  cstoreUrl?: string;
  fetchImpl?: typeof fetch;
  chainstorePeers?: string[];
  env?: NodeJS.ProcessEnv;
  verbose?: boolean;
}

type GlobalWithRatio1 = typeof globalThis & {
  __thornwritheRatio1Client?: Ratio1ServerClient;
};

function ensureProtocol(url: string) {
  return /^https?:\/\//i.test(url) ? url : `http://${url}`;
}

function resolveCstoreUrl(env: NodeJS.ProcessEnv) {
  const configuredUrl = env.EE_CHAINSTORE_API_URL ?? env.CSTORE_API_URL ?? 'localhost:31234';
  return ensureProtocol(configuredUrl).replace(/\/+$/, '');
}

function resolveChainstorePeers(options: Ratio1BootstrapOptions) {
  if (options.chainstorePeers) {
    return options.chainstorePeers;
  }

  const rawPeers = options.env?.EE_CHAINSTORE_PEERS?.trim();

  if (!rawPeers) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawPeers);
    return Array.isArray(parsed) ? parsed.filter((peer): peer is string => typeof peer === 'string') : [];
  } catch {
    return rawPeers
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }
}

async function parseResult<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Ratio1 CStore request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { result?: T };
  return payload.result as T;
}

export function createRatio1ServerClient(options: Ratio1BootstrapOptions = {}): Ratio1ServerClient {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required to create the Ratio1 server client');
  }

  const baseUrl = (options.cstoreUrl ? ensureProtocol(options.cstoreUrl) : resolveCstoreUrl(env)).replace(
    /\/+$/,
    ''
  );
  const chainstorePeers = resolveChainstorePeers({ ...options, env });

  async function request<T>(path: string, init: RequestInit) {
    const url = `${baseUrl}${path}`;

    if (options.verbose) {
      console.debug('[thornwrithe:ratio1] request', { url, method: init.method });
    }

    return await parseResult<T>(await fetchImpl(url, init));
  }

  return {
    cstore: {
      async hset(requestBody) {
        return await request('/hset', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hkey: requestBody.hkey,
            key: requestBody.key,
            value: requestBody.value,
            chainstore_peers: chainstorePeers,
          }),
        });
      },

      async hget(requestBody) {
        const params = new URLSearchParams({
          hkey: requestBody.hkey,
          key: requestBody.key,
        });

        return await request<string | null>(`/hget?${params.toString()}`, {
          method: 'GET',
        });
      },

      async hgetall(requestBody) {
        const params = new URLSearchParams({
          hkey: requestBody.hkey,
        });

        return await request<Record<string, string | null>>(`/hgetall?${params.toString()}`, {
          method: 'GET',
        });
      },

      async hsync(requestBody) {
        return await request('/hsync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hkey: requestBody.hkey,
            chainstore_peers: chainstorePeers,
          }),
        });
      },
    },
  };
}

export function getRatio1ServerClient(options: Ratio1BootstrapOptions = {}) {
  const globalWithRatio1 = globalThis as GlobalWithRatio1;

  if (!globalWithRatio1.__thornwritheRatio1Client) {
    globalWithRatio1.__thornwritheRatio1Client = createRatio1ServerClient(options);
  }

  return globalWithRatio1.__thornwritheRatio1Client;
}

export { ensureProtocol, resolveChainstorePeers, resolveCstoreUrl };
