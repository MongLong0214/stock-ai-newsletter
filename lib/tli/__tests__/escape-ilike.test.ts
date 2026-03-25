import { describe, it, expect } from 'vitest'
import { escapeIlike } from '../api-utils'

describe('escapeIlike', () => {
  it('escapes % wildcard', () => {
    expect(escapeIlike('100%')).toBe('100\\%')
  })

  it('escapes _ wildcard', () => {
    expect(escapeIlike('a_b')).toBe('a\\_b')
  })

  it('escapes both % and _', () => {
    expect(escapeIlike('100%_test')).toBe('100\\%\\_test')
  })

  it('returns unchanged string without wildcards', () => {
    expect(escapeIlike('삼성전자')).toBe('삼성전자')
  })

  it('handles empty string', () => {
    expect(escapeIlike('')).toBe('')
  })
})
