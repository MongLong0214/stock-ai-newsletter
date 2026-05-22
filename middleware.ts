import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const MCP_UA_PREFIX = 'stockmatrix-mcp'

const ALLOWED_MCP_PATHS = new Set([
  '/api/ai/summary',
  '/api/tli/scores/ranking',
  '/api/tli/themes',
  '/api/tli/stocks/search',
  '/api/tli/compare',
  '/api/tli/predictions',
  '/api/tli/methodology',
  '/api/tli/changes',
])

const isValidMcpPath = (path: string): boolean => {
  if (ALLOWED_MCP_PATHS.has(path)) return true
  if (/^\/api\/tli\/themes\/[0-9a-f-]+(?:\/history)?$/.test(path)) return true
  if (/^\/api\/tli\/stocks\/[A-Za-z0-9]+\/theme$/.test(path)) return true
  return false
}

export const middleware = (request: NextRequest) => {
  const ua = request.headers.get('user-agent') || ''
  if (!ua.startsWith(MCP_UA_PREFIX)) return NextResponse.next()

  if (!isValidMcpPath(request.nextUrl.pathname)) {
    return new NextResponse('Not Found', { status: 404 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/tli/:path*', '/api/ai/summary'],
}