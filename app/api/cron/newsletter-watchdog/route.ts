import { NextResponse } from 'next/server'

import { verifyCronBearerToken } from '@/lib/cron-auth'
import { verifyNewsletterSent } from '@/lib/newsletter/verify-sent'
import { isKoreanTradingDate } from '@/lib/tli/trading-calendar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    const exitCode = await verifyNewsletterSent({
      getTodayKst: () => date,
      isTradingDay: () => true,
    })

    if (exitCode === 1) {
      return NextResponse.json(
        { success: false, reason: 'newsletter_not_sent', date },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, date })
  } catch (error) {
    console.error('Newsletter watchdog cron failed:', error)
    return NextResponse.json(
      { success: false, error: 'Newsletter watchdog cron failed' },
      { status: 500 },
    )
  }
}
