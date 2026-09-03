import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import {
  getTokenFromStorage,
  resetKisTokenStorageForTest,
  saveTokenToStorage,
} from '@/app/archive/_utils/api/kis/token-storage';

describe('KIS token storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetKisTokenStorageForTest();
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => ({ upsert: mocks.upsert })),
    });
  });

  it('does not initialize Supabase when its environment is absent', async () => {
    await expect(getTokenFromStorage()).resolves.toBeNull();
    await expect(saveTokenToStorage({
      access_token: 'fixture-token',
      expires_at: Date.now() + 60_000,
    })).resolves.toBeUndefined();

    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('logs an upsert error without rejecting token issuance', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    mocks.upsert.mockResolvedValue({ error: { message: 'synthetic upsert failure' } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(saveTokenToStorage({
      access_token: 'fixture-token',
      expires_at: Date.now() + 60_000,
    })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      '[KIS Token Storage] upsert failed:',
      'synthetic upsert failure',
    );
  });
});
