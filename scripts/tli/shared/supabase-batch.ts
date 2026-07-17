import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'
import { assertBatchUpsertComplete } from '@/scripts/tli/shared/batch-upsert-failures'
export { BatchUpsertPartialFailureError, assertBatchUpsertComplete } from '@/scripts/tli/shared/batch-upsert-failures'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

const PAGE_SIZE = 1000
const CHUNK_SIZE = 300
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

interface BatchUpsertOptions {
  readonly failOnPartial?: boolean
}

export interface BatchQueryOptions {
  readonly failOnError?: boolean
  /**
   * range() 페이지네이션의 결정적 정렬 키.
   * ORDER BY 없는 LIMIT/OFFSET은 행 순서가 정의되지 않아 페이지 간 중복·누락이 발생할 수 있다
   * (PostgreSQL 문서의 명시적 경고). 정확한 스냅샷이 필요한 읽기는 고유 컬럼을 지정한다.
   */
  readonly orderBy?: { readonly column: string; readonly ascending?: boolean }
}

/**
 * Supabase 배치 쿼리
 * - .in() 300개 제한 자동 분할
 * - count(exact) 기준 페이지네이션 — 서버가 돌려준 실제 행 수만큼만 커서를 전진시킨다.
 *
 * WHY count 기준: PostgREST의 max-rows가 PAGE_SIZE와 같으면 모든 페이지가 상한에 걸려 있어
 * 여유가 0이다. "짧은 페이지 = 데이터 끝"으로 단정하면 서버가 한 페이지라도 적게 돌려준 순간
 * 에러 없이 결과 전체가 잘리고, 호출자는 그 불완전한 집합을 사실로 오인한다.
 * 잘린 읽기는 조용히 넘기지 않고 반드시 throw한다 — 부분 스냅샷은 어떤 호출자에게도 안전하지 않다.
 */
export async function batchQuery<T>(
  table: string,
  select: string,
  ids: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase 쿼리 빌더 타입이 제네릭 체인으로 추론 불가
  filters?: (q: any) => any,
  column = 'theme_id',
  options?: BatchQueryOptions,
): Promise<T[]> {
  const results: T[] = []

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    let from = 0
    let total: number | null = null
    let fetched = 0
    let toleratedError = false

    while (true) {
      let data: T[] | null = null
      let pageTotal: number | null = null
      let lastError: string | null = null

      for (let retry = 0; retry < MAX_RETRIES; retry++) {
        let q = supabaseAdmin.from(table).select(select, { count: 'exact' }).in(column, chunk)
        if (filters) q = filters(q)
        if (options?.orderBy) {
          q = q.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true })
        }
        const result = await q.range(from, from + PAGE_SIZE - 1)

        if (!result.error) {
          data = result.data as T[] | null
          pageTotal = result.count ?? null
          lastError = null
          break
        }

        lastError = result.error.message
        if (retry < MAX_RETRIES - 1) {
          console.warn(`   ⚠️ batchQuery(${table}) 시도 ${retry + 2}/${MAX_RETRIES}:`, lastError)
          await sleep(BASE_DELAY_MS * Math.pow(2, retry))
        }
      }

      if (lastError) {
        console.error(`   ⚠️ batchQuery(${table}) ${MAX_RETRIES}회 시도 후 실패:`, lastError)
        if (options?.failOnError) {
          throw new Error(lastError)
        }
        // failOnError를 끈 호출자는 조회 실패를 감수하기로 한 쪽이다(이미 로그로 드러남).
        // 이 경우에만 완전성 단언을 건너뛴다 — 잘림을 묵인하는 유일한 경로.
        toleratedError = true
        break
      }

      if (total === null) total = pageTotal
      const pageRows = data?.length ?? 0
      if (pageRows > 0) {
        results.push(...(data as T[]))
        fetched += pageRows
      }

      // count를 못 받으면 전진 조건을 판정할 수 없다 — 짧은 페이지를 끝으로 단정하던 옛 동작으로
      // 되돌아가면 조용한 잘림이 부활하므로, 알 수 없는 상태는 명시적으로 실패시킨다.
      if (total === null) {
        throw new Error(`batchQuery(${table}) count(exact)를 받지 못해 완전성을 보장할 수 없습니다`)
      }
      if (fetched >= total) break
      if (pageRows === 0) {
        throw new Error(
          `batchQuery(${table}) 페이지네이션 정체: ${fetched}/${total}행에서 빈 페이지 — 결과가 잘렸습니다`,
        )
      }
      from += pageRows
    }

    if (!toleratedError && total !== null && fetched !== total) {
      throw new Error(`batchQuery(${table}) 결과 잘림: ${fetched}/${total}행만 조회되었습니다`)
    }
  }

  return results
}

/** theme_id 기준 그룹화 */
export function groupByThemeId<T extends { theme_id: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const arr = map.get(item.theme_id) || []
    arr.push(item)
    map.set(item.theme_id, arr)
  }
  return map
}

/** 배치 upsert (500건씩 분할, 실패 건수 반환) */
export async function batchUpsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  label: string,
  options?: BatchUpsertOptions,
): Promise<number> {
  if (rows.length === 0) return 0

  console.log(`\n💾 ${label} 저장 중...`)

  let failedCount = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    let upsertError: string | null = null

    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      const { error } = await supabaseAdmin
        .from(table)
        .upsert(batch, { onConflict })

      if (!error) {
        upsertError = null
        break
      }

      upsertError = error.message
      if (retry < MAX_RETRIES - 1) {
        console.warn(`   ⚠️ 배치 ${i}~${i + batch.length} 시도 ${retry + 2}/${MAX_RETRIES}:`, upsertError)
        await sleep(BASE_DELAY_MS * Math.pow(2, retry))
      }
    }

    if (upsertError) {
      failedCount += batch.length
      console.error(`   ⚠️ 배치 ${i}~${i + batch.length} ${MAX_RETRIES}회 시도 후 실패:`, upsertError)
    }
  }

  if (failedCount === rows.length) {
    throw new Error(`${label} 전량 저장 실패 (${failedCount}건)`)
  } else if (failedCount > 0) {
    console.error(`   ❌ ${failedCount}/${rows.length}개 ${label} 저장 실패`)
    if (options?.failOnPartial !== false) {
      assertBatchUpsertComplete({ label, rowCount: rows.length, failedCount })
    }
  } else {
    console.log(`   ✅ ${rows.length}개 ${label} 저장 완료`)
  }

  return failedCount
}
