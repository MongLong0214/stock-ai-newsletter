import { afterEach, describe, expect, it, vi } from 'vitest'

describe('KIS token storage credentials', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('fails closed when only the public anon key is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-anon-key')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const { getTokenFromStorage, KisTokenStorageError } = await import('../token-storage')

    await expect(getTokenFromStorage()).rejects.toBeInstanceOf(KisTokenStorageError)
    await expect(getTokenFromStorage()).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('invalidateTokenInStorage fails closed without service role key', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const { invalidateTokenInStorage, KisTokenStorageError } = await import('../token-storage')

    await expect(invalidateTokenInStorage('rejected-token')).rejects.toBeInstanceOf(KisTokenStorageError)
    await expect(invalidateTokenInStorage('rejected-token')).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('invalidates only the exact rejected stored token and propagates errors', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'valid-service-key')

    const accessTokenEq = vi.fn().mockResolvedValue({ error: { message: 'delete denied' } })
    const idEq = vi.fn().mockReturnValue({ eq: accessTokenEq })
    const mockDelete = vi.fn().mockReturnValue({ eq: idEq })
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        from: () => ({ delete: mockDelete }),
      }),
    }))

    const { invalidateTokenInStorage, KisTokenStorageError } = await import('../token-storage')
    await expect(invalidateTokenInStorage('rejected-token')).rejects.toBeInstanceOf(KisTokenStorageError)
    await expect(invalidateTokenInStorage('rejected-token')).rejects.toThrow(/invalidate/)
    expect(idEq).toHaveBeenCalledWith('id', 'kis_access_token')
    expect(accessTokenEq).toHaveBeenCalledWith('access_token', 'rejected-token')
  })
})
