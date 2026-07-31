import type { JsonObject } from '../../../lib/tli/canonical-json'
import { sleep } from '../shared/utils'
import {
  buildNewsCollectionRun,
  calendarDatesBetween,
  keywordGroupSha256,
  resolveThemeKeywordGroup,
} from './collection-run-contract'
import { appendCollectionRun, type CollectionRunTransport } from './collection-run-store'
import { emptyCollectionReport, type CollectionReport } from './collection-report'
import {
  newsFailureReason,
  searchThemeNews,
  type NewsArticle,
  type ThemeSearchResult,
} from './naver-news-api'

export type { NewsArticle } from './naver-news-api'

interface Theme {
  id: string
  name: string
  naverKeywords: string[]
}

interface NewsMetric {
  themeId: string
  date: string
  articleCount: number
}

export interface NewsCollectionOptions {
  /** 테스트 주입용. 미지정 시 supabase RPC로 immutable run을 append한다. */
  readonly transport?: CollectionRunTransport
}

const NEWS_CONTRACT_VERSION = 'tli-news-v1'

export interface NewsCollectionResult {
  metrics: NewsMetric[]
  articles: NewsArticle[]
  report: CollectionReport
}


/**
 * 네이버 뉴스 데이터 수집 — 테마당 immutable run 1건.
 *
 * complete run은 expected theme×date마다 0건도 명시적 `article_count=0` row로 저장한다.
 * row 부재는 0건이 아니라 source missing이므로, 검색 실패 테마는 failed run(observation 0)이 되고
 * current cache(news_metrics)에도 반영하지 않는다. 테마별 run으로 분리해 한 테마의 실패가
 * 다른 테마의 complete를 오염시키지 못하게 한다.
 */
export async function collectNaverNews(
  themes: Theme[],
  startDate: string,
  endDate: string,
  options: NewsCollectionOptions = {},
): Promise<NewsCollectionResult> {
  console.log('📰 네이버 뉴스 데이터 수집 중...')
  console.log(`   기간: ${startDate} ~ ${endDate}`)
  console.log(`   테마 수: ${themes.length}`)

  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    if (process.env.TLI_ALLOW_NEWS_SKIP === '1') {
      console.warn('   ⚠️ NAVER_CLIENT_ID/SECRET 미설정 — 뉴스 수집 건너뜀')
      return { metrics: [], articles: [], report: emptyCollectionReport() }
    }
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경 변수가 필요합니다')
  }

  const metrics: NewsMetric[] = []
  const allArticles: NewsArticle[] = []
  let requested = 0
  let succeeded = 0
  let failed = 0
  let persistenceFailed = 0

  for (const theme of themes) {
    if (theme.naverKeywords.length === 0) {
      console.log(`   ⊘ 테마 ${theme.id} 건너뜀: 키워드 없음`)
      continue
    }

    requested++

    // interest run과 반드시 같은 keyword group을 쓴다 — 046이 query_hash == keyword_group_sha256를 강제한다.
    const spec = resolveThemeKeywordGroup(theme)
    const querySha256 = keywordGroupSha256(spec)
    const requestPayload: JsonObject = {
      startDate,
      endDate,
      sort: 'date',
      keyword_group_spec: { group_name: spec.group_name, keywords: [...spec.keywords] },
    }
    const requestedAt = new Date().toISOString()

    let search: ThemeSearchResult
    try {
      search = await searchThemeNews({ themeId: theme.id, keywords: spec.keywords, startDate, endDate })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`   ⚠️ 테마 ${theme.id} 뉴스 검색 실패:`, message)

      const now = new Date().toISOString()
      failed++
      const persisted = await appendNewsRun({
        append: buildNewsCollectionRun({
          contractVersion: NEWS_CONTRACT_VERSION,
          themeId: theme.id,
          requestWindowStart: startDate,
          requestWindowEnd: endDate,
          requestPayload,
          responsePayload: null,
          keywordGroupSha256: querySha256,
          articleCountByDate: new Map(),
          timestamps: { requestedAt, collectedAt: now, completedAt: now },
          failureSummary: { reason: newsFailureReason(error), message },
        }),
        transport: options.transport,
      })
      if (!persisted) persistenceFailed++
      await sleep(200)
      continue
    }

    const collectedAt = new Date().toISOString()
    const coverageFailure: JsonObject | null = search.coverageStatus === 'complete'
      ? null
      : {
          reason: 'naver_news_coverage_incomplete',
          coverage_status: search.coverageStatus,
          coverage_note: search.coverageNote,
          observed_start_date: search.observedStartDate,
          observed_end_date: search.observedEndDate,
          api_total: search.apiTotal,
          pages: search.pages,
        }
    const append = buildNewsCollectionRun({
      contractVersion: NEWS_CONTRACT_VERSION,
      themeId: theme.id,
      requestWindowStart: startDate,
      requestWindowEnd: endDate,
      requestPayload,
      responsePayload: {
        total: search.apiTotal,
        pages: search.pages,
        coverage_status: search.coverageStatus,
        observed_start_date: search.observedStartDate,
        observed_end_date: search.observedEndDate,
      },
      keywordGroupSha256: querySha256,
      articleCountByDate: search.dateCounts,
      timestamps: { requestedAt, collectedAt, completedAt: new Date().toISOString() },
      failureSummary: coverageFailure,
    })

    try {
      // snapshot을 먼저 확정한다. 실패하면 이 테마의 metric은 current cache로 전파되지 않는다.
      await appendCollectionRun(append, options.transport)
    } catch (error: unknown) {
      failed++
      persistenceFailed++
      console.error(`   ❌ 테마 ${theme.id} news snapshot append 실패 (cache 미반영):`,
        error instanceof Error ? error.message : String(error))
      await sleep(200)
      continue
    }

    if (coverageFailure !== null) {
      failed++
      console.warn(`   ⚠️ 테마 ${theme.id} 뉴스 coverage 불완전 (${search.coverageStatus}); partial run만 기록하고 cache는 미반영`)
      await sleep(200)
      continue
    }

    succeeded++

    await sleep(200)

    // current cache는 기존 계약(관측된 날짜만)을 그대로 유지한다.
    // explicit zero row는 immutable snapshot 전용 — cache 경로의 동작을 바꾸지 않는다.
    for (const [date, articleCount] of search.dateCounts) {
      metrics.push({ themeId: theme.id, date, articleCount })
    }

    // Keep only 10 most recent articles per theme (already sorted by date from API)
    allArticles.push(...search.articles.slice(0, 10))

    const totalArticles = [...search.dateCounts.values()].reduce((a, b) => a + b, 0)
    console.log(`   ✓ ${theme.id}: ${totalArticles}건 (${search.dateCounts.size}일, 기사 ${Math.min(search.articles.length, 10)}개, expected slot ${calendarDatesBetween(startDate, endDate).length})`)
  }

  console.log(`\n   ✅ ${metrics.length}개 뉴스 메트릭, ${allArticles.length}개 기사 수집 완료`)
  return {
    metrics,
    articles: allArticles,
    report: { requested, succeeded, failed, persistenceFailed },
  }
}

async function appendNewsRun(input: {
  readonly append: ReturnType<typeof buildNewsCollectionRun>
  readonly transport?: CollectionRunTransport
}): Promise<boolean> {
  try {
    await appendCollectionRun(input.append, input.transport)
    return true
  } catch (error: unknown) {
    console.error('   ⚠️ failed news run 기록 실패:', error instanceof Error ? error.message : String(error))
    return false
  }
}
