/**
 * PostgREST max_rows 페이지네이션
 *
 * supabase/config.toml의 max_rows = 1000이 상한이라 .range() 없는 select는
 * 1000행에서 조용히 잘린다. 에러도 경고도 없어서 발행글이 1000개를 넘는 순간
 * 오래된 글부터 sitemap·목록에서 사라진다. 전체를 받아야 하는 조회는 이걸 쓴다.
 */

export const SUPABASE_MAX_ROWS = 1000;

type RangeQuery<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** buildQuery(from, to)를 max_rows 단위로 반복 호출해 전체 행을 모은다. */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => RangeQuery<T>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += SUPABASE_MAX_ROWS) {
    const { data, error } = await buildQuery(from, from + SUPABASE_MAX_ROWS - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < SUPABASE_MAX_ROWS) break;
  }

  return rows;
}
