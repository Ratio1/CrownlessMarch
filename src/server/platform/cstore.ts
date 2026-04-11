import createEdgeSdk from '@ratio1/edge-sdk-ts';
import type { CStoreLikeClient } from '@ratio1/cstore-auth-ts';

export interface PlatformCStore extends CStoreLikeClient {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, value: T): Promise<void>;
}

class InMemoryPlatformCStore implements PlatformCStore {
  private readonly hashStore = new Map<string, Map<string, string>>();
  private readonly keyStore = new Map<string, string>();

  async getJson<T>(key: string): Promise<T | null> {
    const value = this.keyStore.get(key);
    if (value === undefined) {
      return null;
    }
    return JSON.parse(value) as T;
  }

  async setJson<T>(key: string, value: T): Promise<void> {
    this.keyStore.set(key, JSON.stringify(value));
  }

  async hget(hkey: string, key: string): Promise<string | null> {
    return this.hashStore.get(hkey)?.get(key) ?? null;
  }

  async hset(hkey: string, key: string, value: string): Promise<void> {
    const hash = this.hashStore.get(hkey) ?? new Map<string, string>();
    hash.set(key, value);
    this.hashStore.set(hkey, hash);
  }

  async hgetAll(hkey: string): Promise<Record<string, string>> {
    const hash = this.hashStore.get(hkey);
    if (!hash) {
      return {};
    }
    return Object.fromEntries(hash.entries());
  }

  reset(): void {
    this.hashStore.clear();
    this.keyStore.clear();
  }
}

class EdgePlatformCStore implements PlatformCStore {
  private readonly sdk = createEdgeSdk();

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const rawValue = await this.sdk.cstore.getValue<unknown>({ key });
      if (rawValue === undefined || rawValue === null) {
        return null;
      }
      if (typeof rawValue === 'string') {
        return JSON.parse(rawValue) as T;
      }
      return rawValue as T;
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async setJson<T>(key: string, value: T): Promise<void> {
    await this.sdk.cstore.setValue({
      key,
      value: JSON.stringify(value)
    });
  }

  async hget(hkey: string, key: string): Promise<string | null> {
    try {
      const value = await this.sdk.cstore.hget<unknown>({ hkey, key });
      if (value === undefined || value === null) {
        return null;
      }
      if (typeof value === 'string') {
        return value;
      }
      return JSON.stringify(value);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async hset(hkey: string, key: string, value: string): Promise<void> {
    await this.sdk.cstore.hset({ hkey, key, value });
  }

  async hgetAll(hkey: string): Promise<Record<string, string>> {
    const raw = await this.sdk.cstore.hgetall<unknown>({ hkey });
    return normalizeHashValues(raw);
  }
}

function normalizeHashValues(raw: unknown): Record<string, string> {
  if (!raw) {
    return {};
  }

  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (let index = 0; index < raw.length; index += 2) {
      const key = raw[index];
      const value = raw[index + 1];
      if (typeof key === 'string' && value !== undefined) {
        out[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
    }
    return out;
  }

  if (typeof raw === 'object') {
    const entries = Object.entries(raw as Record<string, unknown>).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value)
    ]);
    return Object.fromEntries(entries);
  }

  return {};
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const status = (error as { status?: number }).status;
  const responseStatus = (error as { response?: { status?: number } }).response?.status;
  return status === 404 || responseStatus === 404;
}

const testStore = new InMemoryPlatformCStore();
let edgeStore: EdgePlatformCStore | null = null;

function shouldUseInMemoryStore() {
  return process.env.NODE_ENV === 'test' || process.env.THORNWRITHE_USE_IN_MEMORY_CSTORE === '1';
}

export function getCStore(): PlatformCStore {
  if (shouldUseInMemoryStore()) {
    return testStore;
  }
  if (!edgeStore) {
    edgeStore = new EdgePlatformCStore();
  }
  return edgeStore;
}

export function __resetCStoreForTests(): void {
  testStore.reset();
}
