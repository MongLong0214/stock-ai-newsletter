import { describe, expect, it } from 'vitest'
import nextConfig from './next.config'

describe('next config', () => {
  it('pins turbopack root to the repository root', () => {
    expect(nextConfig.turbopack?.root).toBe(process.cwd())
  })
})
