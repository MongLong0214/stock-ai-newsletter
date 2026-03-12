import { beforeEach, describe, expect, it } from 'vitest'
import { collectNaverNews } from '../collectors/naver-news'

describe('naver news collection', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.NAVER_CLIENT_ID
    delete process.env.NAVER_CLIENT_SECRET
    delete process.env.TLI_ALLOW_NEWS_SKIP
  })

  it('fails closed when NAVER credentials are missing', async () => {
    await expect(
      collectNaverNews(
        [{ id: 'theme-1', keywords: ['AI'] }],
        '2026-03-01',
        '2026-03-12',
      ),
    ).rejects.toThrow(/NAVER_CLIENT_ID/i)
  })

  it('can explicitly skip in non-production maintenance mode', async () => {
    process.env.TLI_ALLOW_NEWS_SKIP = '1'

    await expect(
      collectNaverNews(
        [{ id: 'theme-1', keywords: ['AI'] }],
        '2026-03-01',
        '2026-03-12',
      ),
    ).resolves.toEqual({ metrics: [], articles: [] })
  })
})
