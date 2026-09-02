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

const WORKFLOW_FILE = 'daily-newsletter.yml'

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
    if (!newsletter) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'not_prepared',
        date,
      })
    }
    if (newsletter.sent_at) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'already_sent',
        date,
      })
    }

    const recoveryReason = newsletter.is_sent
      ? 'recover_unconfirmed_claim'
      : undefined
    const requestedDispatchId = createDispatchId(date)
    const dispatch = await dispatchGitHubWorkflow(WORKFLOW_FILE, {
      inputs: { target_date: date, dispatch_id: requestedDispatchId },
    })
    return NextResponse.json({
      success: true,
      dispatched: true,
      workflow: WORKFLOW_FILE,
      date,
      dispatchId: dispatch.dispatchId,
      verified: dispatch.verified,
      reason: recoveryReason,
    })
  } catch (error) {
    console.error('Newsletter send cron failed:', error)
    return NextResponse.json(
      { success: false, error: 'Newsletter send cron failed' },
      { status: 500 },
    )
  }
}
