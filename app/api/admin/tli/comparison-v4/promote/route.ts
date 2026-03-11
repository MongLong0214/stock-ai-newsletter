import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/scripts/tli/supabase-admin'
import { promoteComparisonV4Runs } from '@/scripts/tli/comparison-v4-orchestration'

const ADMIN_SECRET = process.env.ADMIN_SECRET

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
    : process.env.TLI_COMPARISON_V4_PRODUCTION_VERSION

  if (runIds.length === 0 || !productionVersion) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
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
