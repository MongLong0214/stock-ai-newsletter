import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/scripts/tli/supabase-admin'
import { promoteComparisonV4Runs } from '@/scripts/tli/comparison-v4-orchestration'
import { isPromotionBlocked } from '@/scripts/tli/comparison-v4-promotion'
import { isStateHistoryBackfillComplete } from '@/scripts/tli/theme-state-history'

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

  // CMPV4-003: backfill 미완료 시 승격 차단
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
    const result = await promoteComparisonV4Runs({
      loadRuns: async (ids) => {
        const { data, error } = await supabaseAdmin
          .from('theme_comparison_runs_v2')
          .select('id, status, publish_ready, expected_candidate_count, materialized_candidate_count, expected_snapshot_count, materialized_snapshot_count')
          .in('id', ids)
        if (error) throw new Error(error.message)
        return (data || []) as Array<{
          id: string
          status: 'pending' | 'materializing' | 'complete' | 'published' | 'failed' | 'rolled_back'
          publish_ready: boolean
          expected_candidate_count: number
          materialized_candidate_count: number
          expected_snapshot_count: number
          materialized_snapshot_count: number
        }>
      },
      updateRuns: async (ids, patch) => {
        const { error } = await supabaseAdmin.from('theme_comparison_runs_v2').update(patch).in('id', ids)
        if (error) throw new Error(error.message)
      },
      disableActiveControlRows: async () => {
        const { error } = await supabaseAdmin.from('comparison_v4_control').update({ serving_enabled: false }).eq('serving_enabled', true)
        if (error) throw new Error(error.message)
      },
      upsertControlRow: async (row) => {
        const { error } = await supabaseAdmin.from('comparison_v4_control').upsert(row, { onConflict: 'production_version' })
        if (error) throw new Error(error.message)
      },
    }, {
      runIds,
      actor: 'admin-api',
      productionVersion,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export const runtime = 'nodejs'
