import { describe, expect, it } from 'vitest'
import {
  canonicalJsonV1,
  canonicalJsonV1Bytes,
  canonicalJsonV1Sha256,
  parseCanonicalJsonV1,
} from '@/lib/tli/canonical-json-v1'

describe('canonical-json-v1', () => {
  it('matches the RFC 8785 primitive and property-order example', () => {
    const value = {
      numbers: [333333333.33333329, 1E30, 4.5, 2e-3, 0.000000000000000000000000001],
      string: "€$\u000f\nA'B\"\\\\\"/",
      literals: [null, true, false],
    }

    expect(canonicalJsonV1(value)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    )
  })

  it('sorts recursively by UTF-16 code units while preserving array order', () => {
    expect(canonicalJsonV1({ z: [{ b: 2, a: 1 }], a: ['second', 'first'] })).toBe(
      '{"a":["second","first"],"z":[{"a":1,"b":2}]}',
    )
  })

  it('returns exact UTF-8 bytes and a lowercase SHA-256', () => {
    const value = { 한글: '테마', date: '2026-07-10' }
    const canonical = canonicalJsonV1(value)

    expect(new TextDecoder().decode(canonicalJsonV1Bytes(value))).toBe(canonical)
    expect(canonicalJsonV1Sha256(value)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects duplicate keys and every noncanonical raw representation', () => {
    expect(() => parseCanonicalJsonV1('{"a":1,"a":2}')).toThrow(/canonical-json-v1/)
    expect(() => parseCanonicalJsonV1('{ "a":1}')).toThrow(/canonical-json-v1/)
    expect(() => parseCanonicalJsonV1('{"b":1,"a":2}')).toThrow(/canonical-json-v1/)
    expect(parseCanonicalJsonV1('{"a":2,"b":1}')).toEqual({ a: 2, b: 1 })
  })

  it('hard-fails nonfinite, unsupported, cyclic, sparse, and invalid Unicode values', () => {
    expect(() => canonicalJsonV1(Number.NaN)).toThrow(/finite/)
    expect(() => canonicalJsonV1(Number.POSITIVE_INFINITY)).toThrow(/finite/)
    expect(() => canonicalJsonV1({ value: undefined })).toThrow(/unsupported/)
    expect(() => canonicalJsonV1(BigInt(1))).toThrow(/unsupported/)
    expect(() => canonicalJsonV1([, 1])).toThrow(/sparse/)
    expect(() => canonicalJsonV1('\ud800')).toThrow(/Unicode/)

    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => canonicalJsonV1(cyclic)).toThrow(/cyclic/)
  })
})
