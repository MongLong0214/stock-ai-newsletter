import { config } from 'dotenv'
config({ path: '.env.local' })

import {
  buildEpisodePeakBackfillPlan,
  type EpisodePeakBackfillEpisode,
  type EpisodePeakBackfillPlan,
  type EpisodePeakBackfillScoreRow,
} from '@/scripts/tli/ops/episode-peak-backfill'
import { batchQuery } from '@/scripts/tli/shared/supabase-batch'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'

interface QueryError {
  readonly message: string
}

interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<{
    readonly data: readonly T[] | null
    readonly error: QueryError | null
  }>
}

export interface EpisodePeakBackfillResult {
  readonly dryRun: boolean
  readonly episodesExamined: number
  readonly peaksComputed: number
  readonly peaksStillNull: number
  readonly reasonCounts: Readonly<Record<string, number>>
}

const PAGE_SIZE = 1000

const printUsage = (): void => {
  console.log([
    'Usage: npm run tli:episode:peak-backfill -- --dry-run=1',
    '',
    'Options:',
    '  --dry-run=1   Print planned updates only (default)',
    '  --dry-run=0   Apply updates to episode_registry_v1.primary_peak_date and peak_score',
  ].join('\n'))
}

const parseDryRun = (args: readonly string[]): boolean => {
  const value = args.find((arg) => arg.startsWith('--dry-run='))?.slice('--dry-run='.length)
  if (value === undefined || value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  throw new Error(`Invalid --dry-run value: ${value}`)
}

const addDays = (date: string, days: number): string => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next.toISOString().split('T')[0] ?? date
}

const fetchAllRows = async <T>(createQuery: () => RangeQuery<T>): Promise<T[]> => {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await createQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`episode peak backfill load failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].sort()

const readDateBounds = (
  episodes: readonly EpisodePeakBackfillEpisode[],
): { readonly startDate: string; readonly endExclusive: string } | null => {
  const starts = episodes.map((episode) => episode.episode_start).sort()
  const ends = episodes.flatMap((episode) => episode.episode_end ?? []).sort()
  const startDate = starts[0]
  const endDate = ends.at(-1)
  if (startDate === undefined || endDate === undefined) return null
  return { startDate, endExclusive: addDays(endDate, 1) }
}

const loadTargetEpisodes = async (): Promise<EpisodePeakBackfillEpisode[]> => fetchAllRows(() => supabaseAdmin
  .from('episode_registry_v1')
  .select('id, theme_id, episode_start, episode_end, is_active, primary_peak_date, peak_score')
  .eq('is_active', false)
  .not('episode_end', 'is', null)
  .is('primary_peak_date', null)
  .order('episode_end', { ascending: true })
  .order('theme_id', { ascending: true })
  .order('episode_number', { ascending: true }))

const loadScoreRows = async (
  episodes: readonly EpisodePeakBackfillEpisode[],
): Promise<EpisodePeakBackfillScoreRow[]> => {
  const bounds = readDateBounds(episodes)
  if (bounds === null) return []

  return batchQuery<EpisodePeakBackfillScoreRow>(
    'lifecycle_scores',
    'theme_id, calculated_at, score',
    uniqueSorted(episodes.map((episode) => episode.theme_id)),
    (query) => query
      .gte('calculated_at', bounds.startDate)
      .lt('calculated_at', bounds.endExclusive)
      .order('calculated_at', { ascending: true }),
    'theme_id',
    { failOnError: true },
  )
}

const countNullReasons = (
  plans: readonly EpisodePeakBackfillPlan[],
): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {}
  for (const plan of plans) {
    if (plan.nullReason === null) continue
    counts[plan.nullReason] = (counts[plan.nullReason] ?? 0) + 1
  }
  return counts
}

const printPlan = (plans: readonly EpisodePeakBackfillPlan[]): void => {
  for (const plan of plans) {
    if (plan.peakDate === null) {
      console.log(`- skip episode=${plan.episode.id} theme=${plan.episode.theme_id} reason=${plan.nullReason}`)
      continue
    }
    console.log(
      `- update episode=${plan.episode.id} theme=${plan.episode.theme_id} peak=${plan.peakDate} score=${plan.peakScore ?? 'null'} source_scores=${plan.scoreCount}`,
    )
  }
}

const applyUpdates = async (plans: readonly EpisodePeakBackfillPlan[]): Promise<number> => {
  let updated = 0
  for (const plan of plans) {
    if (plan.peakDate === null) continue
    const { error } = await supabaseAdmin
      .from('episode_registry_v1')
      .update({
        primary_peak_date: plan.peakDate,
        peak_score: plan.peakScore,
      })
      .eq('id', plan.episode.id)

    if (error) {
      throw new Error(`episode peak update failed (${plan.episode.id}): ${error.message}`)
    }
    updated += 1
  }
  return updated
}

export async function runEpisodePeakBackfill(input: {
  readonly dryRun?: boolean
} = {}): Promise<EpisodePeakBackfillResult> {
  const dryRun = input.dryRun ?? true
  const episodes = await loadTargetEpisodes()
  const scores = await loadScoreRows(episodes)
  const plans = buildEpisodePeakBackfillPlan({ episodes, scores })
  const peaksComputed = plans.filter((plan) => plan.peakDate !== null).length
  const peaksStillNull = plans.length - peaksComputed
  const reasonCounts = countNullReasons(plans)

  printPlan(plans)
  if (!dryRun) {
    const updated = await applyUpdates(plans)
    console.log(`applied_updates=${updated}`)
  }

  const result = {
    dryRun,
    episodesExamined: plans.length,
    peaksComputed,
    peaksStillNull,
    reasonCounts,
  }
  console.log(`summary=${JSON.stringify(result)}`)
  return result
}

const isDirectRun = process.argv[1]?.includes('run-episode-peak-backfill') ?? false
if (isDirectRun) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage()
    process.exit(0)
  }

  runEpisodePeakBackfill({ dryRun: parseDryRun(process.argv.slice(2)) }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
