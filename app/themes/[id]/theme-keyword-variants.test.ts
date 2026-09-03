import { describe, expect, it } from 'vitest'
import { themeKeywordVariants } from './theme-keyword-variants'

describe('themeKeywordVariants', () => {
  it('괄호나 슬래시가 없는 단순명은 변형을 만들지 않는다', () => {
    expect(themeKeywordVariants('로봇')).toEqual([])
  })

  it('괄호 한정어를 확장하고 머리 단어는 제외한다', () => {
    expect(themeKeywordVariants('2차전지(전고체)')).toEqual([
      '전고체 관련주',
      '전고체',
    ])
    expect(themeKeywordVariants('2차전지(전고체)')).not.toContain('2차전지')
  })

  it('괄호 한정어를 먼저 보존하고 슬래시와 가운데점 조각도 확장한다', () => {
    expect(themeKeywordVariants('온실가스(탄소배출권)/탄소 포집·활용·저장(CCUS)')).toEqual([
      '탄소배출권 관련주',
      '탄소배출권',
      'CCUS 관련주',
      'CCUS',
      '탄소 포집 관련주',
      '탄소 포집',
    ])
  })

  it('변형 키워드는 최대 6개로 제한한다', () => {
    expect(themeKeywordVariants('수소차(연료전지/부품/충전소/저장장치)')).toHaveLength(6)
  })

  it('중복 조각은 한 번만 확장한다', () => {
    expect(themeKeywordVariants('원격진료(비대면진료/비대면진료)/비대면진료')).toEqual([
      '비대면진료 관련주',
      '비대면진료',
    ])
  })

  it('1자 조각과 의미 없는 꼬리 토큰을 버린다', () => {
    expect(themeKeywordVariants('코로나19(A/등/개발/백신 개발 등/진단)')).toEqual([
      '백신 관련주',
      '백신',
      '진단 관련주',
      '진단',
    ])
  })

  it('공백이 든 영문 구문은 유지한다', () => {
    expect(themeKeywordVariants('코리아 밸류업 지수(Korea Value-up Index)')).toEqual([
      'Korea Value-up Index 관련주',
      'Korea Value-up Index',
    ])
  })
})
