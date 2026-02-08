import type { Metadata } from 'next'
import Script from 'next/script'
import { createClient } from '@supabase/supabase-js'
import ThemesContent from './_components/themes-content'
import { getRankingServer } from './_services/get-ranking-server'

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
    canonical: 'https://stockmatrix.co.kr/themes',
  },
  openGraph: {
    title: '주식 테마 분석 — AI 테마 생명주기 추적 | StockMatrix',
    description:
      'AI가 분석하는 한국 주식시장 테마 트렌드. 주요 테마의 생명주기 점수와 단계를 실시간 추적합니다.',
    url: 'https://stockmatrix.co.kr/themes',
    type: 'website',
  },
}

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
        '@id': `https://stockmatrix.co.kr/themes/${theme.id}`,
        name: theme.name,
        description: theme.description || `${theme.name} 테마 생명주기 분석`,
        url: `https://stockmatrix.co.kr/themes/${theme.id}`,
      },
    })),
  }

  return (
    <>
      <Script
        id="theme-list-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <ThemesContent initialData={ranking} />
    </>
  )
}
