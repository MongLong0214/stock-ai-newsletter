const SITE_DOMAIN = 'https://stockmatrix.co.kr'
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || ''
const INDEXNOW_KEY_FILE = 'stockmatrix-indexnow'
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

interface IndexNowResult {
  submitted: number
  errors: string[]
}

/** IndexNow API를 통해 URL 변경을 검색 엔진(Bing, Naver 등)에 알림 */
export const submitToIndexNow = async (urls: string[]): Promise<IndexNowResult> => {
  if (!INDEXNOW_KEY) {
    console.warn('[IndexNow] INDEXNOW_KEY 미설정 — 제출 건너뜀')
    return { submitted: 0, errors: ['INDEXNOW_KEY not configured'] }
  }

  if (urls.length === 0) {
    return { submitted: 0, errors: [] }
  }

  const host = new URL(SITE_DOMAIN).host

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_DOMAIN}/${INDEXNOW_KEY_FILE}.txt`,
        urlList: urls.slice(0, 10000),
      }),
    })

    if (response.ok || response.status === 202) {
      console.log(`[IndexNow] ${urls.length}개 URL 제출 완료`)
      return { submitted: urls.length, errors: [] }
    }

    const errorText = await response.text().catch(() => 'Unknown error')
    console.error(`[IndexNow] 제출 실패 (${response.status}):`, errorText)
    return { submitted: 0, errors: [`HTTP ${response.status}: ${errorText}`] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[IndexNow] 네트워크 오류:', message)
    return { submitted: 0, errors: [message] }
  }
}

/** 테마 ID 목록으로부터 IndexNow 제출용 URL 생성 */
export const buildThemeUrls = (themeIds: string[]): string[] => {
  const urls = themeIds.map(id => `${SITE_DOMAIN}/themes/${id}`)
  urls.push(`${SITE_DOMAIN}/themes`)
  return urls
}
