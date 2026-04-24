import { supabase } from '@/lib/supabase'
import { apiSuccess, handleApiError, placeholderResponse, isTableNotFound } from '@/lib/tli/api-utils'
import type { Stage } from '@/lib/tli/types/db'
import { withRateLimit } from '@/lib/rate-limit/with-rate-limit'

// v4 forecast serving gate check
interface ControlRow {
  serving_status: string
  fail_closed_verified: boolean
  cutover_ready: boolean
  rollback_target_version: string | null
}

// v4 batch types
interface SnapshotRow {
  id: string
  theme_id: string
  days_since_episode_start: number
  reconstruction_status: string
}

interface CandidateRow {
  id: string
  query_snapshot_id: string
  candidate_theme_id: string
  similarity_score: number
  rank: number
}

interface EvidenceRow {
  candidate_id: string
  analog_future_path_summary: {
    peak_day: number
    total_days: number
    final_stage: string
  } | null
  evidence_quality: string
}

interface ScoreRow {
  theme_id: string
  score: number
  stage: Stage | null
}

// v2 fallback type
interface PredictionV2Row {
  theme_id: string
  phase: string
  confidence: string
  risk_level: string | null
  avg_peak_day: number | null
  avg_total_days: number | null
  days_since_spike: number | null
}

type PhaseFilter = 'rising' | 'hot' | 'cooling'

// Stage -> Phase mapping
const stageToPhase = (stage: string | null): PhaseFilter | null => {
  if (!stage) return null
  const s = stage.toLowerCase()
  if (s === 'emerging' || s === 'growth') return 'rising'
  if (s === 'peak') return 'hot'
  if (s === 'decline' || s === 'dormant') return 'cooling'
  return null
}

// v2 phase mapping
const v2PhaseMap = (phase: string): PhaseFilter | null => {
  const p = phase.toLowerCase()
  if (p === 'rising') return 'rising'
  if (p === 'hot') return 'hot'
  if (p === 'cooling') return 'cooling'
  return null
}

const isV4Serving = (row: ControlRow | null): boolean => {
  if (!row) return false
  return (
    row.serving_status === 'production' &&
    row.fail_closed_verified === true &&
    row.cutover_ready === true &&
    row.rollback_target_version !== null &&
    row.rollback_target_version.trim() !== ''
  )
}

const CHUNK_SIZE = 300

async function loadV4Predictions(phaseFilter: PhaseFilter | null) {
  // 1. All active theme snapshots (latest per theme)
  const { data: snapshots, error: snapErr } = await supabase
    .from('query_snapshot_v1')
    .select('id, theme_id, days_since_episode_start, reconstruction_status')
    .neq('reconstruction_status', 'failed')
    .order('snapshot_date', { ascending: false })

  if (snapErr || !snapshots?.length) return []

  // Deduplicate: keep first (latest) per theme
  const snapshotByTheme = new Map<string, SnapshotRow>()
  for (const row of snapshots as SnapshotRow[]) {
    if (!snapshotByTheme.has(row.theme_id)) {
      snapshotByTheme.set(row.theme_id, row)
    }
  }

  const uniqueSnapshots = Array.from(snapshotByTheme.values())
  const snapshotIds = uniqueSnapshots.map((s) => s.id)

  // 2. Batch candidates (rank=1 only)
  const allCandidates: CandidateRow[] = []
  for (let i = 0; i < snapshotIds.length; i += CHUNK_SIZE) {
    const chunk = snapshotIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase
      .from('analog_candidates_v1')
      .select('id, query_snapshot_id, candidate_theme_id, similarity_score, rank')
      .in('query_snapshot_id', chunk)
      .eq('rank', 1)

    if (error) throw error
    if (data) allCandidates.push(...(data as CandidateRow[]))
  }

  if (!allCandidates.length) return []

  const candidateIds = allCandidates.map((c) => c.id)

  // 3. Batch evidence
  const allEvidence: EvidenceRow[] = []
  for (let i = 0; i < candidateIds.length; i += CHUNK_SIZE) {
    const chunk = candidateIds.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase
      .from('analog_evidence_v1')
      .select('candidate_id, analog_future_path_summary, evidence_quality')
      .in('candidate_id', chunk)

    if (error) throw error
    if (data) allEvidence.push(...(data as EvidenceRow[]))
  }

  const evidenceMap = new Map(allEvidence.map((e) => [e.candidate_id, e]))

  // 4. Resolve candidate theme names
  const candidateThemeIds = [...new Set(allCandidates.map((c) => c.candidate_theme_id))]
  const themeNameMap = new Map<string, string>()
  for (let i = 0; i < candidateThemeIds.length; i += CHUNK_SIZE) {
    const chunk = candidateThemeIds.slice(i, i + CHUNK_SIZE)
    const { data } = await supabase
      .from('themes')
      .select('id, name')
      .in('id', chunk)

    if (data) {
      for (const t of data) themeNameMap.set(t.id, t.name)
    }
  }

  // 5. All theme latest scores
  const allThemeIds = Array.from(snapshotByTheme.keys())
  const scoreMap = new Map<string, ScoreRow>()
  for (let i = 0; i < allThemeIds.length; i += CHUNK_SIZE) {
    const chunk = allThemeIds.slice(i, i + CHUNK_SIZE)
    const { data } = await supabase
      .from('lifecycle_scores')
      .select('theme_id, score, stage')
      .in('theme_id', chunk)
      .order('calculated_at', { ascending: false })
      .limit(chunk.length * 7)

    if (data) {
      for (const row of data as ScoreRow[]) {
        if (!scoreMap.has(row.theme_id)) {
          scoreMap.set(row.theme_id, row)
        }
      }
    }
  }

  // 6. Get theme names for source themes
  const sourceThemeNames = new Map<string, string>()
  for (let i = 0; i < allThemeIds.length; i += CHUNK_SIZE) {
    const chunk = allThemeIds.slice(i, i + CHUNK_SIZE)
    const { data } = await supabase
      .from('themes')
      .select('id, name')
      .in('id', chunk)

    if (data) {
      for (const t of data) sourceThemeNames.set(t.id, t.name)
    }
  }

  // 7. Assemble results
  const candidateBySnapshot = new Map<string, CandidateRow>()
  for (const c of allCandidates) {
    candidateBySnapshot.set(c.query_snapshot_id, c)
  }

  const results = []
  for (const [themeId, snapshot] of snapshotByTheme) {
    const candidate = candidateBySnapshot.get(snapshot.id)
    if (!candidate) continue

    const evidence = evidenceMap.get(candidate.id)
    const score = scoreMap.get(themeId)
    const phase = stageToPhase(score?.stage ?? null)
    if (phaseFilter && phase !== phaseFilter) continue

    const summary = evidence?.analog_future_path_summary
    const analogName = themeNameMap.get(candidate.candidate_theme_id) ?? candidate.candidate_theme_id

    results.push({
      id: themeId,
      name: sourceThemeNames.get(themeId) ?? themeId,
      score: score?.score ?? 0,
      stage: score?.stage ?? 'Unknown',
      prediction: {
        phase: phase ?? 'unknown',
        confidence: evidence?.evidence_quality ?? 'low',
        daysSinceEpisodeStart: snapshot.days_since_episode_start,
        expectedPeakDay: summary?.peak_day ?? null,
        topAnalog: {
          name: analogName,
          similarity: candidate.similarity_score,
          peakDay: summary?.peak_day ?? null,
        },
        evidenceQuality: evidence?.evidence_quality ?? 'low',
      },
    })
  }

  return results
}

async function loadV2Predictions(phaseFilter: PhaseFilter | null) {
  const { data, error } = await supabase
    .from('v_prediction_v4_serving')
    .select('theme_id, phase, confidence, risk_level, avg_peak_day, avg_total_days, days_since_spike')

  if (error) {
    if (isTableNotFound(error)) return []
    throw error
  }
  if (!data?.length) return []

  // Get theme names and scores
  const themeIds = data.map((r: PredictionV2Row) => r.theme_id)
  const [themeRes, scoreRes] = await Promise.all([
    supabase.from('themes').select('id, name').in('id', themeIds),
    supabase.from('lifecycle_scores').select('theme_id, score, stage').in('theme_id', themeIds).order('calculated_at', { ascending: false }).limit(themeIds.length * 2),
  ])

  const nameMap = new Map((themeRes.data ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))
  const scoreMap = new Map<string, ScoreRow>()
  for (const row of (scoreRes.data ?? []) as ScoreRow[]) {
    if (!scoreMap.has(row.theme_id)) scoreMap.set(row.theme_id, row)
  }

  const results = []
  for (const row of data as PredictionV2Row[]) {
    const phase = v2PhaseMap(row.phase)
    if (phaseFilter && phase !== phaseFilter) continue

    const score = scoreMap.get(row.theme_id)
    results.push({
      id: row.theme_id,
      name: nameMap.get(row.theme_id) ?? row.theme_id,
      score: score?.score ?? 0,
      stage: score?.stage ?? 'Unknown',
      prediction: {
        phase: phase ?? 'unknown',
        confidence: row.confidence ?? 'low',
        daysSinceEpisodeStart: row.days_since_spike ?? null,
        expectedPeakDay: row.avg_peak_day ?? null,
        topAnalog: null,
        evidenceQuality: row.confidence ?? 'low',
      },
    })
  }

  return results
}

// Rate limit: uses checkRateLimit('standard') via withRateLimit wrapper
export const GET = withRateLimit('standard', async (request) => {
  try {
    const { searchParams } = new URL(request.url)
    const phaseParam = searchParams.get('phase') as PhaseFilter | null
    const phaseFilter = phaseParam && ['rising', 'hot', 'cooling'].includes(phaseParam)
      ? phaseParam
      : null

    const placeholder = placeholderResponse({ phase: phaseFilter, dataSource: 'none', themes: [], guidance: 'Placeholder mode.' })
    if (placeholder) return placeholder

    // Gate: check v4 serving status
    const { data: controlRow, error: controlErr } = await supabase
      .from('forecast_control_v1')
      .select('serving_status, fail_closed_verified, cutover_ready, rollback_target_version')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (controlErr && !isTableNotFound(controlErr)) {
      throw controlErr
    }

    const v4Active = isV4Serving(controlRow as ControlRow | null)
    let dataSource: string
    let themes: Array<Record<string, unknown>>
    let guidance: string | undefined

    if (v4Active) {
      dataSource = 'v4-forecast'
      themes = await loadV4Predictions(phaseFilter)
    } else {
      // v2 fallback
      const v2Themes = await loadV2Predictions(phaseFilter)
      if (v2Themes.length > 0) {
        dataSource = 'v2-legacy'
        themes = v2Themes
      } else {
        dataSource = 'none'
        themes = []
        guidance = controlRow
          ? 'Forecast system is in shadow mode. Prediction data not yet available.'
          : 'Prediction data not yet available.'
      }
    }

    if (themes.length === 0 && !guidance) {
      guidance = 'No themes match the selected phase filter.'
    }

    const result: Record<string, unknown> = {
      phase: phaseFilter,
      dataSource,
      themes,
    }
    if (guidance) result.guidance = guidance

    return apiSuccess(result, undefined, 'medium')
  } catch (error) {
    return handleApiError(error, '예측 데이터를 불러오는데 실패했습니다.')
  }
})

export const runtime = 'nodejs'
