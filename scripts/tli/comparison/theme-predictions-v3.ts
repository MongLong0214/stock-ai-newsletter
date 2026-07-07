import { buildFeatureVector } from '@/lib/tli/features/build-features'
import type { FeatureVector } from '@/lib/tli/features/build-features'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { parseM1ModelArtifact } from '@/lib/tli/model/predict'
import { loadFeatureInputsForBaseDate } from '@/scripts/tli/features/load-feature-inputs'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { batchUpsert } from '@/scripts/tli/shared/supabase-batch'
import {
  TLI_V3_BASELINE_MODEL_VERSION,
  TLI_V3_M1_PARAM_VERSION,
  buildBaselinePredictionV3Row,
  buildM1PredictionV3Row,
  parsePredictionPhase,
  toThemePredictionV3Record,
} from '@/scripts/tli/comparison/theme-predictions-v3-records'
import type {
  ThemePredictionServingRole,
  ThemePredictionV3Row,
} from '@/scripts/tli/comparison/theme-predictions-v3-records'

export * from '@/scripts/tli/comparison/theme-predictions-v3-records'

export interface ThemePredictionsV3SnapshotResult {
  readonly championRows: number
  readonly challengerRows: number
}

interface PredictionSnapshotV2PhaseRow {
  readonly theme_id: string
  readonly snapshot_date: string
  readonly phase: string
}

interface ModelRegistryEntry {
  readonly model_version: string
  readonly model_type: string
  readonly coefficients: unknown
}

/** model_registry에서 champion/challenger 아티팩트를 조회 (SSOT = DB, 로컬 파일 경로 의존 제거 — A1) */
async function loadModelRegistryEntry(status: 'champion' | 'challenger'): Promise<ModelRegistryEntry | null> {
  const { data, error } = await supabaseAdmin
    .from('model_registry')
    .select('model_version, model_type, coefficients')
    .eq('status', status)
    .maybeSingle()
  if (error) throw new Error(`model_registry ${status} 조회 실패: ${error.message}`)
  return data ?? null
}

async function loadV2SnapshotsForDate(predictionDate: string): Promise<PredictionSnapshotV2PhaseRow[]> {
  const { data, error } = await supabaseAdmin
    .from('prediction_snapshots_v2')
    .select('theme_id, snapshot_date, phase')
    .eq('snapshot_date', predictionDate)
  if (error) throw new Error(`prediction_snapshots_v2 로딩 실패: ${error.message}`)
  return data ?? []
}

/** model_registry 엔트리의 model_type에 맞춰 채점기를 선택해 기록 (b_abl 휴리스틱 / m1_logistic 추론) */
function scoreWithRegistryEntry(input: {
  readonly entry: ModelRegistryEntry
  readonly servingRole: ThemePredictionServingRole
  readonly themeId: string
  readonly predictionDate: string
  readonly featureVector: FeatureVector
  readonly snapshotPhase: string
}): ThemePredictionV3Row {
  if (input.entry.model_type === 'm1_logistic') {
    const artifact = parseM1ModelArtifact(input.entry.coefficients)
    return buildM1PredictionV3Row({
      themeId: input.themeId,
      predictionDate: input.predictionDate,
      featureVector: input.featureVector,
      artifact,
      modelVersion: input.entry.model_version,
      paramVersion: TLI_V3_M1_PARAM_VERSION,
      servingRole: input.servingRole,
    })
  }

  return buildBaselinePredictionV3Row({
    themeId: input.themeId,
    predictionDate: input.predictionDate,
    prediction: { phase: parsePredictionPhase(input.snapshotPhase) },
    featureVector: input.featureVector,
    servingRole: input.servingRole,
    modelVersion: input.entry.model_version,
  })
}

export async function snapshotThemePredictionsV3(input?: {
  readonly today?: string
}): Promise<ThemePredictionsV3SnapshotResult> {
  const predictionDate = input?.today ?? getKSTDateString()
  const snapshots = await loadV2SnapshotsForDate(predictionDate)
  if (snapshots.length === 0) return { championRows: 0, challengerRows: 0 }

  const [champion, challenger] = await Promise.all([
    loadModelRegistryEntry('champion'),
    loadModelRegistryEntry('challenger'),
  ])
  if (!champion) {
    console.warn('   ⚠️ model_registry에 champion이 없음 — b-abl 휴리스틱 폴백으로 부트스트랩')
  }

  const rows: ThemePredictionV3Row[] = []

  for (const snapshot of snapshots) {
    const featureInputs = await loadFeatureInputsForBaseDate({
      themeId: snapshot.theme_id,
      baseDate: predictionDate,
    })
    const featureVector = buildFeatureVector(featureInputs)

    rows.push(champion
      ? scoreWithRegistryEntry({
        entry: champion,
        servingRole: 'champion',
        themeId: snapshot.theme_id,
        predictionDate,
        featureVector,
        snapshotPhase: snapshot.phase,
      })
      : buildBaselinePredictionV3Row({
        themeId: snapshot.theme_id,
        predictionDate,
        prediction: { phase: parsePredictionPhase(snapshot.phase) },
        featureVector,
        servingRole: 'champion',
        modelVersion: TLI_V3_BASELINE_MODEL_VERSION,
      }))

    if (challenger) {
      rows.push(scoreWithRegistryEntry({
        entry: challenger,
        servingRole: 'challenger',
        themeId: snapshot.theme_id,
        predictionDate,
        featureVector,
        snapshotPhase: snapshot.phase,
      }))
    }
  }

  await batchUpsert(
    'theme_predictions_v3',
    rows.map(toThemePredictionV3Record),
    'theme_id,prediction_date,horizon_days,model_version',
    'theme_predictions_v3',
  )

  return {
    championRows: snapshots.length,
    challengerRows: challenger ? snapshots.length : 0,
  }
}
