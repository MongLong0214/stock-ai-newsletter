import { NextResponse } from 'next/server'

import { siteConfig } from '@/lib/constants/seo/config'

export function GET() {
  const manifest = {
    schema_version: 'v1',
    name_for_human: 'StockMatrix 테마 분석',
    name_for_model: 'stockmatrix_themes',
    description_for_human:
      '한국 주식시장 테마 생명주기를 AI로 분석합니다. 250+ 테마의 점수, 단계, 관련주를 확인하세요.',
    description_for_model:
      'Korean stock market theme lifecycle analysis. Get theme rankings by stage (emerging/growth/peak/decline), search themes, get theme details with scores and related stocks. Data updated daily from KOSPI and KOSDAQ markets.',
    auth: { type: 'none' },
    api: {
      type: 'openapi',
      url: `${siteConfig.domain}/api/openapi.json`,
    },
    logo_url: `${siteConfig.domain}/icon-512.png`,
    contact_email: 'aistockmatrix@gmail.com',
    legal_info_url: `${siteConfig.domain}/about`,
  }

  return NextResponse.json(manifest, {
    headers: { 'Cache-Control': 'public, s-maxage=86400' },
  })
}
