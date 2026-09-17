import { describe, expect, it, vi } from 'vitest'

// 빈 목록이면 DB를 건드리기 전에 끝나야 한다 — 건드리면 이 mock이 터진다.
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: () => { throw new Error('빈 목록에 DB를 건드렸다') } },
}))

import { buildSweepScope, deactivateThemeStocks } from '@/scripts/tli/shared/data-ops'

const stock = (themeId: string, symbol: string) => ({ themeId, symbol })

/**
 * 2026-09-17 회귀.
 *
 * theme_stocks 활성 6,975건 중 1,086건(15.6%)이 **수집이 영원히 닿지 않는 잔여 행**이었다.
 * 최고령 행은 2026-03-27자. 원인은 sweep 범위를 "종목이 나온 테마"로 잡은 것이다 —
 * 네이버에서 빈 테마가 되면 그 테마가 범위에서 빠져 과거 종목이 계속 활성으로 남았다.
 *
 * 동시에, 범위를 무조건 넓히면 정반대 사고가 난다: 게이트 실패로 결과를 모르는 테마까지
 * 범위에 넣으면 소스가 잠깐 비었을 때 멀쩡한 종목을 대량 비활성화한다.
 * 그래서 범위는 정확히 "성공적으로 동기화된 테마"여야 한다.
 */
describe('buildSweepScope', () => {
  it('종목이 나온 테마는 그 종목 집합을 갖는다', () => {
    const scope = buildSweepScope([stock('t1', '005930'), stock('t1', '000660')], ['t1'])

    expect(scope.get('t1')).toEqual(new Set(['005930', '000660']))
  })

  /** 이 테스트가 이 파일의 존재 이유다 — 잔여 1,086건의 원인. */
  it('동기화됐지만 종목이 0건인 테마도 범위에 넣는다 — 빈 집합으로', () => {
    const scope = buildSweepScope([stock('t1', '005930')], ['t1', 'empty'])

    expect(scope.has('empty')).toBe(true)
    expect(scope.get('empty')?.size).toBe(0)
  })

  it('게이트 실패로 결과를 모르는 테마는 범위에 넣지 않는다 — 부분 실패에는 sweep하지 않는다', () => {
    const scope = buildSweepScope([stock('ok', '005930')], ['ok'])

    expect(scope.has('failed')).toBe(false)
  })

  it('전 테마가 실패해 동기화 목록이 비면 sweep 대상이 없다', () => {
    expect(buildSweepScope([], []).size).toBe(0)
  })

  it('동기화 목록이 없으면 종목이 나온 테마로만 한정한다 — 이전 동작 유지', () => {
    const scope = buildSweepScope([stock('t1', '005930')])

    expect([...scope.keys()]).toEqual(['t1'])
  })

  it('동기화 목록에 없는 테마에서 종목이 나와도 버리지 않는다 — 수집 결과가 곧 근거다', () => {
    const scope = buildSweepScope([stock('extra', '005930')], ['t1'])

    expect(scope.get('extra')).toEqual(new Set(['005930']))
  })
})

/**
 * `.in('theme_id', [])`를 그대로 보내면 필터가 무력화돼 **전량 비활성화**로 번질 수 있다.
 * 빈 목록은 DB에 닿기 전에 no-op으로 끝나야 한다.
 */
describe('deactivateThemeStocks', () => {
  it('빈 목록이면 DB를 건드리지 않고 0을 돌려준다', async () => {
    await expect(deactivateThemeStocks([])).resolves.toBe(0)
  })
})
