import { handleTliCollectCron } from '@/lib/tli/collect-cron-dispatch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// WHY: 09:00 뉴스 수집을 Vercel로 이전해 GitHub schedule의 7~9시간 지연이 16:30 full dispatch를 concurrency에서 대체하거나 지연시키지 않게 한다.
// WHY: 정시를 벗어난 news-only dispatch는 대기 중인 full을 concurrency 큐에서 대체할 수 있어 건너뛰며, full backup이 같은 일을 수행한다.
export async function GET(request: Request) {
  return handleTliCollectCron(request, {
    mode: 'news-only',
    runKeyPrefix: 'news-0900',
    label: 'TLI news cron',
    window: { fromKstMinutes: 540, toKstMinutes: 600 },
  })
}
