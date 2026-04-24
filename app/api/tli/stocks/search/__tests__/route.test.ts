import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          ilike: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/tli/api-utils', async () => {
  const NextResponseMod = await import('next/server');
  return {
    apiError: (msg: string, status: number) =>
      NextResponseMod.NextResponse.json({ error: msg }, { status }),
    apiSuccess: (data: unknown) => NextResponseMod.NextResponse.json({ data }),
    escapeIlike: (s: string) => s,
    handleApiError: (err: unknown) =>
      NextResponseMod.NextResponse.json(
        { error: err instanceof Error ? err.message : 'error' },
        { status: 500 },
      ),
    isTableNotFound: () => false,
    placeholderResponse: () => null,
  };
});

vi.mock('@/lib/tli/date-utils', () => ({
  getKSTDateString: () => '2026-04-20',
}));

vi.mock('@/lib/tli/types', () => ({
  getStageKo: () => '성장기',
  toStage: (s: unknown) => s,
}));

const makeRequest = (q: string | null) => {
  const url = new URL('http://localhost/api/tli/stocks/search');
  if (q !== null) url.searchParams.set('q', q);
  return new Request(url.toString());
};

const importRoute = async () => (await import('../route')).GET;

describe('GET /api/tli/stocks/search (Zod)', () => {
  beforeEach(() => vi.resetModules());

  it('returns 422 when q is missing', async () => {
    const GET = await importRoute();
    const res = await GET(makeRequest(null), {} as never);
    expect(res.status).toBe(422);
  });

  it('returns 422 when q exceeds 100 chars', async () => {
    const GET = await importRoute();
    const res = await GET(makeRequest('x'.repeat(101)), {} as never);
    expect(res.status).toBe(422);
  });

  it('returns 422 when q contains CRLF', async () => {
    const GET = await importRoute();
    const res = await GET(makeRequest('foo\r\nbar'), {} as never);
    expect(res.status).toBe(422);
  });

  it('returns 422 when q contains tab', async () => {
    const GET = await importRoute();
    const res = await GET(makeRequest('foo\tbar'), {} as never);
    expect(res.status).toBe(422);
  });

  it('returns 422 when q contains null byte', async () => {
    const GET = await importRoute();
    const res = await GET(makeRequest('foo\0bar'), {} as never);
    expect(res.status).toBe(422);
  });

  it('returns 200 with valid korean query', async () => {
    const GET = await importRoute();
    const res = await GET(makeRequest('삼성'), {} as never);
    expect(res.status).toBe(200);
  });

  it('returns 200 with SQL wildcard (Zod passes, escapeIlike handles)', async () => {
    const GET = await importRoute();
    const res = await GET(makeRequest('%test_'), {} as never);
    expect(res.status).toBe(200);
  });
});
