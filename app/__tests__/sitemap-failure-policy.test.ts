/**
 * sitemap 조회 실패 정책.
 *
 * 파일 상단 주석이 명시하듯, 빈 sitemap을 조용히 배포하면 색인이 유실된다.
 * 따라서 프로덕션 배포에서는 조회 실패를 던져 빌드를 세운다.
 * 반대로 preview·로컬은 Supabase 자격증명이 없어 항상 실패하므로, 같은 규칙을
 * 적용하면 색인과 무관한 빌드가 전부 막힌다 — 그때만 부분 sitemap으로 물러난다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getServerSupabaseClientMock } = vi.hoisted(() => ({
  getServerSupabaseClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server-client', () => ({
  getServerSupabaseClient: getServerSupabaseClientMock,
}))

const originalEnv = process.env

/** 모든 조회가 자격증명 오류로 실패하는 클라이언트 */
function failingClient() {
  const failure = { data: null, error: { message: 'Invalid API key' } }
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockResolvedValue(failure)
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(failure).then(resolve)
  return { from: vi.fn().mockReturnValue(chain) }
}

beforeEach(() => {
  vi.resetModules()
  getServerSupabaseClientMock.mockReset().mockReturnValue(failingClient())
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  process.env = { ...originalEnv }
})

afterEach(() => {
  process.env = originalEnv
  vi.restoreAllMocks()
})

describe('sitemap 조회 실패 정책', () => {
  it('프로덕션 배포에서는 실패를 던져 빈 sitemap 배포를 막는다', async () => {
    process.env.VERCEL_ENV = 'production'
    const { default: sitemap } = await import('@/app/sitemap')

    await expect(sitemap()).rejects.toBeDefined()
  })

  it('preview 배포에서는 정적 페이지만 담은 부분 sitemap으로 물러난다', async () => {
    process.env.VERCEL_ENV = 'preview'
    const { default: sitemap } = await import('@/app/sitemap')

    const entries = await sitemap()

    expect(entries.length).toBeGreaterThan(0)
    // 정적 페이지는 남고, DB에서 오는 항목(테마 UUID·블로그 slug)만 빠진다
    expect(entries.some((e) => e.url.endsWith('/themes'))).toBe(true)
    expect(entries.some((e) => e.url.endsWith('/themes/methodology'))).toBe(true)
    const themeDetail = /\/themes\/[0-9a-f]{8}-[0-9a-f]{4}-/i
    expect(entries.some((e) => themeDetail.test(e.url))).toBe(false)
    expect(entries.some((e) => e.url.includes('/blog/'))).toBe(false)
  })

  it('VERCEL_ENV가 없는 로컬 빌드에서도 물러난다', async () => {
    delete process.env.VERCEL_ENV
    const { default: sitemap } = await import('@/app/sitemap')

    await expect(sitemap()).resolves.toBeInstanceOf(Array)
  })
})
