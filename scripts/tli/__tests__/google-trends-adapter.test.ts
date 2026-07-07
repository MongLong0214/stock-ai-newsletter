import { describe, expect, it } from 'vitest'
import {
  createGoogleTrendsAdapter,
  getGoogleTrendsAuthConfig,
} from '../collectors/google-trends'

describe('Google Trends adapter skeleton', () => {
  it('returns disabled auth config when credentials are absent', () => {
    const config = getGoogleTrendsAuthConfig({})

    expect(config).toEqual({
      kind: 'disabled',
      reason: 'missing_credentials',
    })
  })

  it('parses service account credentials and normalizes escaped private key newlines', () => {
    const config = getGoogleTrendsAuthConfig({
      GOOGLE_TRENDS_SERVICE_ACCOUNT_EMAIL: 'trend-reader@example.iam.gserviceaccount.com',
      GOOGLE_TRENDS_PRIVATE_KEY: '-----BEGIN KEY-----\\nabc\\n-----END KEY-----',
    })

    expect(config).toEqual({
      kind: 'service_account',
      clientEmail: 'trend-reader@example.iam.gserviceaccount.com',
      privateKey: '-----BEGIN KEY-----\nabc\n-----END KEY-----',
    })
  })

  it('parses OAuth refresh-token credentials when service account credentials are absent', () => {
    const config = getGoogleTrendsAuthConfig({
      GOOGLE_TRENDS_CLIENT_ID: 'client-id',
      GOOGLE_TRENDS_CLIENT_SECRET: 'client-secret',
      GOOGLE_TRENDS_REFRESH_TOKEN: 'refresh-token',
    })

    expect(config).toEqual({
      kind: 'oauth_refresh_token',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
    })
  })

  it('exposes a non-collecting adapter contract until a real source is approved', async () => {
    const adapter = createGoogleTrendsAdapter({
      kind: 'disabled',
      reason: 'missing_credentials',
    })

    const result = await adapter.collectDailySeries({
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      keywordGroups: [
        {
          groupName: '계산기',
          keywords: ['계산기'],
        },
      ],
    })

    expect(result).toEqual({
      kind: 'not_implemented',
      provider: 'google_trends',
      authKind: 'disabled',
      requestedGroups: 1,
      dateRange: {
        startDate: '2026-07-01',
        endDate: '2026-07-05',
      },
    })
  })
})
