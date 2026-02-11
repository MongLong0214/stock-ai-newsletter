import { supabaseAdmin } from './supabase-admin'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

const PAGE_SIZE = 1000
const CHUNK_SIZE = 300
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

/**
 * Supabase 배치 쿼리
 * - .in() 300개 제한 자동 분할
 * - 1000행 페이지네이션 자동 처리
 */
export async function batchQuery<T>(
  table: string,
  select: string,
  ids: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase 쿼리 빌더 타입이 제네릭 체인으로 추론 불가
  filters?: (q: any) => any,
  column = 'theme_id',
): Promise<T[]> {
  const results: T[] = []

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    let from = 0

    while (true) {
      let data: T[] | null = null
      let lastError: string | null = null

      for (let retry = 0; retry < MAX_RETRIES; retry++) {
        let q = supabaseAdmin.from(table).select(select).in(column, chunk)
        if (filters) q = filters(q)
        const result = await q.range(from, from + PAGE_SIZE - 1)

        if (!result.error) {
          data = result.data as T[] | null
          lastError = null
          break
        }

        lastError = result.error.message
        if (retry < MAX_RETRIES - 1) {
          console.warn(`   ⚠️ batchQuery(${table}) 재시도 ${retry + 1}/${MAX_RETRIES - 1}:`, lastError)
          await sleep(BASE_DELAY_MS * Math.pow(2, retry))
        }
      }

      if (lastError) {
        console.error(`   ⚠️ batchQuery(${table}) ${MAX_RETRIES}회 시도 후 실패:`, lastError)
        break
      }
      if (!data?.length) break
      results.push(...data)
      if (data.length < PAGE_SIZE) break
      from += PAGE_SIZE
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
        console.warn(`   ⚠️ 배치 ${i}~${i + batch.length} 재시도 ${retry + 1}/${MAX_RETRIES - 1}:`, upsertError)
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
  } else {
    console.log(`   ✅ ${rows.length}개 ${label} 저장 완료`)
  }

  return failedCount
}
