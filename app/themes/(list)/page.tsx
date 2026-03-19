import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { siteConfig, withOgImageVersion } from '@/lib/constants/seo/config'
import ThemesContent from '../_components/themes-content'
import { getRankingServer } from '../_services/get-ranking-server'

/** 테마 목록 페이지 메타데이터 */
export const metadata: Metadata = {
  title: '테마주 관련주 분석 — AI 테마 생명주기 추적',
  description:
    'AI가 분석하는 한국 주식시장 테마주 트렌드. 반도체, 2차전지, AI 등 주요 테마의 생명주기 점수와 단계를 실시간 추적하고 관련주를 확인하세요.',
  keywords: [
    '테마주',
    '관련주',
    '테마주 분석',
    '주식 테마',
    '테마 관련주 찾기',
    'AI 테마 분석',
    '테마 생명주기',
    '반도체 관련주',
    '2차전지 관련주',
    'AI 관련주',
    '테마주 추적',
  ],
  alternates: {
    canonical: `${siteConfig.domain}/themes`,
  },
  openGraph: {
    title: '테마주 관련주 분석 — AI 테마 생명주기 추적 | StockMatrix',
    description:
      'AI가 분석하는 한국 주식시장 테마주 트렌드. 주요 테마의 생명주기 점수와 단계를 실시간 추적하고 관련주를 확인하세요.',
    url: `${siteConfig.domain}/themes`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: withOgImageVersion('/opengraph-image'), width: 1200, height: 630, alt: '테마주 관련주 분석' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '테마주 관련주 분석 — AI 테마 생명주기 추적 | StockMatrix',
    description:
      'AI가 분석하는 한국 주식시장 테마주 트렌드. 주요 테마의 생명주기 점수와 단계를 실시간 추적하고 관련주를 확인하세요.',
    images: [withOgImageVersion('/twitter-image')],
  },
}

export const revalidate = 600

/** 테마 목록 조회 (ItemList 스키마용) */
async function getActiveThemes() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
      { auth: { persistSession: false } }
    )
    const { data } = await supabase
      .from('themes')
      .select('id, name, description')
      .eq('is_active', true)
      .order('name')
    return data || []
  } catch {
    return []
  }
}

/** 테마 목록 페이지 */
export default async function ThemesPage() {
  const [themes, ranking] = await Promise.all([
    getActiveThemes(),
    getRankingServer(),
  ])

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: '주식 테마 생명주기 분석 목록',
    description: 'AI가 분석하는 한국 주식시장 테마의 생명주기 점수와 단계',
    numberOfItems: themes.length,
    itemListElement: themes.map((theme, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Thing',
        '@id': `${siteConfig.domain}/themes/${theme.id}`,
        name: theme.name,
        description: theme.description || `${theme.name} 테마 생명주기 분석`,
        url: `${siteConfig.domain}/themes/${theme.id}`,
      },
    })),
  }

  const datasetSchema = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: '한국 주식시장 테마 생명주기 데이터셋',
    description: `AI가 분석하는 ${themes.length}개 추적 테마 중 현재 ${ranking.summary.totalThemes}개 활성 테마의 생명주기 점수, 단계, 관련주 데이터. 네이버 검색 관심도, 뉴스 모멘텀, 주가 변동성을 종합 분석하여 매일 갱신됩니다.`,
    url: `${siteConfig.domain}/themes`,
    license: 'https://creativecommons.org/licenses/by-nc/4.0/',
    creator: {
      '@type': 'Organization',
      name: siteConfig.serviceName,
      url: siteConfig.domain,
    },
    temporalCoverage: `2024/..`,
    spatialCoverage: '대한민국',
    variableMeasured: [
      { '@type': 'PropertyValue', name: '생명주기 점수', description: '0~100 점수 (관심도 40% + 뉴스 모멘텀 35% + 활동 10% + 변동성 15%)' },
      { '@type': 'PropertyValue', name: '생명주기 단계', description: '초기(Early), 성장(Growth), 정점(Peak), 쇠퇴(Decay), 휴면(Dormant)' },
      { '@type': 'PropertyValue', name: '관련주 수', description: '테마에 속한 KOSPI·KOSDAQ 종목 수' },
    ],
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: `${siteConfig.domain}/api/tli/scores/ranking`,
        name: '테마 랭킹 API',
      },
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: `${siteConfig.domain}/api/tli/themes`,
        name: '테마 목록 API',
      },
    ],
  }

  const allRanked = [
    ...ranking.emerging,
    ...ranking.growth,
    ...ranking.peak,
    ...ranking.decline,
    ...ranking.reigniting,
  ].sort((a, b) => b.score - a.score)

  return (
    <>
      <script
        id="theme-list-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema).replace(/</g, '\\u003c') }}
      />
      <script
        id="theme-dataset-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema).replace(/</g, '\\u003c') }}
      />
      {/* SSR 콘텐츠: JS 미실행 AI 크롤러용 */}
      <section className="sr-only" aria-label="테마 생명주기 분석 목록">
        <h2>한국 주식시장 테마 생명주기 분석</h2>
        <p>{themes.length}개 추적 테마 중 {ranking.summary.totalThemes}개 활성 테마의 AI 분석 랭킹. 네이버 검색 관심도, 뉴스 모멘텀, 주가 변동성을 종합하여 0~100점 점수와 5단계 생명주기를 산출합니다.</p>
        {allRanked.length > 0 && (
          <table>
            <thead>
              <tr><th>테마명</th><th>점수</th><th>단계</th><th>주요 관련주</th></tr>
            </thead>
            <tbody>
              {allRanked.slice(0, 20).map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.score}/100</td>
                  <td>{t.stageKo}</td>
                  <td>{t.topStocks.slice(0, 3).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <ThemesContent initialData={ranking} />
    </>
  )
}
