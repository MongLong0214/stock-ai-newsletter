import type { Metadata } from 'next'
import { Suspense } from 'react'
import ThemesContent from './_components/themes-content'
import ThemesSkeleton from './_components/themes-skeleton'

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

/** 테마 목록 페이지 */
export default function ThemesPage() {
  return (
    <Suspense fallback={<ThemesSkeleton />}>
      <ThemesContent />
    </Suspense>
  )
}
