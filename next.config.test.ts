import { describe, expect, it } from 'vitest'
import nextConfig from './next.config'

describe('next config', () => {
  it('pins turbopack root to the repository root', () => {
    expect(nextConfig.turbopack?.root).toBe(process.cwd())
  })

  it('HSTS에 includeSubDomains를 붙이되 preload는 붙이지 않는다', async () => {
    // preload는 hstspreload.org 등재 후 해제에 수개월이 걸린다.
    // 서브도메인 계획이 확정되기 전에 헤더에 넣어두면 실수로 제출될 여지가 생긴다.
    const groups = await nextConfig.headers!()
    const hsts = groups
      .flatMap((g) => g.headers)
      .find((h) => h.key === 'Strict-Transport-Security')

    expect(hsts?.value).toContain('includeSubDomains')
    expect(hsts?.value).toContain('max-age=63072000')
    expect(hsts?.value).not.toContain('preload')
  })
})
