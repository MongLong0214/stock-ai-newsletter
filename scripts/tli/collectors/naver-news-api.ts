import { sleep, withRetry } from '../shared/utils'
import { z } from 'zod'

const stripHtml = (text: string): string =>
  text
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()

const NAVER_RFC_DATE = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const isStrictNaverDate = (value: string): boolean => {
  const match = NAVER_RFC_DATE.exec(value)
  if (match === null) return false
  const [weekday, dayText, monthText, yearText, hourText, minuteText, secondText,
    offsetSign, offsetHourText, offsetMinuteText] = match.slice(1)
  if ([weekday, dayText, monthText, yearText, hourText, minuteText, secondText,
    offsetSign, offsetHourText, offsetMinuteText].some((part) => part === undefined)) return false

  const month = MONTHS.indexOf(monthText ?? '')
  const day = Number(dayText)
  const year = Number(yearText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const offsetHour = Number(offsetHourText)
  const offsetMinute = Number(offsetMinuteText)
  if (year < 1_000 || month < 0 || hour > 23 || minute > 59 || second > 59
      || offsetHour > 23 || offsetMinute > 59) return false

  const localDate = new Date(Date.UTC(year, month, day))
  if (localDate.getUTCFullYear() !== year || localDate.getUTCMonth() !== month
      || localDate.getUTCDate() !== day || WEEKDAYS[localDate.getUTCDay()] !== weekday) return false

  const offsetMinutes = (offsetHour * 60 + offsetMinute) * (offsetSign === '+' ? 1 : -1)
  const expectedInstant = Date.UTC(year, month, day, hour, minute, second) - offsetMinutes * 60_000
  return Number.isFinite(expectedInstant) && Date.parse(value) === expectedInstant
}

const parseableDateSchema = z.string().refine(
  isStrictNaverDate,
  { message: '유효한 Naver RFC 날짜여야 합니다' },
)

const httpUrlSchema = z.string().url().refine(
  (value) => {
    try {
      const protocol = new URL(value).protocol
      return protocol === 'http:' || protocol === 'https:'
    } catch {
      return false
    }
  },
  { message: 'HTTP(S) URL이어야 합니다' },
)

const urlOrEmptySchema = z.union([z.literal(''), httpUrlSchema])

const naverNewsItemSchema = z.object({
  title: z.string().refine((value) => stripHtml(value).length > 0, {
    message: 'HTML 제거 후 비어 있지 않은 제목이어야 합니다',
  }),
  link: httpUrlSchema,
  originallink: urlOrEmptySchema,
  description: z.string(),
  pubDate: parseableDateSchema,
}).strict()

const naverNewsResponseSchema = z.object({
  lastBuildDate: parseableDateSchema.optional(),
  total: z.number().int().nonnegative(),
  start: z.number().int().positive().optional(),
  display: z.number().int().nonnegative().optional(),
  items: z.array(naverNewsItemSchema),
}).strict()

type NaverNewsResponse = z.infer<typeof naverNewsResponseSchema>

export interface NewsArticle {
  readonly themeId: string
  readonly title: string
  readonly link: string
  readonly source: string | null
  readonly pubDate: string
}

export interface ThemeSearchResult {
  readonly dateCounts: Map<string, number>
  readonly articles: NewsArticle[]
  readonly apiTotal: number
  readonly pages: number
}

export class NaverNewsResponseError extends Error {
  readonly reason = 'naver_news_response_invalid'

  constructor(message: string) {
    super(message)
    this.name = 'NaverNewsResponseError'
  }
}

const validationMessage = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ')

const parseNewsResponse = (payload: unknown): NaverNewsResponse => {
  const parsed = naverNewsResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new NaverNewsResponseError(`네이버 뉴스 응답 스키마 오류: ${validationMessage(parsed.error)}`)
  }
  return parsed.data
}

const getNaverCredentials = () => {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경 변수가 필요합니다')
  }
  return { clientId, clientSecret }
}

const searchNews = async (query: string, display = 100, start = 1): Promise<NaverNewsResponse> => {
  const { clientId, clientSecret } = getNaverCredentials()
  const response = await withRetry(
    async () => {
      const params = new URLSearchParams({
        query,
        display: String(display),
        start: String(start),
        sort: 'date',
      })
      const candidate = await fetch(`https://openapi.naver.com/v1/search/news.json?${params}`, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
        signal: AbortSignal.timeout(30000),
      })
      if (!candidate.ok) {
        throw new Error(`네이버 뉴스 API 오류 (${candidate.status}): ${await candidate.text()}`)
      }
      return candidate
    },
    3,
    '네이버 뉴스 검색',
  )

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error: unknown) {
    throw new NaverNewsResponseError(
      `네이버 뉴스 JSON 파싱 오류: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return parseNewsResponse(payload)
}

export const newsFailureReason = (error: unknown): string =>
  error instanceof NaverNewsResponseError
    ? error.reason
    : 'naver_news_request_failed'

const parseDate = (pubDate: string): string => new Date(pubDate).toISOString().slice(0, 10)

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const isRelevantArticle = (title: string, keywords: readonly string[]): boolean =>
  keywords.some((keyword) => {
    if (keyword.length <= 3 && /^[A-Za-z0-9]+$/.test(keyword)) {
      return new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(title)
    }
    return title.includes(keyword)
  })

const extractSource = (link: string): string | null => {
  const hostname = new URL(link).hostname
  if (hostname.includes('naver.com')) return null
  return hostname.replace(/^www\./, '')
}

export const searchThemeNews = async (input: {
  readonly themeId: string
  readonly keywords: readonly string[]
  readonly startDate: string
  readonly endDate: string
}): Promise<ThemeSearchResult> => {
  const dateCounts = new Map<string, number>()
  const articles: NewsArticle[] = []
  const orQuery = input.keywords.map((keyword) => `"${keyword}"`).join(' | ')
  const maxResults = 1000
  let start = 1
  let totalFetched = 0
  let apiTotal = 0
  let pages = 0

  while (start < maxResults) {
    const result = await searchNews(orQuery, 100, start)
    apiTotal = result.total
    pages++
    if (result.items.length === 0) break

    for (const item of result.items) {
      const date = parseDate(item.pubDate)
      if (date < input.startDate || date > input.endDate) continue
      const cleanTitle = stripHtml(item.title)
      if (!isRelevantArticle(cleanTitle, input.keywords)) continue

      dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1)
      const link = item.originallink || item.link
      articles.push({
        themeId: input.themeId,
        title: cleanTitle,
        link,
        source: extractSource(link),
        pubDate: date,
      })
    }

    totalFetched += result.items.length
    if (result.items.length < 100 || totalFetched >= apiTotal || start >= maxResults) break
    start += 100
    await sleep(100)
  }

  return { dateCounts, articles, apiTotal, pages }
}
