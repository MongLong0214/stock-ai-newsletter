import { describe, expect, it } from 'vitest'
import { KOREAN_MARKET_HOLIDAYS_BY_YEAR } from './holidays'
import { getKoreanHolidays } from '@/lib/utils/korean-trading-calendar'

/**
 * 2026-09-23 사고 회귀.
 *
 * 이 표가 9/23(수)을 추석 연휴로 오등재해 prepare cron이 `non_trading_day`로 조기 반환했고
 * 그날 발행이 통째로 누락됐다. 2026 추석 당일은 9/25(금), 연휴는 9/24~26이다.
 * 대체공휴일은 없다 — 설·추석 연휴는 일요일과 겹칠 때만 대체가 붙고 9/26은 토요일이다.
 */
describe('2026 추석 연휴', () => {
  const y2026 = KOREAN_MARKET_HOLIDAYS_BY_YEAR[2026]!

  it('9/23(수)은 평일이다', () => {
    expect(y2026.has('2026-09-23')).toBe(false)
  })

  it('연휴는 9/24~26이다', () => {
    for (const d of ['2026-09-24', '2026-09-25', '2026-09-26']) {
      expect(y2026.has(d), d).toBe(true)
    }
  })

  it('9/28(월)은 대체공휴일이 아니다', () => {
    expect(y2026.has('2026-09-28')).toBe(false)
  })
})

/**
 * 표를 두 벌 두면 언젠가 갈라지고, 갈라진 순간을 아무도 모른다.
 * 실제 개장 판정은 KOREAN_MARKET_HOLIDAYS_BY_YEAR만 본다.
 */
describe('공휴일 단일 진실', () => {
  it('korean-trading-calendar가 같은 표를 쓴다', () => {
    for (const year of Object.keys(KOREAN_MARKET_HOLIDAYS_BY_YEAR).map(Number)) {
      expect([...getKoreanHolidays(year)].sort(), String(year))
        .toEqual([...KOREAN_MARKET_HOLIDAYS_BY_YEAR[year]!].sort())
    }
  })
})
