import { NextResponse } from 'next/server'

import { siteConfig } from '@/lib/constants/seo/config'
import { verifyCronBearerToken } from '@/lib/cron-auth'
import { sendNewsletterAlertEmail } from '@/lib/newsletter/alert'
import { getNewsletterStatus } from '@/lib/newsletter/status'
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
    const newsletter = await getNewsletterStatus(date)
    if (!newsletter) {
      await sendNewsletterAlertEmail({
        subject: `[${siteConfig.serviceName}] ${date} 콘텐츠 미준비 (07:05)`,
        lines: [
          `대상 날짜: ${date}`,
          '06:10 primary와 06:50 backup prepare 상태를 확인하세요.',
        ],
      })
      return NextResponse.json(
        { success: false, reason: 'content_not_prepared', date },
        { status: 500 },
      )
    }

    if (newsletter.picks_source === 'crash') {
      console.log(JSON.stringify({ event: 'crash_alert_content', date }))
    } else if (newsletter.picks_source === 'llm_fallback' || newsletter.picks_source === null) {
      await sendNewsletterAlertEmail({
        subject: `[${siteConfig.serviceName}] ${date} LLM fallback 콘텐츠로 발송 예정`,
        lines: [
          `대상 날짜: ${date}`,
          `picks_source: ${newsletter.picks_source ?? 'null'}`,
          '07:27 발송 전에 prepare 결과를 확인하세요.',
        ],
      })
    }

    return NextResponse.json({
      success: true,
      date,
      picksSource: newsletter.picks_source,
    })
  } catch (error) {
    console.error('Newsletter prepared watchdog cron failed:', error)
    return NextResponse.json(
      { success: false, error: 'Newsletter prepared watchdog cron failed' },
      { status: 500 },
    )
  }
}
