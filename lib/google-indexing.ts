import { GoogleAuth } from 'google-auth-library';

const INDEXING_API = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const SCOPES = ['https://www.googleapis.com/auth/indexing'];
const MAX_CONCURRENCY = 5;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

// --- Singleton auth (lazy) ---

let authInstance: GoogleAuth | null = null;
let warnedMissing = false;

function getAuth(): GoogleAuth | null {
  if (authInstance) return authInstance;

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (!warnedMissing) {
      console.warn('[Google Indexing] GOOGLE_APPLICATION_CREDENTIALS 미설정 — 건너뜀');
      warnedMissing = true;
    }
    return null;
  }

  authInstance = new GoogleAuth({ scopes: SCOPES });
  return authInstance;
}

// --- Retry with exponential backoff ---

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries) throw e;
      const delay = RETRY_BASE_MS * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// --- Concurrency limiter ---

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// --- Public API ---

export async function notifyGoogleIndexing(url: string): Promise<boolean> {
  const auth = getAuth();
  if (!auth) return false;

  try {
    const client = await auth.getClient();
    const res = await withRetry(() =>
      client.request({ url: INDEXING_API, method: 'POST', data: { url, type: 'URL_UPDATED' } }),
    );

    console.log(`[Google Indexing] ${url} -> ${(res as { status: number }).status}`);
    return true;
  } catch (e) {
    console.error(`[Google Indexing] 실패 (${url}):`, e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function notifyGoogleIndexingBatch(
  urls: string[],
): Promise<{ success: number; failed: number }> {
  const auth = getAuth();
  if (!auth) return { success: 0, failed: 0 };
  if (!urls.length) return { success: 0, failed: 0 };

  const results = await mapConcurrent(urls, MAX_CONCURRENCY, notifyGoogleIndexing);

  const success = results.filter(Boolean).length;
  const failed = results.length - success;

  console.log(`[Google Indexing] 배치 완료: ${success}/${results.length} 성공`);
  return { success, failed };
}