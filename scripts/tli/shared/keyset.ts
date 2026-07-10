/**
 * TLI v3 Todo 8: 무정렬 offset/range pagination을 대체하는 3-컬럼 stable keyset primitive.
 *
 * 2026-07-10 스냅샷에서 `.range()` 기반 무정렬 pagination이 동일 31,297행을 반환하는 것처럼
 * 보이면서 6,791개 key를 중복시켰다. `(first, second, third)` 복합 커서는 총순서(strict total
 * order)를 강제해 중복·누락을 원천 차단한다. 마지막 컬럼은 반드시 unique여야 한다(테이블 PK `id`).
 *
 * first 컬럼은 DATE/ISO date 문자열(byte 순서 == 시간 순서)이고 second/third는 UUID이므로
 * DB의 `ORDER BY ... COLLATE "C"`와 정렬이 일치하도록 UTF-8 byte 비교를 쓴다.
 */

import { compareUtf8Bytes } from '@/lib/tli/canonical-json'

export interface KeysetCursor {
  readonly first: string
  readonly second: string
  readonly third: string
}

export interface KeysetColumns {
  readonly first: string
  readonly second: string
  readonly third: string
}

/** DB `ORDER BY first ASC, second COLLATE "C" ASC, third COLLATE "C" ASC`와 동일한 총순서. */
export const compareKeysetCursor = (left: KeysetCursor, right: KeysetCursor): number => {
  if (left.first !== right.first) return left.first < right.first ? -1 : 1
  const second = compareUtf8Bytes(left.second, right.second)
  if (second !== 0) return second
  return compareUtf8Bytes(left.third, right.third)
}

/**
 * PostgREST `.or()` 표현식으로 `(first, second, third) > cursor` row-value 비교를 재현한다.
 * 반드시 세 컬럼 동일 방향 `.order(ascending)`와 함께 써야 총순서가 성립한다.
 */
export const keysetOrExpression = (columns: KeysetColumns, after: KeysetCursor): string => [
  `${columns.first}.gt.${after.first}`,
  `and(${columns.first}.eq.${after.first},${columns.second}.gt.${after.second})`,
  `and(${columns.first}.eq.${after.first},${columns.second}.eq.${after.second},${columns.third}.gt.${after.third})`,
].join(',')

/**
 * keyset 커서로 전체 행을 순회한다. 각 페이지 경계에서 이전 key보다 크지 않은 key가 오면
 * (무정렬 페이지·중복 페이지) 즉시 hard failure로 던진다 — 조용한 중복/누락을 막는 계약이다.
 */
export const paginateByKeyset = async <T>(input: {
  readonly pageSize: number
  readonly fetchPage: (after: KeysetCursor | null) => Promise<readonly T[]>
  readonly keyOf: (row: T) => KeysetCursor
}): Promise<T[]> => {
  const rows: T[] = []
  let after: KeysetCursor | null = null
  let last: KeysetCursor | null = null

  for (;;) {
    const page = await input.fetchPage(after)
    for (const row of page) {
      const key = input.keyOf(row)
      if (last !== null && compareKeysetCursor(key, last) <= 0) {
        throw new Error('keyset pagination returned a non-increasing or duplicate key')
      }
      last = key
      rows.push(row)
    }
    if (page.length < input.pageSize) return rows
    after = last
  }
}
