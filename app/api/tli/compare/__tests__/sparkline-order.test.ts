/**
 * sparkline 시간순 회귀 테스트.
 *
 * 이전 구현은 `.order('calculated_at', { ascending: true })` 쿼리 결과를 그대로 썼다.
 * `load_theme_score_windows` RPC는 `calculated_at DESC`로 반환하므로(마이그레이션 063),
 * 그대로 push하면 차트가 시간 역순으로 그려진다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadThemeScoreWindowsMock, loadLatestPublishedComparisonRunsMock, fromMock } = vi.hoisted(
  () => ({
    loadThemeScoreWindowsMock: vi.fn(),
    loadLatestPublishedComparisonRunsMock: vi.fn(),
    fromMock: vi.fn(),
  }),
)

vi.mock('@/lib/tli/rpc/score-windows', () => ({
  loadThemeScoreWindows: loadThemeScoreWindowsMock,
  loadLatestPublishedComparisonRuns: loadLatestPublishedComparisonRunsMock,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock },
}))

vi.mock('@/lib/tli/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tli/api-utils')>()
  return { ...actual, placeholderResponse: () => null }
})

const THEME_A = '11111111-1111-4111-8111-111111111111'
const THEME_B = '22222222-2222-4222-8222-222222222222'

// The route keeps only rows with calculated_at >= getKSTDateString(-7), so fixed
// literals silently age out of the window and the assertions start comparing against
// an empty sparkline. Dating the fixtures relative to today keeps them inside it.
function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function scoreRow(themeId: string, calculatedAt: string, score: number) {
  return {
    id: `${themeId}-${calculatedAt}`,
    theme_id: themeId,
    score,
    stage: 'Growth',
    is_reigniting: false,
    calculated_at: calculatedAt,
    components: null,
  }
}

beforeEach(() => {
  vi.resetModules()

  fromMock.mockReset().mockImplementation((table: string) => {
    if (table === 'themes') {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({
              data: [
                { id: THEME_A, name: 'Theme A', name_en: null },
                { id: THEME_B, name: 'Theme B', name_en: null },
              ],
              error: null,
            }),
        }),
      }
    }
    // theme_stocks
    return {
      select: () => ({
        in: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }
  })

  loadLatestPublishedComparisonRunsMock.mockReset().mockResolvedValue({ data: [], error: null })

  // RPC 계약: calculated_at DESC
  loadThemeScoreWindowsMock.mockReset().mockResolvedValue({
    data: [
      scoreRow(THEME_A, daysAgo(0), 70),
      scoreRow(THEME_A, daysAgo(1), 60),
      scoreRow(THEME_A, daysAgo(2), 50),
      scoreRow(THEME_B, daysAgo(0), 40),
      scoreRow(THEME_B, daysAgo(1), 30),
    ],
    error: null,
  })
})

describe('GET /api/tli/compare sparkline 순서', () => {
  it('RPC의 DESC 결과를 시간순으로 뒤집어 내보낸다', async () => {
    const { GET } = await import('@/app/api/tli/compare/route')

    const response = await GET(
      new Request(`https://stockmatrix.co.kr/api/tli/compare?ids=${THEME_A},${THEME_B}`),
    )
    const body = await response.json()

    const themeA = body.data.themes.find((t: { id: string }) => t.id === THEME_A)
    const themeB = body.data.themes.find((t: { id: string }) => t.id === THEME_B)

    // 오래된 값 → 최신 값
    expect(themeA.sparkline).toEqual([50, 60, 70])
    expect(themeB.sparkline).toEqual([30, 40])
  })

  it('최신 점수는 여전히 가장 최근 행에서 온다', async () => {
    const { GET } = await import('@/app/api/tli/compare/route')

    const response = await GET(
      new Request(`https://stockmatrix.co.kr/api/tli/compare?ids=${THEME_A},${THEME_B}`),
    )
    const body = await response.json()

    const themeA = body.data.themes.find((t: { id: string }) => t.id === THEME_A)
    expect(themeA.score).toBe(70)
  })
})

describe('GET /api/tli/compare 유사도 로드 실패', () => {
  it('실패를 조용히 삼키지 않고 warning으로 노출한다', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    loadLatestPublishedComparisonRunsMock.mockResolvedValue({
      data: [],
      error: new Error('load_latest_published_comparison_runs: exceeded 100 theme limit'),
    })

    const { GET } = await import('@/app/api/tli/compare/route')
    const response = await GET(
      new Request(`https://stockmatrix.co.kr/api/tli/compare?ids=${THEME_A},${THEME_B}`),
    )
    const body = await response.json()

    expect(body.data.warnings).toContain('유사도 데이터를 불러오지 못했습니다.')
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
