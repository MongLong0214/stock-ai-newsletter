import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// --- Types ---

export interface HistoricalData {
  dumpDate: string
  dateRange: { from: string; to: string }
  themes: HistoricalTheme[]
}

export interface HistoricalTheme {
  id: string
  name: string
  firstSpikeDate: string | null
  interestMetrics: Array<{
    time: string
    raw_value: number
    normalized: number
  }>
  newsMetrics: Array<{
    time: string
    article_count: number
  }>
  lifecycleScores: Array<{
    calculated_at: string
    score: number
    stage: string
    components: Record<string, unknown>
  }>
}

// --- Constants ---

const MIN_DAYS = 30
const LOOKBACK_DAYS = 90
const OUTPUT_PATH = path.resolve(__dirname, 'historical-data.json')

// --- Helpers ---

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function assertGitignoreContainsPattern(): void {
  const gitignorePath = path.resolve(process.cwd(), '.gitignore')
  const content = readFileSync(gitignorePath, 'utf-8')
  if (!content.includes('historical-data.json')) {
    throw new Error('historical-data.json이 .gitignore에 등록되지 않았습니다. 먼저 등록하세요.')
  }
}

function countUniqueDays(metrics: Array<{ time: string }>): number {
  const days = new Set(metrics.map(m => m.time))
  return days.size
}

/** 배치 크기 (.in() URL 길이 제한 회피) */
const BATCH_SIZE = 50

/** 배치로 분할하여 전체 행 가져오기 */
async function fetchInBatches<T>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  selectColumns: string,
  themeIds: string[],
  themeIdColumn: string,
  dateColumn: string,
  gteDate: string,
): Promise<T[]> {
  const allRows: T[] = []
  for (let i = 0; i < themeIds.length; i += BATCH_SIZE) {
    const batchIds = themeIds.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from(table)
      .select(selectColumns)
      .in(themeIdColumn, batchIds)
      .gte(dateColumn, gteDate)
      .range(0, 49999)

    if (error) throw new Error(`${table} 로딩 실패 (batch ${i}): ${error.message}`)
    if (data) allRows.push(...(data as T[]))
  }
  return allRows
}

// --- Main ---

export async function dumpHistoricalData(): Promise<HistoricalData> {
  // Step 1: .gitignore safety check
  assertGitignoreContainsPattern()

  const supabase = getSupabaseClient()
  const today = new Date()
  const lookbackDate = new Date(today.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const gteDate = toISODate(lookbackDate)

  // Step 2: Load active themes (SELECT only)
  const { data: themes, error: themesError } = await supabase
    .from('themes')
    .select('id, name, first_spike_date')
    .eq('is_active', true)

  if (themesError) throw new Error(`themes 로딩 실패: ${themesError.message}`)
  if (!themes?.length) {
    const result: HistoricalData = {
      dumpDate: toISODate(today),
      dateRange: { from: gteDate, to: toISODate(today) },
      themes: [],
    }
    writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8')
    console.log(`[dump-data] 활성 테마 0개 - 빈 파일 저장`)
    return result
  }

  const themeIds = themes.map(t => t.id)

  // Step 3: Query metrics in batches (SELECT only, .in() URL 길이 제한 회피)
  console.log(`[dump-data] ${themeIds.length}개 테마에서 데이터 로딩 중... (배치 ${BATCH_SIZE}개씩)`)

  const [interestData, newsData, scoresData] = await Promise.all([
    fetchInBatches<{ theme_id: string; time: string; raw_value: number; normalized: number }>(
      supabase, 'interest_metrics', 'theme_id, time, raw_value, normalized', themeIds, 'theme_id', 'time', gteDate,
    ),
    fetchInBatches<{ theme_id: string; time: string; article_count: number }>(
      supabase, 'news_metrics', 'theme_id, time, article_count', themeIds, 'theme_id', 'time', gteDate,
    ),
    fetchInBatches<{ theme_id: string; calculated_at: string; score: number; stage: string; components: Record<string, unknown> }>(
      supabase, 'lifecycle_scores', 'theme_id, calculated_at, score, stage, components', themeIds, 'theme_id', 'calculated_at', gteDate,
    ),
  ])

  console.log(`[dump-data] 로딩 완료: interest=${interestData.length}, news=${newsData.length}, scores=${scoresData.length}`)

  // Step 4: Group by theme
  const interestByTheme = new Map<string, typeof interestData>()
  for (const row of interestData) {
    const arr = interestByTheme.get(row.theme_id) ?? []
    arr.push(row)
    interestByTheme.set(row.theme_id, arr)
  }

  const newsByTheme = new Map<string, typeof newsData>()
  for (const row of newsData) {
    const arr = newsByTheme.get(row.theme_id) ?? []
    arr.push(row)
    newsByTheme.set(row.theme_id, arr)
  }

  const scoresByTheme = new Map<string, typeof scoresData>()
  for (const row of scoresData) {
    const arr = scoresByTheme.get(row.theme_id) ?? []
    arr.push(row)
    scoresByTheme.set(row.theme_id, arr)
  }

  // Step 5: Merge + filter (>= 60 unique days of interest data)
  const historicalThemes: HistoricalTheme[] = []

  for (const theme of themes) {
    const interest = interestByTheme.get(theme.id) ?? []
    const uniqueDays = countUniqueDays(interest)

    if (uniqueDays < MIN_DAYS) continue

    historicalThemes.push({
      id: theme.id,
      name: theme.name,
      firstSpikeDate: theme.first_spike_date ?? null,
      interestMetrics: interest.map(m => ({
        time: m.time,
        raw_value: m.raw_value,
        normalized: m.normalized,
      })),
      newsMetrics: (newsByTheme.get(theme.id) ?? []).map(m => ({
        time: m.time,
        article_count: m.article_count,
      })),
      lifecycleScores: (scoresByTheme.get(theme.id) ?? []).map(s => ({
        calculated_at: s.calculated_at,
        score: s.score,
        stage: s.stage,
        components: (s.components ?? {}) as Record<string, unknown>,
      })),
    })
  }

  // Step 6: Compute date range
  const allDates = interestData.map(m => m.time).sort()
  const dateRange = {
    from: allDates[0] ?? gteDate,
    to: allDates[allDates.length - 1] ?? toISODate(today),
  }

  const result: HistoricalData = {
    dumpDate: toISODate(today),
    dateRange,
    themes: historicalThemes,
  }

  // Step 7: Save + log summary
  writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8')

  console.log(
    `[dump-data] 완료: ${historicalThemes.length}개 테마 덤프 (${dateRange.from} ~ ${dateRange.to})`,
  )

  return result
}

// CLI entrypoint
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: '.env.local' })

  dumpHistoricalData()
    .then(data => {
      console.log(`저장 완료: ${OUTPUT_PATH}`)
      console.log(`테마 수: ${data.themes.length}`)
    })
    .catch(err => {
      console.error('덤프 실패:', err)
      process.exit(1)
    })
}
