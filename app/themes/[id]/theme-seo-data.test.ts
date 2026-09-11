import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 테이블별 응답. 쿼리 빌더는 체이닝만 하고 maybeSingle/returns에서 끝난다. */
const responses: Record<string, { data: unknown; error: { message: string } | null }> = {}

vi.mock('@/lib/supabase/server-client', () => ({
  getServerSupabaseClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'order', 'limit']) {
        builder[method] = () => builder
      }
      builder.maybeSingle = async () => responses[table] ?? { data: null, error: null }
      builder.returns = async () => responses[table] ?? { data: [], error: null }
      return builder
    },
  }),
}))

// react cache()는 결과를 메모이즈한다 — 테스트끼리 새지 않게 통과시킨다.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, cache: <T,>(fn: T) => fn }
})

const loadModule = async () => (await import('./theme-seo-data')).getThemeSeoData

describe('getThemeSeoData', () => {
  beforeEach(() => {
    vi.resetModules()
    for (const key of Object.keys(responses)) delete responses[key]
  })

  it('테마가 있으면 데이터를 돌려준다', async () => {
    responses.themes = { data: { name: '반도체', name_en: null, description: null }, error: null }
    const getThemeSeoData = await loadModule()

    await expect(getThemeSeoData('t1')).resolves.toMatchObject({ name: '반도체' })
  })

  it('row가 없으면 null — 호출부가 404를 내도 되는 상태', async () => {
    responses.themes = { data: null, error: null }
    const getThemeSeoData = await loadModule()

    await expect(getThemeSeoData('gone')).resolves.toBeNull()
  })

  /**
   * 이 테스트가 이 파일의 존재 이유다.
   *
   * 예전에는 모든 예외를 삼켜 null을 돌려줬다. 그 상태에서 호출부가 404를 내면
   * DB가 잠깐 흔들린 순간 **멀쩡한 테마 페이지가 하드 404로 나가 색인에서 빠진다.**
   * 불확실할 때는 404를 내지 않는다 — 실패는 실패로 올려 500이 되게 둔다.
   */
  it('조회 실패는 null이 아니라 throw — 부재로 둔갑시키지 않는다', async () => {
    responses.themes = { data: null, error: { message: 'statement timeout' } }
    const getThemeSeoData = await loadModule()

    await expect(getThemeSeoData('t1')).rejects.toThrow(/테마 조회 실패/)
  })

  it('조회 실패 메시지에 원인을 남긴다', async () => {
    responses.themes = { data: null, error: { message: 'statement timeout' } }
    const getThemeSeoData = await loadModule()

    await expect(getThemeSeoData('t1')).rejects.toThrow(/statement timeout/)
  })
})
