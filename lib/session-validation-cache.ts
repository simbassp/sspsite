const SESSION_VALIDATION_TTL_MS = 45_000;

type CacheEntry = {
  valid: boolean;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export function readCachedSessionValidation(userId: string): boolean | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(userId);
    return null;
  }
  return entry.valid;
}

export function writeCachedSessionValidation(userId: string, valid: boolean) {
  cache.set(userId, {
    valid,
    expiresAt: Date.now() + SESSION_VALIDATION_TTL_MS,
  });
}

export function invalidateSessionValidationCache(userId?: string) {
  if (userId) {
    cache.delete(userId);
    return;
  }
  cache.clear();
}
