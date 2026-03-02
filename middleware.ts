import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const MCP_UA_PREFIX = 'stockmatrix-mcp'

const TOOL_MAP: Record<string, string> = {
  '/api/tli/scores/ranking': 'get_theme_ranking',
  '/api/tli/themes': 'search_themes',
}

const inferTool = (path: string): string => {
  if (TOOL_MAP[path]) return TOOL_MAP[path]
  if (/^\/api\/tli\/themes\/[^/]+\/history$/.test(path)) return 'get_theme_history'
  if (/^\/api\/tli\/themes\/[^/]+$/.test(path)) return 'get_theme_detail'
  if (/^\/api\/tli\/stocks\/[^/]+\/theme$/.test(path)) return 'get_stock_theme'
  return 'unknown'
}

const hashIp = async (ip: string): Promise<string> => {
  const salt = process.env.IP_HASH_SALT || 'fallback-dev-salt'
  const data = new TextEncoder().encode(ip + salt)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const middleware = async (request: NextRequest) => {
  const ua = request.headers.get('user-agent') || ''
  if (!ua.startsWith(MCP_UA_PREFIX)) return NextResponse.next()

  const path = request.nextUrl.pathname
  const tool = inferTool(path)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const ipHash = await hashIp(ip)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return NextResponse.next()

  fetch(`${supabaseUrl}/rest/v1/mcp_analytics`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      tool_name: tool,
      path,
      user_agent: ua,
      ip_hash: ipHash,
    }),
  }).catch(() => {})

  return NextResponse.next()
}

export const config = {
  matcher: '/api/tli/:path*',
}
