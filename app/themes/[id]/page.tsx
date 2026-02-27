import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { siteConfig } from '@/lib/constants/seo/config'
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

/** 테마 메타데이터용 기본 정보 조회 */
async function getThemeMeta(id: string) {
  try {
    const { data } = await getSupabase()
      .from('themes')
      .select('name, name_en, description')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle()
    return data
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
  const theme = await getThemeMeta(id)

  if (!theme) {
    return { title: '테마 상세' }
  }

  const title = `${theme.name} 테마 분석 — 생명주기 점수 & 전망`
  const description =
    theme.description ||
    `${theme.name} 테마의 AI 생명주기 분석. 현재 단계, 점수 변화, 관련 종목, 유사 패턴 비교를 확인하세요.`

  return {
    title,
    description,
    keywords: [
      theme.name,
      `${theme.name} 테마`,
      `${theme.name} 관련주`,
      '테마 분석',
      '테마 생명주기',
    ],
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
  const theme = await getThemeMeta(id)

  const articleSchema = theme ? {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${theme.name} 테마 분석 — 생명주기 점수 & 전망`,
    description: theme.description || `${theme.name} 테마의 AI 생명주기 분석`,
    datePublished: new Date().toISOString().split('T')[0],
    author: { '@type': 'Organization', name: siteConfig.serviceName, url: siteConfig.domain },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.serviceName,
      logo: { '@type': 'ImageObject', url: `${siteConfig.domain}/icon-512.png` },
    },
    image: `${siteConfig.domain}/themes/${id}/opengraph-image`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${siteConfig.domain}/themes/${id}` },
  } : null

  const breadcrumbSchema = theme ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteConfig.domain },
      { '@type': 'ListItem', position: 2, name: '테마 분석', item: `${siteConfig.domain}/themes` },
      { '@type': 'ListItem', position: 3, name: theme.name, item: `${siteConfig.domain}/themes/${id}` },
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
      <DetailContent id={id} />
    </>
  )
}
