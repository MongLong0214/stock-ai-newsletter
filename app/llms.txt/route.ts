import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { siteConfig } from '@/lib/constants/seo/config'
import { metadataConfig } from '@/lib/constants/seo/metadata'

export const runtime = 'nodejs'

export async function GET() {
  let themeCount = 250
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

  const content = `# ${siteConfig.serviceName}

> ${metadataConfig.description}

## About

StockMatrix는 한국 주식 투자자를 위한 무료 AI 기술적 분석 뉴스레터 서비스입니다.
매일 ${siteConfig.deliveryTime} RSI, MACD, 볼린저밴드 등 ${siteConfig.indicatorCount}개 기술적 지표로 분석한
${siteConfig.markets} ${siteConfig.stockCount}개 종목의 참고용 데이터를 이메일로 제공합니다.

### 테마 생명주기 분석 (TLI)

${themeCount}개 이상의 주식 테마를 실시간 추적하여 생명주기 단계를 분석합니다.
- 네이버 검색 관심도, 뉴스 모멘텀, 주가 변동성을 종합하여 0~100점 점수 산출
- 5단계 생명주기: 초기(Early) → 성장(Growth) → 정점(Peak) → 쇠퇴(Decay) → 휴면(Dormant)
- 유사 패턴 비교를 통한 참고 지표 제공

## Key Features

- **AI 기술적 분석 뉴스레터**: ${siteConfig.indicatorCount}개 지표 기반 일일 분석 (평일 ${siteConfig.deliveryTimeShort})
- **테마 생명주기 분석**: ${themeCount}+ 테마의 실시간 점수 및 단계 추적
- **관련주 매핑**: 테마별 주요 종목 및 주가 변동 정보
- **뉴스 모니터링**: 테마별 최신 뉴스 헤드라인 수집 및 분석

## API Endpoints

- \`GET /api/tli/scores/ranking?limit=10&sort=score\` — 단계별 테마 랭킹 (emerging/growth/peak/decline/reigniting, limit 1-50, sort: score/change7d/newsCount7d)
- \`GET /api/tli/themes?q={query}\` — 테마 검색 (이름 필터링, 쿼리 없으면 전체 목록)
- \`GET /api/tli/stocks/search?q={query}\` — 종목명/종목코드 검색 + 관련 테마 미리보기 (6자리 코드 자동 감지)
- \`GET /api/tli/themes/{id}\` — 테마 상세 (점수, 관련주, 뉴스)
- \`GET /api/tli/themes/{id}/history\` — 테마 점수 이력 (기본 30일)
- \`GET /api/tli/changes?period=1d|7d\` — 일간/주간 테마 점수 변동, 단계 전환, 신규 부상 테마
- \`GET /api/tli/compare?ids=uuid1,uuid2,...\` — 2~5개 테마 나란히 비교 (점수, 관련주, 스파크라인, 유사도)
- \`GET /api/tli/predictions?phase=rising|hot|cooling\` — v4 예측 시스템 기반 테마 전망 (과거 유사 패턴 매칭)
- \`GET /api/tli/methodology?section=scoring|stages|...\` — TLI 알고리즘 문서 (채점, 단계, 안정화, 비교, 예측, 데이터 소스)
- \`GET /api/ai/summary\` — AI 에이전트 최적화 요약 (Top 5 테마 + 시장 개요)

## MCP Server

\`stockmatrix-mcp\` — Model Context Protocol 서버로 AI 에이전트에서 직접 테마 데이터를 조회할 수 있습니다.
- 설치: \`npx -y stockmatrix-mcp\`
- 도구 (10개): get_market_summary, get_theme_ranking, get_theme_detail, get_theme_history, search_themes, search_stocks, get_theme_changes, compare_themes, get_predictions, get_methodology
- npm: https://www.npmjs.com/package/stockmatrix-mcp

## Pages

- [홈](${siteConfig.domain}) — 서비스 소개 및 구독
- [테마 분석](${siteConfig.domain}/themes) — ${themeCount}+ 테마 랭킹 목록
- [서비스 소개](${siteConfig.domain}/about) — StockMatrix 상세 안내
- [FAQ](${siteConfig.domain}/faq) — 자주 묻는 질문
- [기술적 지표](${siteConfig.domain}/technical-indicators) — ${siteConfig.indicatorCount}개 지표 설명
${blogCount > 0 ? `- [블로그](${siteConfig.domain}/blog) — ${blogCount}개 투자 인사이트 아티클\n` : ''}- [구독](${siteConfig.domain}/subscribe) — 무료 뉴스레터 구독
- [개발자](${siteConfig.domain}/developers) — MCP 서버 설치 및 사용 가이드

## Data Sources

- 한국거래소(KRX) 공식 시장 데이터 (KOSPI, KOSDAQ)
- 네이버 DataLab 검색 관심도
- 네이버 뉴스 기사 수집 및 분석
- 네이버 금융 테마 종목 정보

## Contact

- Email: aistockmatrix@gmail.com
- Website: ${siteConfig.domain}

## Legal

StockMatrix는 금융투자협회에 등록되지 않은 참고용 정보 제공 서비스입니다.
투자 권유나 매매 추천이 아니며, 모든 투자 결정과 책임은 투자자 본인에게 있습니다.
`

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
    },
  })
}
