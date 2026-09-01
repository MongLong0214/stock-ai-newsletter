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

// SEO·스크레이퍼 크롤러. robots는 권고일 뿐이라 엣지에서 강제한다.
// 단 전면 차단은 하지 않는다 — 백링크 그래프가 페이지를 못 읽으면 이 도메인은
// 외부 도구에서 "백링크 없음"으로 보인다. 페이지는 통과시키고 /api/ 만 막아
// Supabase egress·함수 호출 과금은 그대로 방어한다. 소문자 부분일치.
const API_BLOCKED_BOT_UA = [
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

const isApiBlockedBot = (ua: string): boolean => {
  const lower = ua.toLowerCase()
  return API_BLOCKED_BOT_UA.some((bot) => lower.includes(bot))
}

// Satori로 PNG를 렌더하는 동적 OG 경로다. Ahrefs·Semrush 같은 링크 분석기는
// 페이지의 링크 그래프만 읽으면 되므로 이 이미지를 생성할 이유가 없다.
// Google·Naver·소셜 미리보기·AI 검색 봇은 API_BLOCKED_BOT_UA에 없어서 그대로 통과한다.
const isExpensiveOgImagePath = (pathname: string): boolean =>
  /^\/blog\/(?:tag\/)?[^/]+\/opengraph-image$/.test(pathname) ||
  /^\/themes\/[^/]+\/opengraph-image$/.test(pathname)

export const middleware = (request: NextRequest) => {
  const ua = request.headers.get('user-agent') || ''

  // 1) 스크레이퍼/SEO 크롤러는 API와 비용이 큰 동적 OG 이미지만 차단한다.
  // 페이지 본문은 통과시켜 외부 링크 그래프·검색 색인은 유지한다.
  if (isApiBlockedBot(ua) && (
    request.nextUrl.pathname.startsWith('/api/') ||
    isExpensiveOgImagePath(request.nextUrl.pathname)
  )) {
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
