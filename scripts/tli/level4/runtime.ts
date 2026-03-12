import { join } from 'node:path'
import { buildLevel4CertificationChecklist, renderLevel4CertificationReport } from './certification-rehearsal'
import type { WeightTuningCandidateRow } from './tune-weights'

interface EvalLikeRow {
  run_id: string
  candidate_theme_id: string
  binary_relevant: boolean
  censored_reason: string | null
}

interface CandidateLikeRow {
  run_id: string
  run_date: string
  candidate_theme_id: string
  feature_sim: number | null
  curve_sim: number | null
  keyword_sim: number | null
  current_day?: number | null
  past_total_days?: number | null
}

function resolveCurveBucket(input: {
  currentDay?: number | null
  pastTotalDays?: number | null
}): 'gte14' | 'gte7' | 'lt7' {
  const minCurveLen = Math.min(input.currentDay ?? 0, input.pastTotalDays ?? Number.POSITIVE_INFINITY)
  if (minCurveLen >= 14) return 'gte14'
  if (minCurveLen >= 7) return 'gte7'
  return 'lt7'
}

export function buildWeightTuningRows(input: {
  evalRows: EvalLikeRow[]
  candidateRows: CandidateLikeRow[]
}): WeightTuningCandidateRow[] {
  const evalMap = new Map(
    input.evalRows.map((row) => [`${row.run_id}:${row.candidate_theme_id}`, row]),
  )

  return input.candidateRows.map((row) => {
    const evaluation = evalMap.get(`${row.run_id}:${row.candidate_theme_id}`)
    return {
      run_id: row.run_id,
      run_date: row.run_date,
      candidate_theme_id: row.candidate_theme_id,
      feature_sim: row.feature_sim ?? 0,
      curve_sim: row.curve_sim ?? 0,
      keyword_sim: row.keyword_sim ?? 0,
      curve_bucket: resolveCurveBucket({
        currentDay: row.current_day,
        pastTotalDays: row.past_total_days,
      }),
      sector_match: true,
      binary_relevant: evaluation?.binary_relevant ?? false,
      censored_reason: evaluation?.censored_reason ?? null,
    }
  })
}

export function buildWeightTuningOutputPaths(timestamp: string) {
  return {
    reportPath: join(process.cwd(), '.omx', 'scientist', 'reports', `${timestamp}_weight_tuning_report.md`),
    figurePath: join(process.cwd(), '.omx', 'scientist', 'figures', `${timestamp}_weight_tuning_metrics.svg`),
  }
}

export function buildCertificationOutput(input: {
  releaseCandidate: string
  checklist: ReturnType<typeof buildLevel4CertificationChecklist>
  calibrationVersion: string | null
  weightVersion: string | null
  driftVersion: string | null
  rollbackEvidence: string
}) {
  const markdown = renderLevel4CertificationReport({
    releaseCandidate: input.releaseCandidate,
    checklist: input.checklist,
    rollbackEvidence: input.rollbackEvidence,
    summary: [
      `Calibration Artifact: ${input.calibrationVersion ?? 'missing'}`,
      `Weight Artifact: ${input.weightVersion ?? 'missing'}`,
      `Drift Artifact: ${input.driftVersion ?? 'missing'}`,
    ].join('\n'),
  })

  return {
    filename: `${input.releaseCandidate}-level4-certification-report.md`,
    markdown,
  }
}
