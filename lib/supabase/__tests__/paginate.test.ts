import { describe, expect, it } from 'vitest';

import { fetchAllRows, SUPABASE_MAX_ROWS } from '../paginate';

/** from~to 범위를 잘라 돌려주는 가짜 PostgREST. max_rows 상한도 그대로 흉내낸다. */
function fakeTable(totalRows: number) {
  const all = Array.from({ length: totalRows }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];

  const query = (from: number, to: number) => {
    calls.push([from, to]);
    const capped = Math.min(to - from + 1, SUPABASE_MAX_ROWS);
    return Promise.resolve({ data: all.slice(from, from + capped), error: null });
  };

  return { calls, query };
}

describe('fetchAllRows', () => {
  it('상한을 넘는 행을 전부 가져온다 (잘리지 않는다)', async () => {
    const { calls, query } = fakeTable(2350);

    const rows = await fetchAllRows(query);

    expect(rows).toHaveLength(2350);
    expect(rows[0]).toEqual({ id: 0 });
    expect(rows[2349]).toEqual({ id: 2349 });
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('정확히 상한과 같은 행 수여도 다음 페이지를 확인한다', async () => {
    // 이 케이스가 원래 버그의 핵심 — 1000개에서 멈추면 1001번째부터 조용히 사라진다.
    const { calls, query } = fakeTable(SUPABASE_MAX_ROWS);

    const rows = await fetchAllRows(query);

    expect(rows).toHaveLength(SUPABASE_MAX_ROWS);
    expect(calls).toHaveLength(2);
  });

  it('상한 미만이면 한 번만 조회한다', async () => {
    const { calls, query } = fakeTable(12);

    expect(await fetchAllRows(query)).toHaveLength(12);
    expect(calls).toHaveLength(1);
  });

  it('빈 테이블이면 빈 배열을 준다', async () => {
    expect(await fetchAllRows(fakeTable(0).query)).toEqual([]);
  });

  it('에러는 삼키지 않고 그대로 던진다', async () => {
    const boom = new Error('PostgREST 실패');

    await expect(
      fetchAllRows(() => Promise.resolve({ data: null, error: boom })),
    ).rejects.toBe(boom);
  });
});
