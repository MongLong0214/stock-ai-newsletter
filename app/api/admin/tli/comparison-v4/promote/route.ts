import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { isPromotionBlocked } from '@/scripts/tli/comparison/v4/promotion'
import { fetchLatestCertificationCalibrationArtifact } from '@/scripts/tli/level4/calibration-artifact'
import { buildArtifactBackedPromotionContext, resolveRequiredWeightArtifact } from '@/scripts/tli/level4/promotion-runtime'
import { fetchWeightArtifactByVersion } from '@/scripts/tli/level4/weight-artifact'
import { isStateHistoryBackfillComplete } from '@/scripts/tli/themes/theme-state-history'

const ADMIN_SECRET = process.env.ADMIN_SECRET

if (!ADMIN_SECRET) {
  console.error('ADMIN_SECRET 환경변수가 설정되지 않았습니다. comparison-v4 promote API가 비활성 상태입니다.')
}

function verifyBearerToken(authHeader: string | null) {
  if (!ADMIN_SECRET || !authHeader) return false
  const token = authHeader.replace('Bearer ', '')
  if (token.length !== ADMIN_SECRET.length) return false
  try {
    return timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(ADMIN_SECRET, 'utf8'))
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  if (!verifyBearerToken(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const runIds = Array.isArray(body?.runIds) ? body.runIds.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0) : []
  const productionVersion = typeof body?.productionVersion === 'string' && body.productionVersion.length > 0
    ? body.productionVersion
    : null

  if (runIds.length === 0 || !productionVersion) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const sourceSurface = body?.sourceSurface === 'replay_equivalent' ? 'replay_equivalent' : 'v2_certification'
  const calibrationVersion = typeof body?.calibrationVersion === 'string' && body.calibrationVersion.length > 0
    ? body.calibrationVersion
    : `${productionVersion}-calibration`
  const driftVersion = typeof body?.driftVersion === 'string' && body.driftVersion.length > 0
    ? body.driftVersion
    : `${productionVersion}-drift`
  const weightVersion = typeof body?.weightVersion === 'string' && body.weightVersion.length > 0
    ? body.weightVersion
    : null
  const gateFailureReasons = Array.isArray(body?.gateFailureReasons)
    ? body.gateFailureReasons.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
    : []
  void gateFailureReasons

  if (!weightVersion) {
    return NextResponse.json({ error: 'weightVersion is required for certification-grade promotion' }, { status: 400 })
  }

  try {
    const client = supabaseAdmin as unknown as Parameters<typeof fetchWeightArtifactByVersion>[0]
    await fetchWeightArtifactByVersion(client, weightVersion)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 })
  }

  const { count: totalThemes } = await supabaseAdmin.from('themes').select('*', { count: 'exact', head: true })
  const { count: themesWithHistory } = await supabaseAdmin
    .from('theme_state_history_v2')
    .select('theme_id', { count: 'exact', head: true })
  const backfillComplete = isStateHistoryBackfillComplete({
    totalThemeCount: totalThemes ?? 0,
    themesWithHistoryCount: themesWithHistory ?? 0,
  })
  const blockResult = isPromotionBlocked({ stateHistoryBackfillComplete: backfillComplete })
  if (blockResult.blocked) {
    return NextResponse.json({ error: blockResult.reason }, { status: 409 })
  }

  try {
    const calibrationArtifact = await fetchLatestCertificationCalibrationArtifact(
      supabaseAdmin as unknown as Parameters<typeof fetchLatestCertificationCalibrationArtifact>[0],
      calibrationVersion,
    )
    const requestedWeightArtifact = await fetchWeightArtifactByVersion(
      supabaseAdmin as unknown as Parameters<typeof fetchWeightArtifactByVersion>[0],
      weightVersion,
    )
    const { data: driftArtifact, error: driftError } = driftVersion
      ? await supabaseAdmin
          .from('drift_report_artifact')
          .select('drift_version, drift_status, candidate_concentration_gini, baseline_candidate_concentration_gini, censoring_ratio, baseline_censoring_ratio, low_confidence_serving_rate, auto_hold_enabled, hold_report_date')
          .eq('drift_version', driftVersion)
          .maybeSingle()
      : { data: null, error: null }

    if (driftError || !driftArtifact) {
      return NextResponse.json({ error: driftError?.message || 'Missing drift artifact' }, { status: 409 })
    }

    const context = buildArtifactBackedPromotionContext({
      calibrationArtifact,
      weightArtifact: resolveRequiredWeightArtifact(requestedWeightArtifact),
      driftArtifact,
    })

    if (!context.gateVerdict.passed) {
      return NextResponse.json({ error: context.gateVerdict.summary }, { status: 409 })
    }

    const { data: activeControl } = await supabaseAdmin
      .from('comparison_v4_control')
      .select('production_version')
      .eq('serving_enabled', true)
      .maybeSingle()

    const publishedAt = new Date().toISOString()
    const { data, error } = await supabaseAdmin.rpc('promote_comparison_v4_release', {
      p_run_ids: runIds,
      p_published_at: publishedAt,
      p_production_version: productionVersion,
      p_actor: 'admin-api',
      p_source_surface: sourceSurface,
      p_calibration_version: calibrationVersion,
      p_weight_version: weightVersion,
      p_drift_version: driftVersion,
      p_gate_status: context.gateVerdict.status,
      p_gate_summary: context.gateVerdict.summary,
      p_gate_failures: context.gateVerdict.failureReasons,
      p_previous_stable_version: activeControl?.production_version ?? null,
      p_auto_hold_enabled: context.autoHold.autoHoldEnabled,
      p_hold_state: context.autoHold.holdState,
      p_hold_reason: context.autoHold.holdReason,
      p_hold_report_date: context.autoHold.holdReportDate,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export const runtime = 'nodejs'
