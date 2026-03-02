import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_SECRET = process.env.ADMIN_SECRET
const MAX_DAYS = 365

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const secret = authHeader?.replace('Bearer ', '')

  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
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

  const QUERY_LIMIT = 1000

  const { data: rows, error } = await supabase
    .from('mcp_analytics')
    .select('tool_name, path, user_agent, ip_hash, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(QUERY_LIMIT)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const totalCalls = rows?.length ?? 0
  const truncated = totalCalls === QUERY_LIMIT
  const uniqueUsers = new Set(rows?.map((r) => r.ip_hash)).size
  const toolCounts: Record<string, number> = {}
  const dailyCounts: Record<string, number> = {}
  const userAgents: Record<string, number> = {}

  for (const row of rows ?? []) {
    toolCounts[row.tool_name] = (toolCounts[row.tool_name] ?? 0) + 1

    const day = row.created_at.slice(0, 10)
    dailyCounts[day] = (dailyCounts[day] ?? 0) + 1

    if (row.user_agent) {
      userAgents[row.user_agent] = (userAgents[row.user_agent] ?? 0) + 1
    }
  }

  return NextResponse.json({
    period: { days, since: since.toISOString() },
    summary: { totalCalls, uniqueUsers, truncated },
    byTool: toolCounts,
    byDay: dailyCounts,
    byUserAgent: userAgents,
  })
}

export const runtime = 'nodejs'
