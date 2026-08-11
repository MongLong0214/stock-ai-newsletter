/**
 * changes 응답 계약 회귀 테스트.
 *
 * openapi.json 이 광고하는 필드명과 라우트가 실제로 내보내는 필드명이 갈라져 있었다.
 * 스펙은 id/score/stage 를, 라우트는 themeId/currentScore/currentStage 를 썼다.
 * 이 엔드포인트의 소비자는 UI 가 아니라 llms.txt·openapi.json 을 읽는 어시스턴트이므로,
 * 어긋난 스펙은 곧바로 "없는 키를 찾는" 실패가 된다.
 *
 * 스펙 required 목록을 실제 응답 객체와 직접 대조한다. 라우트 소스를 문자열로
 * 검사하면 같은 이름이 다른 객체(stageTransitions 등)에 있을 때 회귀를 놓친다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadThemeScoreWindowsMock, fromMock } = vi.hoisted(() => ({
  loadThemeScoreWindowsMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('@/lib/tli/rpc/score-windows', () => ({
  loadThemeScoreWindows: loadThemeScoreWindowsMock,
  THEME_SCORE_WINDOW_MAX_THEMES: 500,
}))

vi.mock('@/lib/supabase', () => ({ supabase: { from: fromMock } }))

vi.mock('@/lib/tli/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tli/api-utils')>()
  return { ...actual, placeholderResponse: () => null }
})

const THEME_A = '11111111-1111-4111-8111-111111111111'

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function scoreRow(calculatedAt: string, score: number, stage: string) {
  return {
    id: `${THEME_A}-${calculatedAt}`,
    theme_id: THEME_A,
    score,
    stage,
    is_reigniting: false,
    calculated_at: calculatedAt,
  }
}

beforeEach(() => {
  fromMock.mockReset().mockImplementation(() => ({
    select: (cols: string) => {
      // 이름 조회: .select('id, name, name_en').in('id', chunk)
      if (cols.includes('name')) {
        return {
          in: () =>
            Promise.resolve({
              data: [{ id: THEME_A, name: '테마A', name_en: 'Theme A' }],
              error: null,
            }),
        }
      }
      // 활성 ID 페이지네이션: .select('id').eq(...).order(...).range(...)
      return {
        eq: () => ({
          order: () => ({
            range: (from: number) =>
              Promise.resolve({
                data: from === 0 ? [{ id: THEME_A }] : [],
                error: null,
              }),
          }),
        }),
      }
    },
  }))

  // RPC 계약: calculated_at DESC.
  // 최신 관측을 일부러 '오늘'이 아닌 어제로 둔다. currentAt 이 존재하는 이유가
  // "최신 관측이 오늘이 아닐 수 있다"이므로, 픽스처가 오늘이면 라우트가 관측일 대신
  // 현재 날짜를 넣어도 테스트가 통과해 버린다.
  loadThemeScoreWindowsMock.mockReset().mockResolvedValue({
    data: [
      scoreRow(isoDaysAgo(1), 70, 'Growth'),
      scoreRow(isoDaysAgo(3), 50, 'Early'),
    ],
    error: null,
  })
})

async function moverPayload() {
  const { GET } = await import('@/app/api/tli/changes/route')
  const res = await GET(new Request('https://stockmatrix.co.kr/api/tli/changes?period=1d'))
  const body = await res.json()
  return body.data
}

async function specRequired() {
  const { GET } = await import('@/app/api/openapi.json/route')
  const spec = await (await GET()).json()
  const s = spec.components.schemas
  const base = s.ThemeChangeBase.required as string[]
  const mover = (s.ThemeMover.allOf as Array<{ required?: string[] }>)
    .flatMap((part) => part.required ?? [])
  return { base, mover: [...base, ...mover], schemas: s }
}

describe('/api/tli/changes 응답 계약', () => {
  it('openapi required 필드가 실제 mover 객체에 전부 존재한다', async () => {
    const { mover: required } = await specRequired()
    const data = await moverPayload()
    const entry = data.movers.rising[0]

    expect(entry, 'rising mover 가 생성되지 않았다').toBeDefined()
    for (const field of required) {
      expect(Object.keys(entry), `mover 에 '${field}' 가 없다`).toContain(field)
    }
  })

  it('측정 구간이 실제 관측 날짜로 채워진다', async () => {
    const data = await moverPayload()
    const entry = data.movers.rising[0]

    expect(entry.currentAt).toBe(isoDaysAgo(1))
    expect(entry.previousAt).toBe(isoDaysAgo(3))
    // period=1d 요청이지만 실제 구간은 2일이다. 이 값이 없으면 소비자는
    // 변화량을 하루치로 오인한다.
    expect(entry.gapDays).toBe(2)
  })

  it('stageTransitions 도 기준 시점을 함께 내보낸다', async () => {
    const data = await moverPayload()
    const t = data.stageTransitions[0]

    expect(t, 'stage 전환이 생성되지 않았다').toBeDefined()
    expect(t.fromStage).toBe('Early')
    expect(t.toStage).toBe('Growth')
    expect(t.previousAt).toBe(isoDaysAgo(3))
    expect(t.gapDays).toBe(2)
  })

  it('스펙이 폐기된 필드명을 다시 쓰지 않는다', async () => {
    const { schemas } = await specRequired()
    const props = Object.keys(schemas.ThemeChangeBase.properties)
    for (const stale of ['id', 'score', 'stage']) {
      expect(props, `'${stale}' 는 라우트에 없는 옛 스펙 필드명이다`).not.toContain(stale)
    }
  })

  it('$ref 가 전부 해소된다', async () => {
    const { GET } = await import('@/app/api/openapi.json/route')
    const body = await (await GET()).json()
    const s = body.components.schemas as Record<string, unknown>
    const refs = JSON.stringify(body).match(/#\/components\/schemas\/[A-Za-z]+/g) ?? []
    const missing = [...new Set(refs)].filter((r) => !(r.split('/').pop()! in s))
    expect(missing).toEqual([])
  })
})
