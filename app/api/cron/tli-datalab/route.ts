import { handleTliCollectCron } from '@/lib/tli/collect-cron-dispatch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// WHY: 일부 complete run은 전체 수집 완료를 뜻하지 않으므로 항상 dispatch하고, 동일 일자 재사용과 workflow concurrency로 중복 요청을 막는다.
export async function GET(request: Request) {
  return handleTliCollectCron(request, {
    mode: 'datalab-only',
    runKeyPrefix: 'datalab-0900',
    label: 'TLI DataLab cron',
  })
}
