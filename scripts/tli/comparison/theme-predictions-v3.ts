import { buildFeatureVector } from '@/lib/tli/features/build-features'
import type { FeatureVector } from '@/lib/tli/features/build-features'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { isKoreanTradingDate } from '@/lib/tli/trading-calendar'
import { computeTrailingFinalBaseRate, getTrailingFinalBaseRateWindow } from '@/lib/tli/model/prior-correction'
import { parseM1ModelArtifact } from '@/lib/tli/model/predict'
import { loadFeatureInputsForBaseDate } from '@/scripts/tli/features/load-feature-inputs'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { upsertLegacyPredictionsV3 } from '@/scripts/tli/comparison/legacy-prediction-writer'
import {
  TLI_V3_BASELINE_MODEL_VERSION,
  TLI_V3_HORIZON_DAYS,
  TLI_V3_LABELER_VERSION,
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

interface QueryError {
  readonly message: string
}

interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<{
    readonly data: readonly T[] | null
    readonly error: QueryError | null
  }>
}

interface ThemeLabelRecentBaseRateRow {
  readonly base_date: string
  readonly y_binary: boolean | null
}

const PAGE_SIZE = 1000

const fetchAllRows = async <T>(createQuery: () => RangeQuery<T>): Promise<T[]> => {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await createQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
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

async function loadRecentFinalBaseRate(predictionDate: string): Promise<number | null> {
  const window = getTrailingFinalBaseRateWindow(predictionDate)
  const rows = await fetchAllRows<ThemeLabelRecentBaseRateRow>(() => supabaseAdmin
    .from('theme_labels')
    .select('base_date, y_binary')
    .eq('label_type', 'gt_a')
    .eq('labeler_version', TLI_V3_LABELER_VERSION)
    .eq('label_status', 'final')
    .eq('horizon_days', TLI_V3_HORIZON_DAYS)
    .not('y_binary', 'is', null)
    .gte('base_date', window.startDate)
    .lte('base_date', window.endDate)
    .order('base_date', { ascending: true }))

  return computeTrailingFinalBaseRate(
    rows.flatMap((row) => (
      row.y_binary === null ? [] : [{ baseDate: row.base_date, y: row.y_binary }]
    )),
    predictionDate,
  )
}

/** model_registry 엔트리의 model_type에 맞춰 채점기를 선택해 기록 (b_abl 휴리스틱 / m1_logistic 추론) */
function scoreWithRegistryEntry(input: {
  readonly entry: ModelRegistryEntry
  readonly servingRole: ThemePredictionServingRole
  readonly themeId: string
  readonly predictionDate: string
  readonly featureVector: FeatureVector
  readonly snapshotPhase: string
  readonly recentBaseRate: number | null
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
      recentBaseRate: input.recentBaseRate,
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

  // 비거래일 base_date는 GT-A 라벨 대상이 아니다(`non_trading_base_date`). 여기서 만들면
  // 짝지을 라벨이 영원히 없는 pending 행이 되어 주말마다 채점 적체로 쌓인다.
  // 공개 서빙은 scientific 뷰만 읽으므로(049 `tli_public_scientific_predictions_v3`)
  // 이 legacy 행을 건너뛰어도 UI에는 영향이 없다.
  if (!isKoreanTradingDate(predictionDate)) {
    console.log(`   ⊘ 비거래일 — legacy v3 예측 스냅샷 생략 (${predictionDate})`)
    return { championRows: 0, challengerRows: 0 }
  }

  const snapshots = await loadV2SnapshotsForDate(predictionDate)
  if (snapshots.length === 0) return { championRows: 0, challengerRows: 0 }

  const [champion, challenger] = await Promise.all([
    loadModelRegistryEntry('champion'),
    loadModelRegistryEntry('challenger'),
  ])
  const recentBaseRate = await loadRecentFinalBaseRate(predictionDate)
  if (!champion) {
    console.warn('   ⚠️ model_registry에 champion이 없음 — b-abl 휴리스틱 폴백으로 부트스트랩')
  }

  const rows: ThemePredictionV3Row[] = []
  let challengerRows = 0

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
        recentBaseRate,
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
      try {
        rows.push(scoreWithRegistryEntry({
          entry: challenger,
          servingRole: 'challenger',
          themeId: snapshot.theme_id,
          predictionDate,
          featureVector,
          snapshotPhase: snapshot.phase,
          recentBaseRate,
        }))
        challengerRows += 1
      } catch (error: unknown) {
        console.error(
          `   ⚠️ challenger 예측 채점 실패 (${challenger.model_version}):`,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
  }

  await upsertLegacyPredictionsV3(rows.map(toThemePredictionV3Record))

  return {
    championRows: snapshots.length,
    challengerRows,
  }
}
