import { handleTliCollectCron } from '@/lib/tli/collect-cron-dispatch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// WHY: 09:00 뉴스 수집을 Vercel로 이전해 GitHub schedule의 7~9시간 지연이 16:30 full dispatch를 concurrency에서 대체하거나 지연시키지 않게 한다.
export async function GET(request: Request) {
  return handleTliCollectCron(request, {
    mode: 'news-only',
    runKeyPrefix: 'news-0900',
    label: 'TLI news cron',
  })
}
