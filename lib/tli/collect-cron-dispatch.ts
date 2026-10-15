import { NextResponse } from 'next/server'

import { verifyCronBearerToken } from '@/lib/cron-auth'
import { dispatchGitHubWorkflow } from '@/lib/github-actions-dispatch'
import { getKSTDateString } from '@/lib/tli/date-utils'

const WORKFLOW_FILE = 'tli-collect-data.yml'

export const handleTliCollectCron = async (
  request: Request,
  input: {
    readonly mode: 'full' | 'news-only' | 'datalab-only'
    readonly runKeyPrefix: string
    readonly label: string
  },
): Promise<NextResponse> => {
  if (!verifyCronBearerToken(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = getKSTDateString()

  try {
    const inputs = {
      mode: input.mode,
      datalab_refresh: 'reuse',
      intended_kst_date: date,
      run_key: `${input.runKeyPrefix}:${date}`,
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
    console.error(`${input.label} failed:`, error)
    return NextResponse.json(
      { success: false, error: `${input.label} failed` },
      { status: 500 },
    )
  }
}
