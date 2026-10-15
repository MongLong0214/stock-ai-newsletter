import { handleTliCollectCron } from '@/lib/tli/collect-cron-dispatch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// WHY: 월요일 18:30 origin 생성을 시도하며, 취소되거나 실패해도 19:00 full backup이 origin 단계를 수행한다.
export async function GET(request: Request) {
  return handleTliCollectCron(request, {
    mode: 'news-only',
    runKeyPrefix: 'origin-1830',
    label: 'TLI Monday origin cron',
  })
}
