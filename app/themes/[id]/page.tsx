import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { siteConfig } from '@/lib/constants/seo/config'
import { STAGE_CONFIG } from '@/lib/tli/types'
import DetailContent from './_components/detail-content'

/** 10분마다 재검증 (ISR) */
export const revalidate = 600

/** Supabase 클라이언트 (페이지 내부용) */
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    return { title: '테마 상세' }
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

/** 테마 상세 페이지 */
export default async function ThemeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const theme = await getThemeSeoData(id)

  const stageKo = theme?.stage && theme.stage in STAGE_CONFIG
    ? STAGE_CONFIG[theme.stage as keyof typeof STAGE_CONFIG].label
    : null

  const articleSchema = theme ? {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: stageKo && theme.score != null
      ? `${theme.name} 관련주 — ${stageKo} 단계 · 점수 ${theme.score}/100`
      : `${theme.name} 테마 분석`,
    description: theme.description || `${theme.name} 테마의 AI 생명주기 분석`,
    dateModified: theme.updatedAt || new Date().toISOString().split('T')[0],
    datePublished: theme.updatedAt || new Date().toISOString().split('T')[0],
    author: { '@type': 'Organization', name: siteConfig.serviceName, url: siteConfig.domain },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.serviceName,
      logo: { '@type': 'ImageObject', url: `${siteConfig.domain}/icon-512.png` },
    },
    image: `${siteConfig.domain}/themes/${id}/opengraph-image`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${siteConfig.domain}/themes/${id}` },
    ...(theme.keywords?.length ? { keywords: theme.keywords.join(', ') } : {}),
    about: {
      '@type': 'Thing',
      name: `${theme.name} 테마`,
      description: `한국 주식시장 ${theme.name} 관련 테마`,
    },
  } : null

  const breadcrumbSchema = theme ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteConfig.domain },
      { '@type': 'ListItem', position: 2, name: '테마 분석', item: `${siteConfig.domain}/themes` },
      { '@type': 'ListItem', position: 3, name: `${theme.name} 관련주`, item: `${siteConfig.domain}/themes/${id}` },
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
      <DetailContent id={id} />
    </>
  )
}
