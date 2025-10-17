import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stock Matrix - AI 주식 분석 뉴스레터',
    short_name: 'Stock Matrix',
    description: 'AI가 분석한 기술적 지표 데이터를 매일 오전 7시 50분 무료 발송',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#10b981',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon1.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['finance', 'business', 'productivity'],
    lang: 'ko-KR',
    dir: 'ltr',
    scope: '/',
    prefer_related_applications: false,
  }
}