import type { JsonObject } from '../../../lib/tli/canonical-json'
import { withRetry } from '../shared/utils'
import { z } from 'zod'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const nonblankStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: '비어 있지 않은 문자열이어야 합니다',
})

const isoDateSchema = z.string().regex(ISO_DATE).refine(
  (value) => {
    const parsed = Date.parse(`${value}T00:00:00.000Z`)
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
  },
  { message: '유효한 ISO 날짜여야 합니다' },
)

const datalabPointSchema = z.object({
  period: isoDateSchema,
  ratio: z.number().finite().min(0).max(100),
}).strict()

const datalabResultSchema = z.object({
  title: nonblankStringSchema,
  keywords: z.array(nonblankStringSchema),
  data: z.array(datalabPointSchema),
}).strict()

export const naverDatalabResponseSchema = z.object({
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  timeUnit: z.enum(['date', 'week', 'month']).optional(),
  results: z.array(datalabResultSchema),
}).strict()

export interface NaverDatalabRequest {
  readonly startDate: string
  readonly endDate: string
  readonly timeUnit: 'date' | 'week' | 'month'
  readonly keywordGroups: ReadonlyArray<{
    readonly groupName: string
    readonly keywords: readonly string[]
  }>
}

export type NaverDatalabResponse = z.infer<typeof naverDatalabResponseSchema>

export class NaverDatalabResponseError extends Error {
  readonly reason = 'naver_datalab_response_invalid'

  constructor(message: string) {
    super(message)
    this.name = 'NaverDatalabResponseError'
  }
}

export class NaverDatalabQuotaError extends Error {
  readonly reason = 'naver_datalab_quota_exceeded'

  constructor(message: string) {
    super(message)
    this.name = 'NaverDatalabQuotaError'
  }
}

const validationMessage = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ')

export const parseDatalabResponse = (payload: unknown): NaverDatalabResponse => {
  const parsed = naverDatalabResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new NaverDatalabResponseError(`네이버 DataLab 응답 스키마 오류: ${validationMessage(parsed.error)}`)
  }
  return parsed.data
}

const getNaverCredentials = () => {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 누락되었습니다')
  }
  return { clientId, clientSecret }
}

export const callNaverDatalab = async (
  request: NaverDatalabRequest,
  options: { readonly reserveAttempt?: () => Promise<void> } = {},
): Promise<NaverDatalabResponse> => {
  const { clientId, clientSecret } = getNaverCredentials()
  const reserveAttempt = options.reserveAttempt ?? (async () => {
    const [{ reserveDatalabQuota }, { getKSTDateString }] = await Promise.all([
      import('./naver-datalab-quota'),
      import('../../../lib/tli/date-utils'),
    ])
    // WHY: Naver DataLab의 일일 한도는 KST 자정에 초기화된다는 운영 가정과 ledger 날짜를 맞춘다.
    await reserveDatalabQuota({ kstDate: getKSTDateString(), count: 1 })
  })
  const response = await withRetry(
    async () => {
      await reserveAttempt()
      const candidate = await fetch('https://openapi.naver.com/v1/datalab/search', {
        method: 'POST',
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30000),
      })
      if (!candidate.ok) {
        const body = await candidate.text()
        if (candidate.status === 429 || body.includes('Query limit exceeded')) {
          throw new NaverDatalabQuotaError(`네이버 API quota 초과 (${candidate.status}): ${body}`)
        }
        throw new Error(`네이버 API 오류 (${candidate.status}): ${body}`)
      }
      return candidate
    },
    3,
    '네이버 DataLab API 호출',
    { shouldRetry: (error) => !(error instanceof NaverDatalabQuotaError) },
  )

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error: unknown) {
    throw new NaverDatalabResponseError(
      `네이버 DataLab JSON 파싱 오류: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return parseDatalabResponse(payload)
}

export const datalabFailureReason = (error: unknown): string =>
  error instanceof NaverDatalabQuotaError || error instanceof NaverDatalabResponseError
    ? error.reason
    : 'naver_datalab_request_failed'

export const toDatalabRequestPayload = (request: NaverDatalabRequest): JsonObject => ({
  startDate: request.startDate,
  endDate: request.endDate,
  timeUnit: request.timeUnit,
  keywordGroups: request.keywordGroups.map((group) => ({
    groupName: group.groupName,
    keywords: [...group.keywords],
  })),
})

export const toDatalabResponsePayload = (response: NaverDatalabResponse): JsonObject => ({
  results: response.results.map((result) => ({
    title: result.title,
    keywords: [...result.keywords],
    data: result.data.map((point) => ({ period: point.period, ratio: point.ratio })),
  })),
})
