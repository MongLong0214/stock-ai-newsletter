import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../check-rate-limit', () => ({
  checkRateLimit: vi.fn(),
}));

import { withRateLimit } from '../with-rate-limit';
import { checkRateLimit } from '../check-rate-limit';

const checkRateLimitMock = vi.mocked(checkRateLimit);

const makeRequest = (path = '/api/test') =>
  new Request(`http://localhost${path}`);

describe('withRateLimit', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    checkRateLimitMock.mockReset();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns 429 + Retry-After header when rate limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue({ ok: false, retryAfter: 42 });
    const handler = vi.fn();
    const wrapped = withRateLimit('standard', handler);

    const res = await wrapped(makeRequest(), undefined);

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(handler).not.toHaveBeenCalled();
  });

  it('defaults Retry-After to 60 when retryAfter is not provided', async () => {
    checkRateLimitMock.mockResolvedValue({ ok: false });
    const wrapped = withRateLimit('strict', vi.fn());

    const res = await wrapped(makeRequest(), undefined);

    expect(res.headers.get('Retry-After')).toBe('60');
  });

  it('calls handler and passes through response when rate limit is ok', async () => {
    checkRateLimitMock.mockResolvedValue({ ok: true });
    const expected = new Response('hello', { status: 200 });
    const handler = vi.fn().mockResolvedValue(expected);
    const wrapped = withRateLimit('standard', handler);

    const req = makeRequest();
    const ctx = { foo: 'bar' };
    const res = await wrapped(req, ctx);

    expect(res).toBe(expected);
    expect(handler).toHaveBeenCalledWith(req, ctx);
  });

  it('logs structured JSON event on 429', async () => {
    checkRateLimitMock.mockResolvedValue({ ok: false, retryAfter: 7 });
    const wrapped = withRateLimit('strict', vi.fn());

    await wrapped(makeRequest('/api/tli/compare'), undefined);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = String(warnSpy.mock.calls[0]?.[0] ?? '');
    const parsed = JSON.parse(logged);
    expect(parsed.event).toBe('rate_limit_hit');
    expect(parsed.policy).toBe('strict');
    expect(parsed.path).toBe('/api/tli/compare');
    expect(parsed.retryAfter).toBe('7');
  });

  it('does not log when rate limit is ok', async () => {
    checkRateLimitMock.mockResolvedValue({ ok: true });
    const wrapped = withRateLimit('standard', vi.fn().mockResolvedValue(new Response()));

    await wrapped(makeRequest(), undefined);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns 503 with reason=backend_unavailable (strict fail-closed on Upstash outage)', async () => {
    checkRateLimitMock.mockResolvedValue({
      ok: false,
      retryAfter: 30,
      reason: 'backend_unavailable',
    });
    const wrapped = withRateLimit('strict', vi.fn());

    const res = await wrapped(makeRequest('/api/ai/summary'), undefined);

    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    const body = await res.json();
    expect(body.error).toBe('service temporarily unavailable');
  });

  it('logs distinct event for backend_unavailable', async () => {
    checkRateLimitMock.mockResolvedValue({
      ok: false,
      retryAfter: 10,
      reason: 'backend_unavailable',
    });
    const wrapped = withRateLimit('strict', vi.fn());

    await wrapped(makeRequest(), undefined);

    const logged = String(warnSpy.mock.calls[0]?.[0] ?? '');
    const parsed = JSON.parse(logged);
    expect(parsed.event).toBe('rate_limit_backend_unavailable');
    expect(parsed.status).toBe(503);
  });

  it('works for dynamic route ctx shape', async () => {
    checkRateLimitMock.mockResolvedValue({ ok: true });
    type DynCtx = { params: Promise<{ id: string }> };
    const handler = vi.fn().mockResolvedValue(new Response());
    const wrapped = withRateLimit<DynCtx>('standard', handler);

    const ctx: DynCtx = { params: Promise.resolve({ id: 'abc' }) };
    await wrapped(makeRequest(), ctx);

    expect(handler).toHaveBeenCalledWith(expect.any(Request), ctx);
  });
});
