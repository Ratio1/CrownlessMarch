import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import type { CStoreLikeClient } from '@ratio1/cstore-auth-ts';

export interface PlatformCStore extends CStoreLikeClient {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, value: T): Promise<void>;
}

interface PersistedCStoreData {
  keyStore: Record<string, string>;
  hashStore: Record<string, Record<string, string>>;
}

const FILE_LOCK_RETRY_MS = 25;
const FILE_LOCK_TIMEOUT_MS = 5_000;
const FILE_LOCK_STALE_MS = 30_000;

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

class FilePlatformCStore implements PlatformCStore {
  private writeQueue = Promise.resolve();
  private readonly lockPath: string;

  constructor(private readonly filePath: string) {
    this.lockPath = `${this.filePath}.lock`;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const data = await this.readData();
    const rawValue = data.keyStore[key];
    if (rawValue === undefined) {
      return null;
    }
    return JSON.parse(rawValue) as T;
  }

  async setJson<T>(key: string, value: T): Promise<void> {
    await this.withWriteLock(async () => {
      const data = await this.readData();
      data.keyStore[key] = JSON.stringify(value);
      await this.writeData(data);
    });
  }

  async hget(hkey: string, key: string): Promise<string | null> {
    const data = await this.readData();
    return data.hashStore[hkey]?.[key] ?? null;
  }

  async hset(hkey: string, key: string, value: string): Promise<void> {
    await this.withWriteLock(async () => {
      const data = await this.readData();
      const hash = data.hashStore[hkey] ?? {};
      hash[key] = value;
      data.hashStore[hkey] = hash;
      await this.writeData(data);
    });
  }

  async hgetAll(hkey: string): Promise<Record<string, string>> {
    const data = await this.readData();
    return { ...(data.hashStore[hkey] ?? {}) };
  }

  private async withWriteLock(action: () => Promise<void>) {
    this.writeQueue = this.writeQueue.then(async () => {
      await this.acquireCrossProcessLock();
      try {
        await action();
      } finally {
        await this.releaseCrossProcessLock();
      }
    });
    await this.writeQueue;
  }

  private async readData(): Promise<PersistedCStoreData> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return parsePersistedData(raw);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return createEmptyPersistedData();
      }
      throw error;
    }
  }

  private async writeData(data: PersistedCStoreData): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const payload = JSON.stringify(data);
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;

    await writeFile(tempPath, payload, 'utf8');
    try {
      await rename(tempPath, this.filePath);
    } catch (error) {
      await unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  private async acquireCrossProcessLock() {
    const startedAt = Date.now();
    await mkdir(path.dirname(this.lockPath), { recursive: true });

    while (true) {
      try {
        const handle = await open(this.lockPath, 'wx');
        await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
        await handle.close();
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') {
          throw error;
        }

        await this.maybeClearStaleLock();
        if (Date.now() - startedAt >= FILE_LOCK_TIMEOUT_MS) {
          throw new Error(`Timed out acquiring local CStore lock at ${this.lockPath}`);
        }
        await sleep(FILE_LOCK_RETRY_MS);
      }
    }
  }

  private async maybeClearStaleLock() {
    try {
      const lockStats = await stat(this.lockPath);
      if (Date.now() - lockStats.mtimeMs > FILE_LOCK_STALE_MS) {
        await unlink(this.lockPath);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async releaseCrossProcessLock() {
    try {
      await unlink(this.lockPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

function createEmptyPersistedData(): PersistedCStoreData {
  return {
    keyStore: {},
    hashStore: {}
  };
}

function parsePersistedData(raw: string): PersistedCStoreData {
  if (raw.trim().length === 0) {
    return createEmptyPersistedData();
  }

  const parsed = JSON.parse(raw) as Partial<PersistedCStoreData> | null;
  if (!parsed || typeof parsed !== 'object') {
    return createEmptyPersistedData();
  }

  const keyStore = normalizeStringRecord(parsed.keyStore);
  const hashStore: Record<string, Record<string, string>> = {};
  if (parsed.hashStore && typeof parsed.hashStore === 'object') {
    for (const [hkey, hashValue] of Object.entries(parsed.hashStore)) {
      hashStore[hkey] = normalizeStringRecord(hashValue);
    }
  }

  return { keyStore, hashStore };
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') {
      out[key] = entry;
    }
  }
  return out;
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
let fileStore: FilePlatformCStore | null = null;
let edgeStore: EdgePlatformCStore | null = null;
let fileStorePath: string | null = null;

function shouldUseInMemoryStore() {
  return process.env.NODE_ENV === 'test' || process.env.THORNWRITHE_USE_IN_MEMORY_CSTORE === '1';
}

function shouldUseFileStore() {
  if (shouldUseInMemoryStore()) {
    return false;
  }
  if (process.env.THORNWRITHE_USE_FILE_CSTORE === '0') {
    return false;
  }
  if (process.env.THORNWRITHE_USE_FILE_CSTORE === '1' || process.env.THORNWRITHE_CSTORE_FILE) {
    return true;
  }

  const hasEdgeApiUrl = Boolean(process.env.EE_CHAINSTORE_API_URL);
  return process.env.NODE_ENV !== 'production' && !hasEdgeApiUrl;
}

function resolveFileStorePath() {
  const rawPath = process.env.THORNWRITHE_CSTORE_FILE?.trim() || '.thornwrithe/cstore.local.json';
  return path.isAbsolute(rawPath) ? rawPath : path.join(process.cwd(), rawPath);
}

export function getCStore(): PlatformCStore {
  if (shouldUseInMemoryStore()) {
    return testStore;
  }
  if (shouldUseFileStore()) {
    const resolvedPath = resolveFileStorePath();
    if (!fileStore || fileStorePath !== resolvedPath) {
      fileStore = new FilePlatformCStore(resolvedPath);
      fileStorePath = resolvedPath;
    }
    return fileStore;
  }
  if (!edgeStore) {
    edgeStore = new EdgePlatformCStore();
  }
  return edgeStore;
}

export function __resetCStoreForTests(): void {
  testStore.reset();
}
