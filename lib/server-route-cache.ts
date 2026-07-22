type CacheEntry<T> = {
  expiresAt: number;
  data: T;
};

export function createRouteCache<T>(ttlMs: number) {
  let entry: CacheEntry<T> | null = null;
  let inflight: Promise<T> | null = null;

  return {
    read(): T | null {
      if (entry && entry.expiresAt > Date.now()) return entry.data;
      return null;
    },
    write(data: T) {
      entry = { data, expiresAt: Date.now() + ttlMs };
    },
    invalidate() {
      entry = null;
    },
    async getOrLoad(loader: () => Promise<T>): Promise<T> {
      const cached = this.read();
      if (cached !== null) return cached;
      if (inflight) return inflight;
      inflight = loader()
        .then((data) => {
          this.write(data);
          inflight = null;
          return data;
        })
        .catch((error) => {
          inflight = null;
          throw error;
        });
      return inflight;
    },
  };
}
