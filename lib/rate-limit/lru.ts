/**
 * In-memory sliding-window rate limiter used as a fallback when Upstash is
 * unavailable. Bounded at MAX_ENTRIES to prevent unbounded memory growth in
 * serverless warm instances.
 *
 * Keys are evicted via:
 *  - Lazy cleanup during `hit()` when an entry's window has expired.
 *  - Hard cap eviction: oldest-inserted key dropped once size > MAX_ENTRIES.
 */

const WINDOW_MS = 60_000;
const MAX_ENTRIES = 1000;

type Bucket = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Bucket>();

export type LruResult = {
  ok: boolean;
  retryAfter: number;
};

/**
 * Record a hit for `key` under an N-per-minute sliding window.
 * Returns whether the caller is under the limit and when the window resets.
 */
export function hit(key: string, limitPerMinute: number): LruResult {
  const now = Date.now();
  let bucket = store.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, bucket);
  }

  bucket.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const ok = bucket.count <= limitPerMinute;

  if (store.size > MAX_ENTRIES) {
    // Map preserves insertion order — evict oldest until back under cap.
    const overflow = store.size - MAX_ENTRIES;
    let evicted = 0;
    for (const oldKey of store.keys()) {
      if (evicted >= overflow) break;
      store.delete(oldKey);
      evicted += 1;
    }
  }

  return { ok, retryAfter: ok ? 0 : retryAfterSec };
}

export function size(): number {
  return store.size;
}

export function __resetForTests(): void {
  store.clear();
}
