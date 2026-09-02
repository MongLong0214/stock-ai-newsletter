import { NextResponse } from 'next/server'

import { verifyCronBearerToken } from '@/lib/cron-auth'
import { dispatchGitHubWorkflow } from '@/lib/github-actions-dispatch'
import { getKSTDateString } from '@/lib/tli/date-utils'
import { hasCompleteDatalabCollection } from '@/lib/tli/datalab-collection-status'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const WORKFLOW_FILE = 'tli-collect-data.yml'

export async function GET(request: Request) {
  if (!verifyCronBearerToken(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = getKSTDateString()

  try {
    if (await hasCompleteDatalabCollection(date)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'datalab_already_collected',
        date,
      })
    }

    const inputs = {
      mode: 'datalab-only',
      datalab_refresh: 'reuse',
      intended_kst_date: date,
      run_key: `datalab-0900:${date}`,
    }
    await dispatchGitHubWorkflow(WORKFLOW_FILE, undefined, inputs)
    return NextResponse.json({
      success: true,
      dispatched: true,
      workflow: WORKFLOW_FILE,
      date,
    })
  } catch (error) {
    console.error('TLI DataLab cron failed:', error)
    return NextResponse.json(
      { success: false, error: 'TLI DataLab cron failed' },
      { status: 500 },
    )
  }
}
