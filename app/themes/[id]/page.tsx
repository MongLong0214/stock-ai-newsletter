import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import DetailContent from './_components/detail-content'

/** 테마 메타데이터용 기본 정보 조회 */
async function getThemeMeta(id: string) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
    const { data } = await supabase
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
      canonical: `https://stockmatrix.co.kr/themes/${id}`,
    },
    openGraph: {
      title: `${title} | StockMatrix`,
      description,
      url: `https://stockmatrix.co.kr/themes/${id}`,
      type: 'article',
      locale: 'ko_KR',
      siteName: 'StockMatrix',
      images: [
        {
          url: `https://stockmatrix.co.kr/themes/${id}/opengraph-image`,
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
      images: [`https://stockmatrix.co.kr/themes/${id}/opengraph-image`],
    },
  }
}

/** 테마 상세 페이지 */
export default async function ThemeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DetailContent id={id} />
}
