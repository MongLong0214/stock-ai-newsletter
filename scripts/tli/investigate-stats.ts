/**
 * DB Investigation Script: Why are hottestTheme and surging null?
 *
 * Queries all active themes and checks each condition for:
 * - hottestTheme: score >= 40, stockCount >= 5, newsCount7d >= 1
 * - surging: stage Early/Growth, score >= 35, change7d > 5, newsCount7d >= 3,
 *            stockCount >= 5, sparkline.length >= 3, sentimentScore >= -0.1
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length)
}

function rpad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(120))
  console.log('  DB INVESTIGATION: Why are hottestTheme and surging null?')
  console.log('='.repeat(120))
  console.log()

  // 1. Get all active themes
  const { data: themes, error: themesErr } = await supabase
    .from('themes')
    .select('id, name, name_en, is_active, created_at')
    .eq('is_active', true)
    .order('name')

  if (themesErr) {
    console.error('Error fetching themes:', themesErr.message)
    process.exit(1)
  }

  console.log(`Found ${themes.length} active themes\n`)

  if (themes.length === 0) {
    console.log('NO ACTIVE THEMES FOUND. This is why everything is null.')
    process.exit(0)
  }

  const themeIds = themes.map((t: { id: string }) => t.id)

  // 2. Get latest lifecycle_scores for each theme (last 14 days)
  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0]

  const { data: allScores, error: scoresErr } = await supabase
    .from('lifecycle_scores')
    .select('theme_id, score, stage, is_reigniting, calculated_at, components')
    .in('theme_id', themeIds)
    .gte('calculated_at', fourteenDaysAgoStr)
    .order('calculated_at', { ascending: false })

  if (scoresErr) {
    console.error('Error fetching scores:', scoresErr.message)
    process.exit(1)
  }

  console.log(`Found ${allScores.length} lifecycle_score records in last 14 days\n`)

  // 3. Get stock counts per theme (is_active=true)
  const { data: stockRows, error: stockErr } = await supabase
    .from('theme_stocks')
    .select('theme_id, name')
    .in('theme_id', themeIds)
    .eq('is_active', true)

  if (stockErr) {
    console.error('Error fetching stocks:', stockErr.message)
    process.exit(1)
  }

  // 4. Get news articles in last 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

  const { data: newsRows, error: newsErr } = await supabase
    .from('theme_news_articles')
    .select('theme_id, pub_date')
    .in('theme_id', themeIds)
    .gte('pub_date', sevenDaysAgoStr)

  if (newsErr) {
    console.error('Error fetching news:', newsErr.message)
    process.exit(1)
  }

  // 5. Get sentiment data (from lifecycle_scores components)
  // Sentiment is stored inside the components JSONB field

  // ── Build aggregated data per theme ────────────────────────────────────────

  // Stock count map
  const stockCountMap = new Map<string, number>()
  for (const s of stockRows) {
    stockCountMap.set(s.theme_id, (stockCountMap.get(s.theme_id) || 0) + 1)
  }

  // News count map (7d)
  const newsCountMap = new Map<string, number>()
  for (const n of newsRows) {
    newsCountMap.set(n.theme_id, (newsCountMap.get(n.theme_id) || 0) + 1)
  }

  // Score meta per theme (latest, 7d ago, sparkline)
  const scoreMetaMap = new Map<string, {
    latest: { score: number; stage: string | null; is_reigniting: boolean; calculated_at: string; components: any } | null
    weekAgoScore: number | null
    sparkline: number[]
    sentimentScore: number
  }>()

  for (const s of allScores) {
    if (!scoreMetaMap.has(s.theme_id)) {
      scoreMetaMap.set(s.theme_id, { latest: null, weekAgoScore: null, sparkline: [], sentimentScore: 0 })
    }
    const meta = scoreMetaMap.get(s.theme_id)!
    const dateStr = s.calculated_at.includes('T') ? s.calculated_at.split('T')[0] : s.calculated_at

    // Latest (first because desc order)
    if (!meta.latest) {
      meta.latest = s
      // Extract sentiment from components
      const comp = s.components as any
      if (comp && typeof comp === 'object') {
        // sentimentScore might be stored as normalized or raw
        meta.sentimentScore = comp.sentiment_normalized ?? comp.sentiment ?? comp.raw?.sentimentAvg ?? 0
      }
    }

    // 7 days ago score
    if (meta.weekAgoScore === null && dateStr <= sevenDaysAgoStr) {
      meta.weekAgoScore = s.score
    }

    // Sparkline (7d)
    if (dateStr >= sevenDaysAgoStr) {
      meta.sparkline.push(s.score)
    }
  }

  // Reverse sparklines (desc -> asc)
  for (const meta of scoreMetaMap.values()) {
    meta.sparkline.reverse()
  }

  // ── Print Theme Table ──────────────────────────────────────────────────────

  console.log('─'.repeat(160))
  console.log(
    pad('Theme Name', 30) +
    rpad('Score', 7) +
    pad(' Stage', 12) +
    rpad('Stocks', 8) +
    rpad('News7d', 8) +
    rpad('Spark#', 8) +
    rpad('Change7d', 10) +
    rpad('Sentiment', 11) +
    ' │ ' +
    pad('Hottest?', 30) +
    pad('Surging?', 40)
  )
  console.log('─'.repeat(160))

  interface ThemeAnalysis {
    name: string
    score: number
    stage: string
    stockCount: number
    newsCount7d: number
    sparklineLen: number
    change7d: number
    sentimentScore: number
    hottestFails: string[]
    surgingFails: string[]
    hasScore: boolean
  }

  const analyses: ThemeAnalysis[] = []

  // Condition failure counters
  const hottestFailCounts: Record<string, number> = {
    'no_score': 0,
    'score<40': 0,
    'stocks<5': 0,
    'news7d<1': 0,
  }

  const surgingFailCounts: Record<string, number> = {
    'no_score': 0,
    'not_Early/Growth': 0,
    'score<35': 0,
    'change7d<=5': 0,
    'news7d<3': 0,
    'stocks<5': 0,
    'sparkline<3': 0,
    'sentiment<-0.1': 0,
  }

  for (const theme of themes) {
    const meta = scoreMetaMap.get(theme.id)
    const stockCount = stockCountMap.get(theme.id) || 0
    const newsCount7d = newsCountMap.get(theme.id) || 0

    const score = meta?.latest?.score ?? -1
    const stage = meta?.latest?.stage ?? 'N/A'
    const sparklineLen = meta?.sparkline?.length ?? 0
    const weekAgoScore = meta?.weekAgoScore ?? null
    const change7d = weekAgoScore !== null ? score - weekAgoScore : 0
    const sentimentScore = meta?.sentimentScore ?? 0
    const hasScore = meta?.latest !== null

    // Check hottest conditions
    const hottestFails: string[] = []
    if (!hasScore) { hottestFails.push('NO_SCORE'); hottestFailCounts['no_score']++ }
    if (score < 40) { hottestFails.push(`score=${score}<40`); hottestFailCounts['score<40']++ }
    if (stockCount < 5) { hottestFails.push(`stocks=${stockCount}<5`); hottestFailCounts['stocks<5']++ }
    if (newsCount7d < 1) { hottestFails.push(`news=${newsCount7d}<1`); hottestFailCounts['news7d<1']++ }

    // Check surging conditions
    const surgingFails: string[] = []
    if (!hasScore) { surgingFails.push('NO_SCORE'); surgingFailCounts['no_score']++ }
    if (stage !== 'Early' && stage !== 'Growth') { surgingFails.push(`stage=${stage}`); surgingFailCounts['not_Early/Growth']++ }
    if (score < 35) { surgingFails.push(`score=${score}<35`); surgingFailCounts['score<35']++ }
    if (change7d <= 5) { surgingFails.push(`chg7d=${change7d.toFixed(1)}<=5`); surgingFailCounts['change7d<=5']++ }
    if (newsCount7d < 3) { surgingFails.push(`news=${newsCount7d}<3`); surgingFailCounts['news7d<3']++ }
    if (stockCount < 5) { surgingFails.push(`stocks=${stockCount}<5`); surgingFailCounts['stocks<5']++ }
    if (sparklineLen < 3) { surgingFails.push(`spark=${sparklineLen}<3`); surgingFailCounts['sparkline<3']++ }
    if (sentimentScore < -0.1) { surgingFails.push(`sent=${sentimentScore.toFixed(2)}<-0.1`); surgingFailCounts['sentiment<-0.1']++ }

    const hottestStatus = hottestFails.length === 0 ? 'PASS' : hottestFails.join(', ')
    const surgingStatus = surgingFails.length === 0 ? 'PASS' : surgingFails.join(', ')

    console.log(
      pad(theme.name, 30) +
      rpad(score >= 0 ? score.toString() : 'N/A', 7) +
      pad(' ' + stage, 12) +
      rpad(stockCount.toString(), 8) +
      rpad(newsCount7d.toString(), 8) +
      rpad(sparklineLen.toString(), 8) +
      rpad(change7d.toFixed(1), 10) +
      rpad(sentimentScore.toFixed(2), 11) +
      ' │ ' +
      pad(hottestStatus, 30) +
      pad(surgingStatus, 40)
    )

    analyses.push({
      name: theme.name,
      score,
      stage,
      stockCount,
      newsCount7d,
      sparklineLen,
      change7d,
      sentimentScore,
      hottestFails,
      surgingFails,
      hasScore,
    })
  }

  console.log('─'.repeat(160))

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(80))
  console.log('  CONDITION FAILURE SUMMARY')
  console.log('='.repeat(80))

  console.log('\n--- HOTTEST THEME (주도테마) conditions ---')
  console.log('Requirements: score >= 40 AND stockCount >= 5 AND newsCount7d >= 1')
  console.log()
  for (const [cond, count] of Object.entries(hottestFailCounts)) {
    const pct = ((count / themes.length) * 100).toFixed(0)
    console.log(`  ${pad(cond, 15)} : ${count}/${themes.length} themes fail (${pct}%)`)
  }

  const hottestPassCount = analyses.filter(a => a.hottestFails.length === 0).length
  console.log(`\n  >>> ${hottestPassCount} themes PASS all hottest conditions`)

  console.log('\n--- SURGING (급상승) conditions ---')
  console.log('Requirements: Early/Growth stage, score >= 35, change7d > 5, newsCount7d >= 3,')
  console.log('              stockCount >= 5, sparkline >= 3, sentimentScore >= -0.1')
  console.log()
  for (const [cond, count] of Object.entries(surgingFailCounts)) {
    const pct = ((count / themes.length) * 100).toFixed(0)
    console.log(`  ${pad(cond, 20)} : ${count}/${themes.length} themes fail (${pct}%)`)
  }

  const surgingPassCount = analyses.filter(a => a.surgingFails.length === 0).length
  console.log(`\n  >>> ${surgingPassCount} themes PASS all surging conditions`)

  // ── Closest Misses ─────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(80))
  console.log('  CLOSEST MISSES')
  console.log('='.repeat(80))

  // Hottest: sort by fewest failures
  const hottestSorted = analyses
    .filter(a => a.hasScore)
    .sort((a, b) => a.hottestFails.length - b.hottestFails.length || b.score - a.score)
    .slice(0, 10)

  console.log('\n--- Top 10 closest to HOTTEST THEME ---')
  for (const a of hottestSorted) {
    const status = a.hottestFails.length === 0 ? 'PASS' : `FAIL(${a.hottestFails.length})`
    console.log(
      `  ${pad(a.name, 28)} score=${rpad(a.score.toString(), 3)} stocks=${rpad(a.stockCount.toString(), 3)} news7d=${rpad(a.newsCount7d.toString(), 3)} | ${status}: ${a.hottestFails.join(', ') || 'ALL PASS'}`
    )
  }

  // Surging: sort by fewest failures
  const surgingSorted = analyses
    .filter(a => a.hasScore)
    .sort((a, b) => a.surgingFails.length - b.surgingFails.length || b.change7d - a.change7d)
    .slice(0, 10)

  console.log('\n--- Top 10 closest to SURGING ---')
  for (const a of surgingSorted) {
    const status = a.surgingFails.length === 0 ? 'PASS' : `FAIL(${a.surgingFails.length})`
    console.log(
      `  ${pad(a.name, 28)} stage=${pad(a.stage, 8)} score=${rpad(a.score.toString(), 3)} chg7d=${rpad(a.change7d.toFixed(1), 6)} news7d=${rpad(a.newsCount7d.toString(), 3)} stocks=${rpad(a.stockCount.toString(), 3)} spark=${a.sparklineLen} | ${status}: ${a.surgingFails.join(', ') || 'ALL PASS'}`
    )
  }

  // ── Raw data dump for top themes ───────────────────────────────────────────

  console.log('\n' + '='.repeat(80))
  console.log('  RAW SCORE COMPONENTS (top 10 by score)')
  console.log('='.repeat(80))

  const topByScore = analyses
    .filter(a => a.hasScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  for (const a of topByScore) {
    const meta = scoreMetaMap.get(themes.find((t: { name: string }) => t.name === a.name)!.id)
    const comp = meta?.latest?.components as any
    console.log(`\n  ${a.name} (score=${a.score}, stage=${a.stage})`)
    console.log(`    calculated_at: ${meta?.latest?.calculated_at}`)
    console.log(`    components: ${JSON.stringify(comp, null, 2)?.split('\n').join('\n    ')}`)
    console.log(`    sparkline: [${meta?.sparkline?.join(', ')}]`)
    console.log(`    weekAgoScore: ${meta?.weekAgoScore ?? 'null'} → change7d: ${a.change7d.toFixed(1)}`)
  }

  // ── Additional: Check all news articles dates ──────────────────────────────

  console.log('\n' + '='.repeat(80))
  console.log('  NEWS ARTICLES DATE DISTRIBUTION')
  console.log('='.repeat(80))

  const { data: allNews } = await supabase
    .from('theme_news_articles')
    .select('theme_id, pub_date')
    .in('theme_id', themeIds)
    .order('pub_date', { ascending: false })
    .limit(500)

  if (allNews && allNews.length > 0) {
    const dateDistribution = new Map<string, number>()
    for (const n of allNews) {
      const d = n.pub_date?.split('T')[0] ?? 'null'
      dateDistribution.set(d, (dateDistribution.get(d) || 0) + 1)
    }
    console.log('\n  Date distribution of news articles (most recent first):')
    const sortedDates = [...dateDistribution.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    for (const [date, count] of sortedDates.slice(0, 20)) {
      const isInWindow = date >= sevenDaysAgoStr ? ' <-- in 7d window' : ''
      console.log(`    ${date}: ${count} articles${isInWindow}`)
    }
    console.log(`\n  Total articles queried: ${allNews.length}`)
    console.log(`  7-day window starts at: ${sevenDaysAgoStr}`)
  } else {
    console.log('\n  No news articles found at all!')
  }

  // ── Check lifecycle_scores dates ───────────────────────────────────────────

  console.log('\n' + '='.repeat(80))
  console.log('  LIFECYCLE SCORES DATE DISTRIBUTION')
  console.log('='.repeat(80))

  const scoreDateDist = new Map<string, number>()
  for (const s of allScores) {
    const d = s.calculated_at?.includes('T') ? s.calculated_at.split('T')[0] : s.calculated_at
    scoreDateDist.set(d, (scoreDateDist.get(d) || 0) + 1)
  }
  const sortedScoreDates = [...scoreDateDist.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  console.log('\n  Date distribution of lifecycle_scores:')
  for (const [date, count] of sortedScoreDates) {
    console.log(`    ${date}: ${count} scores`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('  INVESTIGATION COMPLETE')
  console.log('='.repeat(80))
}

main().catch(err => {
  console.error('Script failed:', err)
  process.exit(1)
})
