/**
 * IndexNow — 새 콘텐츠 발행 시 Bing·네이버 등에 즉시 통보.
 * 키 검증 파일: https://stockmatrix.co.kr/<KEY>.txt (public/<KEY>.txt)
 */

export const INDEXNOW_KEY = '8f3d9a1c4b7e2056f1a8c3d6e9b40275';
const INDEXNOW_HOST = 'stockmatrix.co.kr';

/** URL 목록을 IndexNow에 통보 (실패해도 throw 안 함 — 발행 흐름을 막지 않음) */
export async function notifyIndexNow(urls: string[]): Promise<void> {
  if (!urls.length) return;
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: INDEXNOW_HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });
    if (!res.ok) {
      console.warn(`[IndexNow] 통보 실패 status=${res.status} (${urls.length} URLs)`);
    } else {
      console.log(`[IndexNow] ${urls.length}개 URL 통보 완료`);
    }
  } catch (error) {
    console.warn('[IndexNow] 통보 예외:', error instanceof Error ? error.message : String(error));
  }
}
