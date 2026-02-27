import type { Metadata } from 'next'
import { siteConfig } from '@/lib/constants/seo/config'

export const metadata: Metadata = {
  title: '테마 트래킹 알고리즘 — AI 점수 산출 과정 완전 공개',
  description:
    'TLI(Theme Lifecycle Index) 테마 트래킹 알고리즘을 완전 공개합니다. 검색 관심도, 뉴스 모멘텀, 변동성, 활동성 4요소 가중치와 생명주기 5단계 판정 알고리즘을 투명하게 설명합니다.',
  keywords: [
    '테마 트래킹 알고리즘',
    'TLI 점수',
    '테마 생명주기',
    'AI 분석 알고리즘',
    '테마주 점수 산출',
    '테마 분석 방법론',
  ],
  alternates: {
    canonical: `${siteConfig.domain}/themes/methodology`,
  },
  openGraph: {
    title: '테마 트래킹 알고리즘 — AI 점수 산출 과정 완전 공개 | StockMatrix',
    description:
      'TLI 테마 트래킹 알고리즘 완전 공개. 4요소 가중치와 생명주기 5단계 판정 알고리즘을 투명하게 설명합니다.',
    url: `${siteConfig.domain}/themes/methodology`,
    type: 'article',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: '테마 트래킹 알고리즘 — AI 점수 산출 과정 완전 공개 | StockMatrix',
    description:
      'TLI 테마 트래킹 알고리즘 완전 공개. 4요소 가중치와 생명주기 5단계 판정 알고리즘을 투명하게 설명합니다.',
  },
}

const MethodologyLayout = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>
}

export default MethodologyLayout
