import { execFileSync } from 'node:child_process'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {},
}))

import { assertSupportedGitObjectFormat } from '../origins/lock-study-contract'

describe('study contract git object format', () => {
  it.each(['sha1', 'sha256'])('accepts supported %s repositories', (objectFormat) => {
    const assertFormat = () => assertSupportedGitObjectFormat(objectFormat)

    expect(assertFormat).not.toThrow()
  })

  it.each(['', 'sha512', 'unknown', 'SHA1'])('rejects unsupported format %j', (objectFormat) => {
    const assertFormat = () => assertSupportedGitObjectFormat(objectFormat)

    expect(assertFormat).toThrow(/지원하지 않는 Git object format/)
  })

  it('accepts this repository object format', () => {
    const objectFormat = execFileSync('git', ['rev-parse', '--show-object-format'], {
      encoding: 'utf8',
    }).trim()

    expect(() => assertSupportedGitObjectFormat(objectFormat)).not.toThrow()
  })
})
