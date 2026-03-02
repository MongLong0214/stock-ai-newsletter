import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const ADMIN_SECRET = process.env.ADMIN_SECRET
const MAX_DAYS = 365

const verifyBearerToken = (authHeader: string | null): boolean => {
  if (!ADMIN_SECRET || !authHeader) return false
  const token = authHeader.replace('Bearer ', '')
  if (token.length !== ADMIN_SECRET.length) return false
  try {
    return timingSafeEqual(
      Buffer.from(token, 'utf8'),
      Buffer.from(ADMIN_SECRET, 'utf8')
    )
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!verifyBearerToken(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { searchParams } = new URL(request.url)
  const rawDays = Number(searchParams.get('days'))
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, MAX_DAYS) : 30

  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase.rpc('get_mcp_analytics_stats', {
    p_since: since.toISOString(),
  })

  if (error) {
    console.error('[mcp-stats] query error:', error.message)
    return NextResponse.json({ error: 'Internal query failed' }, { status: 500 })
  }

  return NextResponse.json({
    period: { days, since: since.toISOString() },
    summary: {
      totalCalls: data?.totalCalls ?? 0,
      uniqueUsers: data?.uniqueUsers ?? 0,
    },
    byTool: data?.byTool ?? {},
    byDay: data?.byDay ?? {},
    byUserAgent: data?.byUserAgent ?? {},
  })
}

export const runtime = 'nodejs'
