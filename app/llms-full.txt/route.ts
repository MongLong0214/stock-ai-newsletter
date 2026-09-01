import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { siteConfig } from '@/lib/constants/seo/config'
import { metadataConfig } from '@/lib/constants/seo/metadata'
import { TECHNICAL_INDICATORS_DATA } from '@/app/constants/home-page'

export const runtime = 'nodejs'
export const revalidate = 86400

export async function GET() {
  let themeCount = 200
  let blogCount = 0

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
      { auth: { persistSession: false } }
    )
    const [themesRes, blogsRes] = await Promise.all([
      supabase.from('themes').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    ])
    if (themesRes.count) themeCount = themesRes.count
    if (blogsRes.count) blogCount = blogsRes.count
  } catch {
    // fallback to defaults
  }

  const indicatorBlocks = TECHNICAL_INDICATORS_DATA
    .map((cat) => `### ${cat.title}\n${cat.items.map((i) => `- ${i}`).join('\n')}`)
    .join('\n\n')

  const content = `# ${siteConfig.serviceName} — 전체 문서 (llms-full)

> ${metadataConfig.description}
>
> 이 문서는 AI/LLM이 인용·참조할 수 있도록 StockMatrix의 방법론·지표·API를 상세히 기술한 전체 버전입니다.
> 요약본은 ${siteConfig.domain}/llms.txt 를 참조하세요.

## 서비스 개요

StockMatrix(스탁매트릭스)는 한국 주식 투자자를 위한 무료 AI 기술적 분석 서비스입니다.
매일 ${siteConfig.deliveryTime}, ${siteConfig.markets} ${siteConfig.stockCount}개 종목을 ${siteConfig.indicatorCount}개 기술적 지표로 분석해 이메일로 제공하며,
웹사이트에서는 ${themeCount}개 이상의 주식 테마 생명주기(TLI)를 추적합니다.

- 서비스 성격: 참고용 기술적 분석 정보 (투자 권유·매매 추천 아님)
- 시장: KOSPI, KOSDAQ
- 발송 시각: 평일 ${siteConfig.deliveryTimeShort}
- 데이터 기준: 한국거래소(KRX) 공식 시장 데이터, 네이버 DataLab·뉴스·금융

## 기술적 지표 (${siteConfig.indicatorCount}개)

AI가 각 종목에 대해 아래 ${siteConfig.indicatorCount}개 지표를 계산·종합합니다.

${indicatorBlocks}

## 테마 생명주기 분석 (TLI) 방법론

### 점수 산출 (0~100점)
4개 요소를 가중 합산하여 테마별 관심도 점수를 산출합니다.

- 검색 관심도 (interest) — 가중치 30.4%. 출처: 네이버 DataLab. 7일 검색량 평균 대비 30일 기준선, 시그모이드 정규화. DataLab 5키워드 배치 한계로 배치 자기정규화 적용.
- 뉴스 모멘텀 (newsMomentum) — 가중치 36.6%. 출처: 네이버 뉴스. 로그 스케일 뉴스량 + 주간 기사 수 변화율.
- 변동성 (volatility) — 가중치 10.4%. 출처: 관심도 시계열. 관심도 표준편차, 시그모이드 정규화.
- 관련주 활동성 (activity) — 가중치 22.6%. 출처: 네이버 금융. 관련 종목 등락률·거래량 강도·데이터 커버리지 교차 신호.

### 5단계 생명주기
- 초기 (Early): 관심도가 막 상승하기 시작한 단계
- 성장 (Growth): 관심도·뉴스가 빠르게 증가하는 단계
- 정점 (Peak): 관심도가 최고조에 이른 단계
- 쇠퇴 (Decay): 관심도가 하락하는 단계
- 휴면 (Dormant): 관심도가 낮게 유지되는 단계

### 하락 확인 (안정화)
점수 하락 시 3개 독립 이진 신호를 검사: (1) 관심도 기울기 < 0, (2) 이번 주 뉴스 < 지난주 뉴스, (3) 방향성 변동성 지수 < 0.4.
2개 이상 신호가 일치할 때만 하락 확정(다수결). 그렇지 않으면 이전 점수 × 0.947을 하한으로 사용.

## API Endpoints

- \`GET /api/tli/scores/ranking?limit=10&sort=score\` — 단계별 테마 랭킹 (limit 1-50, sort: score/change7d/newsCount7d)
- \`GET /api/tli/themes?q={query}\` — 테마 검색 (쿼리 없으면 전체 목록)
- \`GET /api/tli/stocks/search?q={query}\` — 종목명/종목코드 검색 + 관련 테마 (6자리 코드 자동 감지)
- \`GET /api/tli/themes/{id}\` — 테마 상세 (점수, 관련주, 뉴스)
- \`GET /api/tli/themes/{id}/history\` — 테마 점수 이력 (기본 30일)
- \`GET /api/tli/changes?period=1d|7d\` — 일간/주간 점수 변동·단계 전환·신규 부상 테마
- \`GET /api/tli/compare?ids=uuid1,uuid2,...\` — 2~5개 테마 비교 (점수, 관련주, 스파크라인, 유사도)
- \`GET /api/tli/methodology?section=scoring|stages|stabilization|comparison|prediction|dataSources\` — TLI 알고리즘 상세 문서
- \`GET /api/ai/summary\` — AI 에이전트 최적화 요약 (Top 5 테마 + 시장 개요)

## MCP Server

\`stockmatrix-mcp\` — Model Context Protocol 서버로 AI 에이전트에서 직접 테마 데이터를 조회할 수 있습니다.
- 설치: \`npx -y stockmatrix-mcp\`
- 도구 (10개): get_market_summary, get_theme_ranking, get_theme_detail, get_theme_history, search_themes, search_stocks, get_theme_changes, compare_themes, get_predictions, get_methodology
- npm: https://www.npmjs.com/package/stockmatrix-mcp
- 소스: https://github.com/MongLong0214/stock-ai-newsletter (subfolder: mcp)

## Pages

- 홈: ${siteConfig.domain}
- 테마 분석: ${siteConfig.domain}/themes (${themeCount}개 이상)
- TLI 방법론: ${siteConfig.domain}/themes/methodology
- 기술적 지표: ${siteConfig.domain}/technical-indicators
- 서비스 소개: ${siteConfig.domain}/about
- FAQ: ${siteConfig.domain}/faq
${blogCount > 0 ? `- 블로그: ${siteConfig.domain}/blog (${blogCount}개 아티클)\n` : ''}- 구독: ${siteConfig.domain}/subscribe
- 개발자(MCP): ${siteConfig.domain}/developers

## Data Sources

- 한국거래소(KRX) 공식 시장 데이터 (KOSPI, KOSDAQ)
- 네이버 DataLab 검색 관심도
- 네이버 뉴스 기사 수집 및 분석
- 네이버 금융 테마 종목 정보

## Contact

- Email: aistockmatrix@gmail.com
- Website: ${siteConfig.domain}

## Legal / Disclaimer

StockMatrix는 금융투자협회에 등록되지 않은 참고용 정보 제공 서비스입니다.
제공되는 모든 정보는 기술적 분석에 기반한 참고 자료이며, 투자 권유나 매매 추천이 아닙니다.
모든 투자 결정과 그 결과에 대한 책임은 투자자 본인에게 있습니다.
`

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=43200',
      'CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=86400',
    },
  })
}
