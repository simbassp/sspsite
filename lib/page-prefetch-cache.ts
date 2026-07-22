type CacheEntry = { data: unknown; at: number };

const store = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 2 * 60 * 1000;

export function readPagePrefetchCache<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > ttlMs) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function writePagePrefetchCache<T>(key: string, data: T) {
  store.set(key, { data, at: Date.now() });
}

export function clearPagePrefetchCache(scope?: string) {
  if (!scope) {
    store.clear();
    return;
  }
  const prefix = `${scope}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
