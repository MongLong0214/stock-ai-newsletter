import { NextResponse } from 'next/server'

import { verifyCronBearerToken } from '@/lib/cron-auth'
import {
  createDispatchId,
  dispatchGitHubWorkflow,
} from '@/lib/github-actions-dispatch'
import { getNewsletterStatus } from '@/lib/newsletter/status'
import { isKoreanTradingDate } from '@/lib/tli/trading-calendar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const WORKFLOW_FILE = 'prepare-newsletter.yml'

export async function GET(request: Request) {
  if (!verifyCronBearerToken(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  if (!isKoreanTradingDate(date)) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'non_trading_day',
      date,
    })
  }

  try {
    const newsletter = await getNewsletterStatus(date)
    if (newsletter?.is_sent) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'already_sent',
        date,
      })
    }
    if (newsletter?.picks_source === 'code') {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'code_picks_exist',
        date,
      })
    }

    const requestedDispatchId = createDispatchId(date)
    // WHY: primary dispatch may be dropped, fail, or leave fallback content; backup mode preserves code picks.
    const dispatch = await dispatchGitHubWorkflow(WORKFLOW_FILE, {
      inputs: {
        target_date: date,
        dispatch_id: requestedDispatchId,
        backup_run: true,
      },
    })
    return NextResponse.json({
      success: true,
      dispatched: true,
      backup: true,
      workflow: WORKFLOW_FILE,
      date,
      dispatchId: dispatch.dispatchId,
      verified: dispatch.verified,
    })
  } catch (error) {
    console.error('Newsletter prepare backup cron failed:', error)
    return NextResponse.json(
      { success: false, error: 'Newsletter prepare backup cron failed' },
      { status: 500 },
    )
  }
}
