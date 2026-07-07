export type GoogleTrendsAuthConfig =
  | {
      readonly kind: 'disabled'
      readonly reason: 'missing_credentials'
    }
  | {
      readonly kind: 'service_account'
      readonly clientEmail: string
      readonly privateKey: string
    }
  | {
      readonly kind: 'oauth_refresh_token'
      readonly clientId: string
      readonly clientSecret: string
      readonly refreshToken: string
    }

export type GoogleTrendsKeywordGroup = {
  readonly groupName: string
  readonly keywords: readonly string[]
}

export type GoogleTrendsSeriesRequest = {
  readonly startDate: string
  readonly endDate: string
  readonly keywordGroups: readonly GoogleTrendsKeywordGroup[]
}

export type GoogleTrendsSeriesResult = {
  readonly kind: 'not_implemented'
  readonly provider: 'google_trends'
  readonly authKind: GoogleTrendsAuthConfig['kind']
  readonly requestedGroups: number
  readonly dateRange: {
    readonly startDate: string
    readonly endDate: string
  }
}

export type GoogleTrendsAdapter = {
  readonly provider: 'google_trends'
  readonly auth: GoogleTrendsAuthConfig
  readonly collectDailySeries: (request: GoogleTrendsSeriesRequest) => Promise<GoogleTrendsSeriesResult>
}

type GoogleTrendsAuthEnv = Readonly<Record<string, string | undefined>>

export function getGoogleTrendsAuthConfig(env: GoogleTrendsAuthEnv = process.env): GoogleTrendsAuthConfig {
  const clientEmail = env.GOOGLE_TRENDS_SERVICE_ACCOUNT_EMAIL
  const privateKey = env.GOOGLE_TRENDS_PRIVATE_KEY
  if (clientEmail && privateKey) {
    return {
      kind: 'service_account',
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }
  }

  const clientId = env.GOOGLE_TRENDS_CLIENT_ID
  const clientSecret = env.GOOGLE_TRENDS_CLIENT_SECRET
  const refreshToken = env.GOOGLE_TRENDS_REFRESH_TOKEN
  if (clientId && clientSecret && refreshToken) {
    return {
      kind: 'oauth_refresh_token',
      clientId,
      clientSecret,
      refreshToken,
    }
  }

  return {
    kind: 'disabled',
    reason: 'missing_credentials',
  }
}

export function createGoogleTrendsAdapter(
  auth: GoogleTrendsAuthConfig = getGoogleTrendsAuthConfig(),
): GoogleTrendsAdapter {
  return {
    provider: 'google_trends',
    auth,
    collectDailySeries: (request) =>
      Promise.resolve({
        kind: 'not_implemented',
        provider: 'google_trends',
        authKind: auth.kind,
        requestedGroups: request.keywordGroups.length,
        dateRange: {
          startDate: request.startDate,
          endDate: request.endDate,
        },
      }),
  }
}
