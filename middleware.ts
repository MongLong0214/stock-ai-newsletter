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

// robots.ts가 disallow하는 스크레이퍼/SEO 크롤러 — robots는 권고일 뿐이라 엣지에서 강제 차단한다.
// 봇 폭주로부터 Supabase egress·Vercel 함수 호출을 보호(과금 폭탄 방지). 소문자 부분일치.
const BLOCKED_BOT_UA = [
  'bytespider',
  'ccbot',
  'amazonbot',
  'cohere-ai',
  'diffbot',
  'ahrefsbot',
  'semrushbot',
  'mj12bot',
  'dotbot',
  'petalbot',
  'dataforseo',
  'blexbot',
  'mauibot',
  'megaindex',
  'zoominfobot',
  'serpstatbot',
]

const isBlockedBot = (ua: string): boolean => {
  const lower = ua.toLowerCase()
  return BLOCKED_BOT_UA.some((bot) => lower.includes(bot))
}

export const middleware = (request: NextRequest) => {
  const ua = request.headers.get('user-agent') || ''

  // 1) 악성/과도 크롤러는 페이지·API 어디서든 엣지에서 즉시 차단
  if (isBlockedBot(ua)) {
    return new NextResponse('Forbidden', {
      status: 403,
      headers: { 'cache-control': 'private, no-store' },
    })
  }

  // 2) MCP UA는 API에서 허용된 경로만 통과 (그 외 404)
  if (ua.startsWith(MCP_UA_PREFIX)
    && request.nextUrl.pathname.startsWith('/api/')
    && !isValidMcpPath(request.nextUrl.pathname)) {
    return new NextResponse('Not Found', { status: 404 })
  }

  return NextResponse.next()
}

export const config = {
  // 정적 자산·이미지·robots·sitemap 제외, 모든 페이지·API에 봇 필터 적용
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$).*)'],
}
