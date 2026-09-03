import { NextResponse } from 'next/server'

import { verifyCronBearerToken } from '@/lib/cron-auth'
import { dispatchGitHubWorkflow } from '@/lib/github-actions-dispatch'
import { getKSTDateString } from '@/lib/tli/date-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const WORKFLOW_FILE = 'tli-collect-data.yml'

// WHY: 일부 complete run은 전체 수집 완료를 뜻하지 않으므로 항상 dispatch하고, 동일 일자 재사용과 workflow concurrency로 중복 요청을 막는다.
export async function GET(request: Request) {
  if (!verifyCronBearerToken(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = getKSTDateString()

  try {
    const inputs = {
      mode: 'datalab-only',
      datalab_refresh: 'reuse',
      intended_kst_date: date,
      run_key: `datalab-0900:${date}`,
    }
    const dispatch = await dispatchGitHubWorkflow(WORKFLOW_FILE, { inputs })
    return NextResponse.json({
      success: true,
      dispatched: true,
      workflow: WORKFLOW_FILE,
      date,
      dispatchId: dispatch.dispatchId,
      verified: dispatch.verified,
    })
  } catch (error) {
    console.error('TLI DataLab cron failed:', error)
    return NextResponse.json(
      { success: false, error: 'TLI DataLab cron failed' },
      { status: 500 },
    )
  }
}
