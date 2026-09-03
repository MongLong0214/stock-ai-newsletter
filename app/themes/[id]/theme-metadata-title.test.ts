import { describe, expect, it } from 'vitest'
import { metadataConfig } from '@/lib/constants/seo/metadata'
import { buildThemeMetadataTitle } from './theme-metadata-title'

describe('buildThemeMetadataTitle', () => {
  it('단계와 점수가 있으면 축약 제목을 만든다', () => {
    expect(buildThemeMetadataTitle('로봇', '성장', 75)).toBe('로봇 관련주 — 성장 75점')
  })

  it('단계나 점수가 없으면 기존 fallback 제목을 유지한다', () => {
    expect(buildThemeMetadataTitle('로봇', null, 75)).toBe('로봇 관련주 — 테마 생명주기 분석')
    expect(buildThemeMetadataTitle('로봇', '성장', null)).toBe('로봇 관련주 — 테마 생명주기 분석')
  })

  it('32자 최장 이름도 titleTemplate을 포함해 60자 이하다', () => {
    const title = buildThemeMetadataTitle('코리아 밸류업 지수(Korea Value-up Index)', '정점', 30)
    const fullTitle = metadataConfig.titleTemplate.replace('%s', title)
    expect([...fullTitle]).toHaveLength(59)
  })
})
