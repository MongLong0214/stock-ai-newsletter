import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  getTokenFromStorage: vi.fn(),
  saveTokenToStorage: vi.fn(),
}));

vi.mock('@/app/archive/_utils/api/kis/token-storage', () => storageMocks);

import {
  ensureKisAccessToken,
  getKisAccessToken,
  resetKisClientCacheForTest,
} from '@/app/archive/_utils/api/kis/client';

const NOW = new Date('2026-09-02T00:00:00.000Z');

const jsonResponse = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } },
);

describe('KIS token provider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv('KIS_BASE_URL', 'https://example.com');
    vi.stubEnv('KIS_APP_KEY', 'testkey');
    vi.stubEnv('KIS_APP_SECRET', 'dGVzdA==');
    storageMocks.getTokenFromStorage.mockResolvedValue(null);
    storageMocks.saveTokenToStorage.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    resetKisClientCacheForTest();
  });

  it('shares one token issuance across 20 concurrent callers', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ access_token: 'shared-token' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(Promise.all(Array.from({ length: 20 }, () => getKisAccessToken())))
      .resolves.toEqual(Array.from({ length: 20 }, () => 'shared-token'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storageMocks.saveTokenToStorage).toHaveBeenCalledTimes(1);
  });

  it('waits at least 61 seconds and retries once after EGW00133', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error_code: 'EGW00133', msg1: '1분당 1회' }, 403))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'retry-token' }));
    vi.stubGlobal('fetch', fetchMock);

    const tokenPromise = getKisAccessToken();
    await vi.advanceTimersByTimeAsync(60_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(tokenPromise).resolves.toBe('retry-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('also cools down for EGW00133 returned with an HTTP 200 response', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error_code: 'EGW00133', msg1: '1분당 1회' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'retry-token' }));
    vi.stubGlobal('fetch', fetchMock);

    const tokenPromise = getKisAccessToken();
    await vi.advanceTimersByTimeAsync(61_000);

    await expect(tokenPromise).resolves.toBe('retry-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a stored token expiring in three minutes as expired', async () => {
    storageMocks.getTokenFromStorage.mockResolvedValue({
      access_token: 'near-expiry-token',
      expires_at: NOW.getTime() + 3 * 60_000,
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ access_token: 'fresh-token' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getKisAccessToken()).resolves.toBe('fresh-token');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('parses the KST expiry and subtracts ten minutes before persisting', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      access_token: 'dated-token',
      access_token_token_expired: '2026-09-02 12:00:00',
    })));

    await getKisAccessToken();

    expect(storageMocks.saveTokenToStorage).toHaveBeenCalledWith({
      access_token: 'dated-token',
      expires_at: new Date('2026-09-02T02:50:00.000Z').getTime(),
    });
  });

  it('does not fail token resolution when the storage upsert reports an error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    storageMocks.saveTokenToStorage.mockImplementation(async () => {
      console.error('[KIS Token Storage] upsert failed:', 'synthetic upsert failure');
    });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ access_token: 'best-effort-token' })));

    await expect(getKisAccessToken()).resolves.toBe('best-effort-token');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[KIS Token Storage] upsert failed:',
      'synthetic upsert failure',
    );
  });

  it('forces issuance when ensure requires 90 minutes and storage has only 60 minutes', async () => {
    storageMocks.getTokenFromStorage.mockResolvedValue({
      access_token: 'one-hour-token',
      expires_at: NOW.getTime() + 60 * 60_000,
    });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ access_token: 'warm-token' })));

    await expect(ensureKisAccessToken({ minRemainingMs: 90 * 60_000 })).resolves.toMatchObject({
      source: 'issued',
    });
    expect(storageMocks.saveTokenToStorage).toHaveBeenCalledWith(expect.objectContaining({
      access_token: 'warm-token',
    }));
  });

  it('throws non-cooldown failures without retrying', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ msg1: 'server failure' }, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getKisAccessToken()).rejects.toThrow('server failure');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
