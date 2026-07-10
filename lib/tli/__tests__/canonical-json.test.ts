import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  assertCanonicalJsonObject,
  compareUtf8Bytes,
  sha256Hex,
  sha256JsonStringArray,
  sha256OrderedJsonStringArray,
} from '../canonical-json'

/** 046 `tli_sha256_json_string_array` / `tli_sha256_ordered_json_string_array`의 SQL 정의를 직접 재현 */
const sqlHashOfJsonArray = (values: readonly string[]): string =>
  createHash('sha256')
    .update(`[${values.map((value) => JSON.stringify(value)).join(',')}]`, 'utf8')
    .digest('hex')

describe('sha256Hex', () => {
  it('UTF-8 bytes 기준 lowercase 64-hex를 낸다', () => {
    expect(sha256Hex('{}')).toMatch(/^[0-9a-f]{64}$/)
    expect(sha256Hex('{}')).toBe(createHash('sha256').update('{}', 'utf8').digest('hex'))
  })
})

describe('compareUtf8Bytes (COLLATE "C")', () => {
  it('ASCII에서 code point 순서를 따른다', () => {
    expect(compareUtf8Bytes('A', 'a')).toBeLessThan(0)
    expect(compareUtf8Bytes('z', '가')).toBeLessThan(0)
    expect(compareUtf8Bytes('a', 'a')).toBe(0)
  })

  it('astral plane에서 JS 기본 정렬(UTF-16)과 달라진다', () => {
    // U+FFFD(EF BF BD) vs U+10000(F0 90 80 80): UTF-8 byte 순서로는 U+FFFD가 앞선다.
    const values = ['\u{10000}', '�']
    expect([...values].sort(compareUtf8Bytes)).toEqual(['�', '\u{10000}'])
    expect([...values].sort()).toEqual(['\u{10000}', '�'])
  })
})

describe('sha256JsonStringArray (C collation 정렬 후 해싱)', () => {
  it('정렬 후 해싱하며 입력 순서에 무관하다', () => {
    expect(sha256JsonStringArray(['b', 'a'])).toBe(sqlHashOfJsonArray(['a', 'b']))
    expect(sha256JsonStringArray(['b', 'a'])).toBe(sha256JsonStringArray(['a', 'b']))
  })

  it('빈 배열은 "[]"를 해싱한다 (PostgreSQL COALESCE 경로)', () => {
    expect(sha256JsonStringArray([])).toBe(sha256Hex('[]'))
  })

  it('중복 값을 제거하지 않는다 (array_agg와 동일)', () => {
    expect(sha256JsonStringArray(['a', 'a'])).toBe(sqlHashOfJsonArray(['a', 'a']))
    expect(sha256JsonStringArray(['a', 'a'])).not.toBe(sha256JsonStringArray(['a']))
  })

  it('observation key 형태를 실제로 해싱한다', () => {
    const keys = [
      '22222222-2222-4222-8222-222222222222|2026-06-08|naver_datalab',
      '11111111-1111-4111-8111-111111111111|2026-06-09|naver_datalab',
    ]
    expect(sha256JsonStringArray(keys)).toBe(sqlHashOfJsonArray([...keys].reverse()))
  })
})

describe('sha256OrderedJsonStringArray (ordinality 보존)', () => {
  it('입력 순서를 그대로 해싱한다', () => {
    expect(sha256OrderedJsonStringArray(['b', 'a'])).toBe(sqlHashOfJsonArray(['b', 'a']))
    expect(sha256OrderedJsonStringArray(['b', 'a'])).not.toBe(sha256OrderedJsonStringArray(['a', 'b']))
  })
})

describe('assertCanonicalJsonObject', () => {
  it('046 tli_parse_canonical_json_v1이 거부하는 입력을 RPC 호출 전에 막는다', () => {
    expect(() => assertCanonicalJsonObject('{"a":1}')).not.toThrow()
    expect(() => assertCanonicalJsonObject('')).toThrow()
    expect(() => assertCanonicalJsonObject('[1]')).toThrow()
    expect(() => assertCanonicalJsonObject('{"a":1}\n')).toThrow()
    expect(() => assertCanonicalJsonObject('{"a":\r1}')).toThrow()
    expect(() => assertCanonicalJsonObject('﻿{"a":1}')).toThrow()
  })
})
