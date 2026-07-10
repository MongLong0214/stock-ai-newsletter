/**
 * TLI v3 `canonical-json-v1` 계약 표면.
 *
 * RFC 8785 JCS 직렬화 자체는 `canonical-json-v1.ts` 한 곳에만 존재한다. 이 모듈은 그 위에
 * 046 migration의 SQL hash 함수를 클라이언트에서 정확히 재현하는 helper를 얹는다.
 *
 * `tli_collection_runs.expected_keys_sha256`는 DB의 DEFERRABLE constraint trigger가 COMMIT 시점에
 * 실제 삽입된 observation key 집합과 대조하므로, 아래 세 함수는 각각
 * `tli_sha256_text` / `tli_sha256_json_string_array` / `tli_sha256_ordered_json_string_array`와
 * **byte 단위로 동일한 결과**를 내야 한다.
 */

import { createHash } from 'node:crypto'

import { canonicalJsonV1, canonicalJsonV1Sha256, type CanonicalJsonValue } from './canonical-json-v1'

export { canonicalJsonV1, canonicalJsonV1Bytes, canonicalJsonV1Sha256, parseCanonicalJsonV1 } from './canonical-json-v1'

export type JsonValue = CanonicalJsonValue
export type JsonObject = { readonly [key: string]: CanonicalJsonValue }

/** canonical-json-v1 bytes의 SHA-256 (lowercase 64-hex) */
export const sha256CanonicalJson = (value: unknown): string => canonicalJsonV1Sha256(value)

export const sha256Hex = (utf8Text: string): string =>
  createHash('sha256').update(utf8Text, 'utf8').digest('hex')

/** `COLLATE "C"` == UTF-8 byte 순서. JS 기본 정렬(UTF-16)은 astral plane에서 갈리므로 직접 비교한다. */
export const compareUtf8Bytes = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))

const hashJsonStringArray = (values: readonly string[]): string =>
  sha256Hex(`[${values.map((value) => canonicalJsonV1(value)).join(',')}]`)

/**
 * DB `tli_sha256_json_string_array(TEXT[])`: C collation 정렬 후 JSON string array를 해싱한다.
 * PostgreSQL `array_agg`와 동일하게 중복을 제거하지 않는다.
 */
export const sha256JsonStringArray = (values: readonly string[]): string =>
  hashJsonStringArray([...values].sort(compareUtf8Bytes))

/** DB `tli_sha256_ordered_json_string_array(TEXT[])`: 입력 순서(ordinality)를 그대로 보존한다. */
export const sha256OrderedJsonStringArray = (values: readonly string[]): string =>
  hashJsonStringArray(values)

/** 046 `tli_parse_canonical_json_v1`이 거부하는 입력을 RPC 호출 전에 먼저 걸러낸다. */
export const assertCanonicalJsonObject = (canonicalJson: string): void => {
  if (
    canonicalJson === ''
    || !canonicalJson.startsWith('{')
    || !canonicalJson.endsWith('}')
    || canonicalJson.includes('﻿')
    || /[\r\n]/.test(canonicalJson)
  ) {
    throw new Error('canonical-json-v1: BOM/개행 없는 단일 UTF-8 object여야 합니다')
  }
}
