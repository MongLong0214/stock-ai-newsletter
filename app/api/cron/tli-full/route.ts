import { handleTliCollectCron } from '@/lib/tli/collect-cron-dispatch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// WHY: 휴장일에도 dispatch하며 중복은 재사용과 workflow concurrency가 막는다. 19:00 backup은 월요일 18:00 cutoff 뒤 origin 생성도 맡는다.
export async function GET(request: Request) {
  return handleTliCollectCron(request, {
    mode: 'full',
    runKeyPrefix: 'full-1630',
    label: 'TLI full cron',
  })
}
