import { z } from 'zod'
import { calculatePrediction } from '@/lib/tli/prediction'
import {
  buildPredictionParityReport,
  shiftDate,
  type PredictionParityItem,
  type PredictionParityLivePrediction,
  type PredictionParityReport,
} from './prediction-parity-report'
import type { ComparisonInput } from '@/lib/tli/prediction'

const PhaseSchema = z.enum(['rising', 'hot', 'cooling'])
const ConfidenceSchema = z.enum(['low', 'medium', 'high'])
const RiskSchema = z.enum(['low', 'moderate', 'high', 'critical'])
const StageSchema = z.enum(['Dormant', 'Emerging', 'Growth', 'Peak', 'Decline'])

const SnapshotRowSchema = z.object({
  id: z.string(),
  theme_id: z.string(),
  snapshot_date: z.string(),
  comparison_run_id: z.string(),
  phase: PhaseSchema,
  confidence: ConfidenceSchema,
  risk_level: RiskSchema,
  avg_peak_day: z.number(),
  avg_total_days: z.number(),
  avg_days_to_peak: z.number(),
  days_since_spike: z.number(),
  created_at: z.string(),
})

const CandidateRowSchema = z.object({
  run_id: z.string(),
  candidate_theme_id: z.string(),
  rank: z.number(),
  similarity_score: z.number(),
  past_peak_day: z.number(),
  past_total_days: z.number(),
  estimated_days_to_peak: z.number(),
  created_at: z.string().nullable(),
})

const ThemeRowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  first_spike_date: z.string().nullable(),
})

const ScoreRowSchema = z.object({
  theme_id: z.string(),
  score: z.number(),
  stage: StageSchema.nullable(),
  calculated_at: z.string(),
})

type SnapshotRow = z.infer<typeof SnapshotRowSchema>
type CandidateRow = z.infer<typeof CandidateRowSchema>
type ThemeRow = z.infer<typeof ThemeRowSchema>
type ScoreRow = z.infer<typeof ScoreRowSchema>

/** evaluate-predictions.ts의 target-date 최근접 매칭과 동일한 관용구 — snapshot 시점 이후 갱신된 점수와의 오탐 비교 방지 */
const SCORE_MATCH_TOLERANCE_MS = 1 * 24 * 60 * 60 * 1000 // ±1일

function findNearestScore(scores: readonly ScoreRow[], targetDate: string): ScoreRow | null {
  const targetTime = new Date(`${targetDate}T00:00:00.000Z`).getTime()
  let closest: { score: ScoreRow; diff: number } | null = null

  for (const score of scores) {
    const diff = Math.abs(new Date(score.calculated_at).getTime() - targetTime)
    if (!closest || diff < closest.diff) {
      closest = { score, diff }
    }
  }

  if (!closest || closest.diff > SCORE_MATCH_TOLERANCE_MS) return null
  return closest.score
}

function toComparisonInputs(input: {
  readonly candidates: readonly CandidateRow[]
  readonly themeNames: ReadonlyMap<string, string>
}): ComparisonInput[] {
  return [...input.candidates]
    .sort((a, b) => a.rank - b.rank)
    .map((candidate) => ({
      pastTheme: input.themeNames.get(candidate.candidate_theme_id) ?? candidate.candidate_theme_id,
      similarity: candidate.similarity_score,
      estimatedDaysToPeak: candidate.estimated_days_to_peak,
      pastPeakDay: candidate.past_peak_day,
      pastTotalDays: candidate.past_total_days,
    }))
}

function toLivePrediction(input: {
  readonly snapshot: SnapshotRow
  readonly theme: ThemeRow | undefined
  readonly candidates: readonly CandidateRow[]
  readonly themeNames: ReadonlyMap<string, string>
  readonly scores: readonly ScoreRow[]
}): { readonly livePrediction: PredictionParityLivePrediction | null; readonly scoreMissing: boolean } {
  // snapshot 시점(snapshot_date) 당시의 과거 score를 사용 — 최신 score를 쓰면 이후 갱신된 값과 비교되어 오탐 발생
  const nearestScore = findNearestScore(input.scores, input.snapshot.snapshot_date)
  if (!nearestScore) {
    return { livePrediction: null, scoreMissing: true }
  }

  const comparisons = toComparisonInputs({ candidates: input.candidates, themeNames: input.themeNames })
  const prediction = calculatePrediction(
    input.theme?.first_spike_date ?? null,
    comparisons,
    input.snapshot.snapshot_date,
    nearestScore.score,
    nearestScore.stage ?? undefined,
  )
  if (!prediction) return { livePrediction: null, scoreMissing: false }

  return {
    livePrediction: {
      phase: prediction.phase,
      confidence: prediction.confidence,
      riskLevel: prediction.riskLevel,
      avgPeakDay: prediction.avgPeakDay,
      avgTotalDays: prediction.avgTotalDays,
      avgDaysToPeak: prediction.avgDaysToPeak,
      daysSinceSpike: prediction.daysSinceSpike,
    },
    scoreMissing: false,
  }
}

export async function loadPredictionParityReport(input: {
  readonly asOfDate: string
  readonly windowDays: number
}): Promise<PredictionParityReport> {
  const { supabaseAdmin } = await import('@/scripts/tli/shared/supabase-admin')
  const { batchQuery } = await import('@/scripts/tli/shared/supabase-batch')
  const startDate = shiftDate(input.asOfDate, -(input.windowDays - 1))

  const { data, error } = await supabaseAdmin
    .from('prediction_snapshots_v2')
    .select('id, theme_id, snapshot_date, comparison_run_id, phase, confidence, risk_level, avg_peak_day, avg_total_days, avg_days_to_peak, days_since_spike, created_at')
    .gte('snapshot_date', startDate)
    .lte('snapshot_date', input.asOfDate)
    .order('snapshot_date', { ascending: false })

  if (error) throw new Error(`prediction parity snapshot load failed: ${error.message}`)
  const snapshots = SnapshotRowSchema.array().parse(data ?? [])
  const runIds = [...new Set(snapshots.map((snapshot) => snapshot.comparison_run_id))]
  const themeIds = [...new Set(snapshots.map((snapshot) => snapshot.theme_id))]
  const candidates = CandidateRowSchema.array().parse(await batchQuery(
    'theme_comparison_candidates_v2',
    'run_id, candidate_theme_id, rank, similarity_score, past_peak_day, past_total_days, estimated_days_to_peak, created_at',
    runIds,
    (query) => query.order('rank', { ascending: true }),
    'run_id',
    { failOnError: true },
  ))

  const candidateThemeIds = candidates.map((candidate) => candidate.candidate_theme_id)
  const themes = ThemeRowSchema.array().parse(await batchQuery(
    'themes',
    'id, name, first_spike_date',
    [...new Set([...themeIds, ...candidateThemeIds])],
    undefined,
    'id',
    { failOnError: true },
  ))
  // 점수는 각 스냅샷 날짜의 ±1일 최근접만 쓴다(findNearestScore). 스냅샷은 [startDate, asOfDate]
  // 구간이므로 그 구간 -2일 이전 점수는 절대 매칭되지 않는다. 테마별 전 이력 로드는 불필요한
  // egress(2026-07 egress 초과의 잔여 원인) — 윈도우로 바운드한다.
  const scoreLowerBound = shiftDate(startDate, -2)
  const scores = ScoreRowSchema.array().parse(await batchQuery(
    'lifecycle_scores',
    'theme_id, score, stage, calculated_at',
    themeIds,
    (query) => query.gte('calculated_at', scoreLowerBound).order('calculated_at', { ascending: false }),
    'theme_id',
    { failOnError: true },
  ))

  const themeById = new Map(themes.map((theme) => [theme.id, theme]))
  const themeNames = new Map(themes.map((theme) => [theme.id, theme.name ?? theme.id]))
  const scoresByTheme = new Map<string, ScoreRow[]>()
  for (const score of scores) {
    scoresByTheme.set(score.theme_id, [...(scoresByTheme.get(score.theme_id) ?? []), score])
  }
  const candidatesByRun = new Map<string, CandidateRow[]>()
  for (const candidate of candidates) {
    candidatesByRun.set(candidate.run_id, [...(candidatesByRun.get(candidate.run_id) ?? []), candidate])
  }

  // B-Abl 관측이 스냅샷을 고정(FK RESTRICT)한 뒤 같은 날 재실행이 후보만 갱신하면, 스냅샷은
  // 첫 기록(PIT 원본)으로 남고 후보는 더 새 빈티지가 된다. 이런 행은 "저장 후보로부터의
  // 결정적 재계산" 계약 대상이 아니므로 parity에서 제외한다 (후보가 스냅샷보다 새로움 = 그 시그니처).
  const isStaleInputSnapshot = (snapshot: SnapshotRow): boolean => {
    const runCandidates = candidatesByRun.get(snapshot.comparison_run_id) ?? []
    const snapshotTime = new Date(snapshot.created_at).getTime()
    return runCandidates.some((candidate) =>
      candidate.created_at !== null && new Date(candidate.created_at).getTime() > snapshotTime,
    )
  }

  const staleInputExcludedCount = snapshots.filter(isStaleInputSnapshot).length
  const items: PredictionParityItem[] = snapshots
    .filter((snapshot) => !isStaleInputSnapshot(snapshot))
    .map((snapshot) => {
      const { livePrediction, scoreMissing } = toLivePrediction({
        snapshot,
        theme: themeById.get(snapshot.theme_id),
        candidates: candidatesByRun.get(snapshot.comparison_run_id) ?? [],
        themeNames,
        scores: scoresByTheme.get(snapshot.theme_id) ?? [],
      })
      return { snapshot, livePrediction, scoreMissing }
    })

  return {
    ...buildPredictionParityReport({ asOfDate: input.asOfDate, windowDays: input.windowDays, items }),
    staleInputExcludedCount,
  }
}
