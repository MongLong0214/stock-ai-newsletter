import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { siteConfig, schemaIds, ensureKSTTimezone } from '@/lib/constants/seo/config'
import { STAGE_CONFIG } from '@/lib/tli/types'
import DetailContent from './_components/detail-content'
import ThemeDetailAnalytics from './_components/theme-detail-analytics'

/** 10분마다 재검증 (ISR) */
export const revalidate = 600

/** Supabase 클라이언트 (페이지 내부용) */
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
    { auth: { persistSession: false } }
  )
}

/** 빌드 시 모든 활성 테마 ID 생성 (SSG) */
export async function generateStaticParams() {
  try {
    const { data } = await getSupabase()
      .from('themes')
      .select('id')
      .eq('is_active', true)
    return (data || []).map(t => ({ id: t.id }))
  } catch {
    return []
  }
}

/** 테마 SEO용 풍부한 정보 조회 */
async function getThemeSeoData(id: string) {
  try {
    const supabase = getSupabase()

    const [themeRes, scoreRes, stocksRes] = await Promise.all([
      supabase
        .from('themes')
        .select('name, name_en, description, keywords')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('lifecycle_scores')
        .select('score, stage, calculated_at')
        .eq('theme_id', id)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('theme_stocks')
        .select('stock_name')
        .eq('theme_id', id)
        .order('market_cap', { ascending: false })
        .limit(5),
    ])

    if (!themeRes.data) return null

    return {
      ...themeRes.data,
      score: scoreRes.data?.score ?? null,
      stage: scoreRes.data?.stage ?? null,
      updatedAt: scoreRes.data?.calculated_at ?? null,
      topStocks: (stocksRes.data ?? []).map(s => s.stock_name),
    }
  } catch {
    return null
  }
}

/** 동적 메타데이터 생성 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const theme = await getThemeSeoData(id)

  if (!theme) {
    return {
      title: '존재하지 않는 테마',
      description: '요청하신 테마 정보를 찾을 수 없습니다. 삭제되었거나 비활성화된 테마일 수 있습니다.',
      robots: { index: false, follow: true },
    }
  }

  const stageKo = theme.stage && theme.stage in STAGE_CONFIG
    ? STAGE_CONFIG[theme.stage as keyof typeof STAGE_CONFIG].label
    : null
  const stocksText = theme.topStocks.length > 0 ? theme.topStocks.slice(0, 3).join(', ') : null

  const title = stageKo && theme.score != null
    ? `${theme.name} 관련주 — ${stageKo} 단계 · 점수 ${theme.score}/100`
    : `${theme.name} 관련주 — 테마 생명주기 분석`

  const descParts = [`${theme.name} 테마 생명주기 분석.`]
  if (stageKo && theme.score != null) descParts.push(`현재 ${stageKo} 단계, 점수 ${theme.score}점.`)
  if (stocksText) descParts.push(`주요 종목: ${stocksText}.`)
  descParts.push('단계별 추이, 유사 패턴 비교, 관련 종목을 확인하세요.')
  const description = theme.description || descParts.join(' ')

  const keywords = [
    `${theme.name} 관련주`,
    `${theme.name} 테마주`,
    `${theme.name} 테마`,
    theme.name,
    ...(theme.name_en ? [`${theme.name_en} stocks`] : []),
    '테마 분석',
    '테마 생명주기',
    '테마주 분석',
    ...theme.topStocks.slice(0, 3),
  ]

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: `${siteConfig.domain}/themes/${id}`,
    },
    openGraph: {
      title: `${title} | StockMatrix`,
      description,
      url: `${siteConfig.domain}/themes/${id}`,
      type: 'article',
      locale: 'ko_KR',
      siteName: siteConfig.serviceName,
      images: [
        {
          url: `${siteConfig.domain}/themes/${id}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `${theme.name} 테마 생명주기 분석`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | StockMatrix`,
      description,
      images: [`${siteConfig.domain}/themes/${id}/opengraph-image`],
    },
  }
}

/** 최근 7일 이내 업데이트 여부 확인 */
function isRecentlyUpdated(dateStr: string | null): boolean {
  if (!dateStr) return false
  const updated = new Date(dateStr)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  return updated >= sevenDaysAgo
}

/** 테마 상세 페이지 */
export default async function ThemeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const theme = await getThemeSeoData(id)

  const stageKo = theme?.stage && theme.stage in STAGE_CONFIG
    ? STAGE_CONFIG[theme.stage as keyof typeof STAGE_CONFIG].label
    : null

  const headline = theme
    ? (stageKo && theme.score != null
      ? `${theme.name} 관련주 — ${stageKo} 단계 · 점수 ${theme.score}/100`
      : `${theme.name} 테마 분석`)
    : null

  const isRecent = theme ? isRecentlyUpdated(theme.updatedAt) : false
  const schemaType = isRecent ? 'NewsArticle' as const : 'Article' as const

  const articleSchema = theme ? {
    '@context': 'https://schema.org',
    '@type': schemaType,
    '@id': schemaIds.articleId(`/themes/${id}`),
    headline,
    description: theme.description || `${theme.name} 테마의 AI 생명주기 분석`,
    dateModified: ensureKSTTimezone(theme.updatedAt) || new Date().toISOString(),
    datePublished: ensureKSTTimezone(theme.updatedAt) || new Date().toISOString(),
    author: { '@type': 'Organization', '@id': schemaIds.organization, name: siteConfig.serviceName, url: siteConfig.domain },
    publisher: {
      '@type': 'Organization',
      '@id': schemaIds.organization,
      name: siteConfig.serviceName,
      logo: { '@type': 'ImageObject', url: `${siteConfig.domain}/icon-512.png` },
    },
    image: [
      { '@type': 'ImageObject', url: `${siteConfig.domain}/themes/${id}/opengraph-image`, width: 1200, height: 675 },
      { '@type': 'ImageObject', url: `${siteConfig.domain}/themes/${id}/opengraph-image`, width: 1200, height: 900 },
      { '@type': 'ImageObject', url: `${siteConfig.domain}/themes/${id}/opengraph-image`, width: 1200, height: 1200 },
    ],
    mainEntityOfPage: { '@type': 'WebPage', '@id': schemaIds.pageId(`/themes/${id}`) },
    isPartOf: { '@id': schemaIds.website },
    inLanguage: 'ko-KR',
    ...(theme.keywords?.length ? { keywords: theme.keywords.join(', ') } : {}),
    about: {
      '@type': 'Thing',
      name: `${theme.name} 테마`,
      description: `한국 주식시장 ${theme.name} 관련 테마`,
    },
    speakable: {
      '@type': 'SpeakableSpecification',
      xPath: ['/html/head/title', '/html/head/meta[@name=\'description\']/@content'],
    },
    isAccessibleForFree: true,
    ...(isRecent ? { dateline: '서울' } : {}),
  } : null

  const breadcrumbSchema = theme ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteConfig.domain },
      { '@type': 'ListItem', position: 2, name: '테마 분석', item: `${siteConfig.domain}/themes` },
      { '@type': 'ListItem', position: 3, name: `${theme.name} 관련주` },
    ],
  } : null

  const faqSchema = theme && stageKo ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `${theme.name} 관련주에는 어떤 종목이 있나요?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: theme.topStocks.length > 0
            ? `${theme.name} 테마의 주요 관련주로는 ${theme.topStocks.join(', ')} 등이 있습니다.`
            : `${theme.name} 테마의 관련주 정보를 확인하세요.`,
        },
      },
      {
        '@type': 'Question',
        name: `${theme.name} 테마의 현재 상태는 어떤가요?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${theme.name} 테마는 현재 ${stageKo} 단계이며, 생명주기 점수는 ${theme.score ?? '-'}점입니다.`,
        },
      },
    ],
  } : null

  return (
    <>
      {theme && (
        <ThemeDetailAnalytics
          themeId={id}
          themeName={theme.name}
          themeStage={theme.stage}
          themeScore={theme.score}
        />
      )}
      {articleSchema && (
        <script
          id="theme-article-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema).replace(/</g, '\\u003c') }}
        />
      )}
      {breadcrumbSchema && (
        <script
          id="theme-breadcrumb-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c') }}
        />
      )}
      {faqSchema && (
        <script
          id="theme-faq-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }}
        />
      )}
      {/* SSR 콘텐츠: JS 미실행 AI 크롤러용 */}
      {theme && (
        <section className="sr-only" data-speakable aria-label={`${theme.name} 테마 분석 요약`}>
          <h2 className="theme-headline">{headline}</h2>
          <p>{theme.description || `${theme.name} 테마의 AI 생명주기 분석`}</p>
          {stageKo && theme.score != null && (
            <p className="theme-score">
              현재 단계: {stageKo} | 생명주기 점수: {theme.score}/100점
            </p>
          )}
          {theme.topStocks.length > 0 && (
            <div>
              <h2>{theme.name} 주요 관련주</h2>
              <ul>
                {theme.topStocks.map((stock) => (
                  <li key={stock}>{stock}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      <DetailContent id={id} />
    </>
  )
}
