import { handleTliCollectCron } from '@/lib/tli/collect-cron-dispatch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// WHY: 월요일 18:30 origin 생성을 시도하며, 취소되거나 실패해도 19:00 full backup이 origin 단계를 수행한다.
// WHY: 정시를 벗어난 news-only dispatch는 대기 중인 full을 concurrency 큐에서 대체할 수 있어 건너뛰며, full backup이 같은 일을 수행한다.
export async function GET(request: Request) {
  return handleTliCollectCron(request, {
    mode: 'news-only',
    runKeyPrefix: 'origin-1830',
    label: 'TLI Monday origin cron',
    window: { fromKstMinutes: 1110, toKstMinutes: 1140 },
  })
}
