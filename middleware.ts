import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const MCP_UA_PREFIX = 'stockmatrix-mcp'
const MAX_UA_LENGTH = 512

const TOOL_MAP: Record<string, string> = {
  '/api/ai/summary': 'get_market_summary',
  '/api/tli/scores/ranking': 'get_theme_ranking',
  '/api/tli/themes': 'search_themes',
  '/api/tli/stocks/search': 'search_stocks',
}

const inferTool = (path: string): string => {
  if (TOOL_MAP[path]) return TOOL_MAP[path]
  if (/^\/api\/tli\/themes\/[^/]+\/history$/.test(path)) return 'get_theme_history'
  if (/^\/api\/tli\/themes\/[^/]+$/.test(path)) return 'get_theme_detail'
  if (/^\/api\/tli\/stocks\/[^/]+\/theme$/.test(path)) return 'get_stock_theme'
  return 'unknown'
}

const hashIp = async (ip: string): Promise<string | null> => {
  const salt = process.env.IP_HASH_SALT
  if (!salt) return null

  const data = new TextEncoder().encode(ip + salt)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf).slice(0, 16))
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
  if (!ipHash) return NextResponse.next()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return NextResponse.next()

  const promise = fetch(`${supabaseUrl}/rest/v1/rpc/insert_mcp_analytics`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_tool_name: tool,
      p_path: path,
      p_user_agent: ua.slice(0, MAX_UA_LENGTH),
      p_ip_hash: ipHash,
    }),
  }).catch((e) => {
    console.error(
      '[mcp-analytics] insert failed:',
      e instanceof Error ? e.message : String(e)
    )
  })

  if ('waitUntil' in globalThis && typeof (globalThis as Record<string, unknown>).waitUntil === 'function') {
    ;(globalThis as unknown as { waitUntil: (p: Promise<unknown>) => void }).waitUntil(promise)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/tli/:path*', '/api/ai/summary'],
}
