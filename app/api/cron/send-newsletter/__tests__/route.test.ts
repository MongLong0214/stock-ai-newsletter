import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
      insert: () => Promise.resolve({ data: null, error: null }),
    }),
  }),
}));

vi.mock('@/lib/sendgrid', () => ({
  sendStockNewsletter: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('@/lib/llm/stock-analysis', () => ({
  getStockAnalysis: vi.fn(() => Promise.resolve({ stocks: [] })),
}));

const importRoute = async () => {
  const mod = await import('../route');
  return mod.POST;
};

const makePostRequest = (authHeader?: string) => {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('Authorization', authHeader);
  return new Request('http://localhost/api/cron/send-newsletter', {
    method: 'POST',
    headers,
  });
};

describe('POST /api/cron/send-newsletter (auth)', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('returns 401 when CRON_SECRET is undefined (fail-closed)', async () => {
    delete process.env.CRON_SECRET;
    const POST = await importRoute();
    const res = await POST(makePostRequest('Bearer anything') as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header missing', async () => {
    process.env.CRON_SECRET = 'test-secret-value-12345';
    const POST = await importRoute();
    const res = await POST(makePostRequest() as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong bearer', async () => {
    process.env.CRON_SECRET = 'test-secret-value-12345';
    const POST = await importRoute();
    const res = await POST(makePostRequest('Bearer wrong-value-00000') as never);
    expect(res.status).toBe(401);
  });

  it('returns non-401 with correct bearer', async () => {
    process.env.CRON_SECRET = 'test-secret-value-12345';
    const POST = await importRoute();
    const res = await POST(makePostRequest('Bearer test-secret-value-12345') as never);
    expect(res.status).not.toBe(401);
  });

  it('returns 401 when CRON_SECRET is whitespace only', async () => {
    process.env.CRON_SECRET = '   ';
    const POST = await importRoute();
    const res = await POST(makePostRequest('Bearer    ') as never);
    expect(res.status).toBe(401);
  });
});
