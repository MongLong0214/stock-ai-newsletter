interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface Cache {
  get: <T = unknown>(key: string) => T | undefined;
  set: <T = unknown>(key: string, value: T, ttlMs: number) => void;
  readonly size: number;
}

export const createCache = (maxSize = 50): Cache => {
  const store = new Map<string, CacheEntry<unknown>>();

  const evictExpired = (): void => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(key);
      }
    }
  };

  return {
    get<T = unknown>(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value as T;
    },

    set<T = unknown>(key: string, value: T, ttlMs: number): void {
      if (store.size >= maxSize) {
        evictExpired();
      }
      if (store.size >= maxSize) {
        const oldest = store.keys().next().value as string;
        store.delete(oldest);
      }
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },

    get size() {
      return store.size;
    },
  };
};
