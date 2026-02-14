/**
 * 공통 유틸리티 함수
 */

// --- Error Helper ---
export const err = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

// --- Random Pick ---
export function pickRandom<T>(arr: T[]): T | undefined {
  if (!arr.length) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Korean Word Count ---
export function countKoreanWords(text: string): number {
  const koreanWords = (text.match(/[가-힣]+/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  return koreanWords + englishWords;
}

// --- Timeout Wrapper ---
export async function withTimeout<R>(p: Promise<R>, ms: number, label: string): Promise<R> {
  let t: NodeJS.Timeout;
  try {
    return await Promise.race([
      p,
      new Promise<R>((_, reject) => {
        t = setTimeout(() => reject(new Error(`${label} 타임아웃`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(t!);
  }
}

// --- Timeout with Fallback ---
export async function withTimeoutFallback<R>(
  p: Promise<R>,
  ms: number,
  fallback: R,
  label: string,
): Promise<R> {
  try {
    return await withTimeout(p, ms, label);
  } catch {
    console.warn(`[Pipeline] ${label} 타임아웃 — fallback`);
    return fallback;
  }
}
