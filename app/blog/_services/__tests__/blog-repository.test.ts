import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: { code?: string; message: string } | null };

const calls: string[] = [];
let lookup: Result;
let write: Result;

/** supabase 체인 흉내 — 호출한 메서드를 기록하고 마지막에 정해 둔 결과를 돌려준다 */
function chain(final: () => Result) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'update', 'insert', 'upsert']) {
    q[m] = (...args: unknown[]) => {
      calls.push(m === 'neq' || m === 'eq' ? `${m}:${String(args[0])}=${String(args[1])}` : m);
      return q;
    };
  }
  q.maybeSingle = async () => final();
  q.single = async () => final();
  return q;
}

vi.mock('@/lib/supabase/server-client', () => ({
  getServerSupabaseClient: () => ({
    from: () => {
      let wrote = false;
      const q = chain(() => (wrote ? write : lookup));
      for (const m of ['update', 'insert', 'upsert'] as const) {
        const orig = q[m] as (...a: unknown[]) => unknown;
        q[m] = (...a: unknown[]) => { wrote = true; return orig(...a); };
      }
      return q;
    },
  }),
}));
vi.mock('@/lib/indexnow', () => ({ notifyIndexNow: vi.fn(async () => {}) }));

const { saveBlogPost } = await import('../blog-repository');

const post = {
  slug: 's-2026-11-19-abc', title: '제목', description: '설명', content: '본문', target_keyword: '키워드',
  secondary_keywords: [], tags: [], faq_items: [], status: 'published' as const,
};

describe('saveBlogPost', () => {
  beforeEach(() => {
    calls.length = 0;
    lookup = { data: null, error: null };
    write = { data: { slug: post.slug }, error: null };
  });

  it('inserts a new row instead of upserting, so a concurrent publish is never overwritten', async () => {
    await saveBlogPost(post as never);
    expect(calls).toContain('insert');
    expect(calls).not.toContain('upsert');
    write = { data: null, error: { code: '23505', message: 'duplicate key' } };
    await expect(saveBlogPost(post as never)).rejects.toThrow(/슬러그 충돌/);
  });

  it('updates an existing draft only while it is still unpublished', async () => {
    lookup = { data: { status: 'draft' }, error: null };
    await saveBlogPost(post as never);
    expect(calls).toContain('update');
    expect(calls).toContain('neq:status=published');
    // 조회 뒤 다른 실행이 공개했으면 갱신 대상이 없다
    write = { data: null, error: null };
    await expect(saveBlogPost(post as never)).rejects.toThrow(/슬러그 충돌/);
  });

  it('refuses to touch a published row and stops when the lookup fails', async () => {
    lookup = { data: { status: 'published' }, error: null };
    await expect(saveBlogPost(post as never)).rejects.toThrow(/이미 발행된 글/);
    lookup = { data: null, error: { message: 'timeout' } };
    await expect(saveBlogPost(post as never)).rejects.toThrow(/충돌 확인 실패/);
    expect(calls).not.toContain('insert');
  });
});
