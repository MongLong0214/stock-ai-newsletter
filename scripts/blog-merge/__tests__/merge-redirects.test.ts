import { describe, expect, it } from 'vitest'
import nextConfig from '../../../next.config'
import { renderRedirectFile } from '../merge-clusters'

describe('병합 리다이렉트', () => {
  it('맵이 비어 있어도 기존 리다이렉트는 유지된다', async () => {
    const rs = await nextConfig.redirects!()
    expect(rs.some(r => r.source === '/icon')).toBe(true)
  })

  it('생성 파일이 유효한 TS이고 항목을 담는다', () => {
    const out = renderRedirectFile([
      { from: '/blog/old-a', to: '/blog/winner' },
      { from: '/blog/old-b', to: '/blog/winner' },
    ])
    expect(out).toContain("{ from: '/blog/old-a', to: '/blog/winner' },")
    expect(out).toContain('MERGED_BLOG_REDIRECTS')
    expect(out).toContain('항목 수: 2')
  })

  it('빈 목록도 유효한 파일을 만든다', () => {
    expect(renderRedirectFile([])).toContain('MERGED_BLOG_REDIRECTS: readonly')
  })
})
