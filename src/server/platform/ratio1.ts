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

export interface Ratio1AddJsonRequest {
  data: unknown;
  fn?: string;
  nonce?: number;
  secret?: string;
}

export interface Ratio1GetYamlRequest {
  cid: string;
  secret?: string;
}

export interface Ratio1CStoreClient {
  hset(request: Ratio1HSetRequest): Promise<unknown>;
  hget(request: Ratio1HGetRequest): Promise<string | null>;
  hgetall(request: Ratio1HGetAllRequest): Promise<Record<string, string | null>>;
  hsync(request: Ratio1HSyncRequest): Promise<unknown>;
}

export interface Ratio1R1fsClient {
  addJson(request: Ratio1AddJsonRequest): Promise<{ cid: string }>;
  getYaml(request: Ratio1GetYamlRequest): Promise<{ file_data: unknown }>;
}

export interface Ratio1ServerClient {
  cstore: Ratio1CStoreClient;
  r1fs: Ratio1R1fsClient;
}

export interface Ratio1BootstrapOptions {
  cstoreUrl?: string;
  fetchImpl?: typeof fetch;
  chainstorePeers?: string[];
  env?: NodeJS.ProcessEnv;
  r1fsUrl?: string;
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

function resolveR1fsUrl(env: NodeJS.ProcessEnv) {
  const configuredUrl = env.EE_R1FS_API_URL ?? env.R1FS_API_URL ?? 'localhost:31235';
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

  const cstoreBaseUrl = (options.cstoreUrl ? ensureProtocol(options.cstoreUrl) : resolveCstoreUrl(env)).replace(
    /\/+$/,
    ''
  );
  const r1fsBaseUrl = (options.r1fsUrl ? ensureProtocol(options.r1fsUrl) : resolveR1fsUrl(env)).replace(
    /\/+$/,
    ''
  );
  const chainstorePeers = resolveChainstorePeers({ ...options, env });

  async function request<T>(baseUrl: string, path: string, init: RequestInit, label: string) {
    const url = `${baseUrl}${path}`;

    if (options.verbose) {
      console.debug(`[thornwrithe:ratio1:${label}] request`, { url, method: init.method });
    }

    return await parseResult<T>(await fetchImpl(url, init));
  }

  return {
    cstore: {
      async hset(requestBody) {
        return await request(cstoreBaseUrl, '/hset', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hkey: requestBody.hkey,
            key: requestBody.key,
            value: requestBody.value,
            chainstore_peers: chainstorePeers,
          }),
        }, 'cstore');
      },

      async hget(requestBody) {
        const params = new URLSearchParams({
          hkey: requestBody.hkey,
          key: requestBody.key,
        });

        return await request<string | null>(cstoreBaseUrl, `/hget?${params.toString()}`, {
          method: 'GET',
        }, 'cstore');
      },

      async hgetall(requestBody) {
        const params = new URLSearchParams({
          hkey: requestBody.hkey,
        });

        return await request<Record<string, string | null>>(cstoreBaseUrl, `/hgetall?${params.toString()}`, {
          method: 'GET',
        }, 'cstore');
      },

      async hsync(requestBody) {
        return await request(cstoreBaseUrl, '/hsync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hkey: requestBody.hkey,
            chainstore_peers: chainstorePeers,
          }),
        }, 'cstore');
      },
    },
    r1fs: {
      async addJson(requestBody) {
        return await request<{ cid: string }>(
          r1fsBaseUrl,
          '/add_json',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(requestBody),
          },
          'r1fs'
        );
      },

      async getYaml(requestBody) {
        const params = new URLSearchParams({
          cid: requestBody.cid,
          ...(requestBody.secret ? { secret: requestBody.secret } : {}),
        });

        return await request<{ file_data: Record<string, unknown> }>(
          r1fsBaseUrl,
          `/get_yaml?${params.toString()}`,
          { method: 'GET' },
          'r1fs'
        );
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

export { ensureProtocol, resolveChainstorePeers, resolveCstoreUrl, resolveR1fsUrl };
