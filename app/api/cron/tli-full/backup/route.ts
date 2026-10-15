import { handleTliCollectCron } from '@/lib/tli/collect-cron-dispatch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  return handleTliCollectCron(request, {
    mode: 'full',
    runKeyPrefix: 'full-1900',
    label: 'TLI full backup cron',
  })
}
