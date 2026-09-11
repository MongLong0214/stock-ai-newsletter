import { describe, expect, it, vi } from 'vitest'
import { dedupeThemeStocks } from '@/scripts/tli/shared/data-ops'

const stock = (themeId: string, symbol: string, name = `S${symbol}`, currentPrice = 1000) => ({
  themeId,
  symbol,
  name,
  market: 'KOSPI',
  currentPrice,
})

/**
 * 2026-09-11 회귀.
 *
 * Postgres는 하나의 INSERT ... ON CONFLICT 문 안에서 같은 충돌 키가 두 번 나오면
 * "ON CONFLICT DO UPDATE command cannot affect row a second time"으로 **배치 전체**를
 * 거부한다. 실측에서 중복 때문에 500건 배치가 통째로 실패해 5,725건 중 500건이 저장되지
 * 않았고 수집 단계가 치명적 실패로 끝났다. 쓰기 경로가 유일성을 보장해야 한다.
 */
describe('dedupeThemeStocks', () => {
  it('같은 (theme_id, symbol)을 한 건으로 줄인다', () => {
    const result = dedupeThemeStocks([
      stock('t1', '005930'),
      stock('t1', '005930'),
      stock('t1', '000660'),
    ])

    expect(result).toHaveLength(2)
    expect(result.filter((s) => s.symbol === '005930')).toHaveLength(1)
  })

  it('같은 종목이라도 테마가 다르면 남긴다', () => {
    expect(dedupeThemeStocks([stock('t1', '005930'), stock('t2', '005930')])).toHaveLength(2)
  })

  it('중복 시 나중 값을 남긴다 — 최신 시세가 뒤에 온다', () => {
    const result = dedupeThemeStocks([
      stock('t1', '005930', 'old', 100),
      stock('t1', '005930', 'new', 200),
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ currentPrice: 200, name: 'new' })
  })

  it('중복이 없으면 순서를 유지하고 그대로 둔다', () => {
    const input = [stock('t1', '005930'), stock('t1', '000660'), stock('t2', '035720')]

    expect(dedupeThemeStocks(input).map((s) => s.symbol)).toEqual(['005930', '000660', '035720'])
  })

  it('빈 배열도 안전하다', () => {
    expect(dedupeThemeStocks([])).toEqual([])
  })

  it('중복을 조용히 버리지 않고 경고로 남긴다 — 출처를 다음 런에서 추적할 수 있어야 한다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    dedupeThemeStocks([stock('t1', '005930'), stock('t1', '005930')])

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('중복 1건 제거'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('t1/005930'))
    warn.mockRestore()
  })

  it('중복이 없으면 경고하지 않는다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    dedupeThemeStocks([stock('t1', '005930'), stock('t1', '000660')])

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
