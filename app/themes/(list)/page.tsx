import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { siteConfig } from '@/lib/constants/seo/config'
import ThemesContent from '../_components/themes-content'
import { getRankingServer } from '../_services/get-ranking-server'

/** 테마 목록 페이지 메타데이터 */
export const metadata: Metadata = {
  title: '주식 테마 분석 — AI 테마 생명주기 추적',
  description:
    'AI가 분석하는 한국 주식시장 테마 트렌드. 반도체, 2차전지, AI 등 주요 테마의 생명주기 점수와 단계를 실시간 추적합니다.',
  keywords: [
    '주식 테마',
    '테마주',
    '테마 분석',
    '주식 테마 추적',
    'AI 테마 분석',
    '테마 생명주기',
    '반도체 테마',
    '2차전지 테마',
  ],
  alternates: {
    canonical: `${siteConfig.domain}/themes`,
  },
  openGraph: {
    title: '주식 테마 분석 — AI 테마 생명주기 추적 | StockMatrix',
    description:
      'AI가 분석하는 한국 주식시장 테마 트렌드. 주요 테마의 생명주기 점수와 단계를 실시간 추적합니다.',
    url: `${siteConfig.domain}/themes`,
    type: 'website',
    locale: 'ko_KR',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: '주식 테마 분석' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '주식 테마 분석 — AI 테마 생명주기 추적 | StockMatrix',
    description:
      'AI가 분석하는 한국 주식시장 테마 트렌드. 주요 테마의 생명주기 점수와 단계를 실시간 추적합니다.',
    images: ['/twitter-image'],
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

  return (
    <>
      <script
        id="theme-list-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema).replace(/</g, '\\u003c') }}
      />
      <ThemesContent initialData={ranking} />
    </>
  )
}
