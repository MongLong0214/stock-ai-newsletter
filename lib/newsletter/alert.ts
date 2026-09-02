import sgMail from '@sendgrid/mail'

export const DEFAULT_NEWSLETTER_ALERT_EMAIL = 'wonil@mdbtech.co.kr'

type NewsletterAlertEnvironment = Readonly<Record<string, string | undefined>>

export async function sendNewsletterAlertEmail(input: {
  readonly subject: string
  readonly lines: readonly string[]
  readonly env?: NewsletterAlertEnvironment
}): Promise<boolean> {
  const env = input.env ?? process.env
  const apiKey = env.SENDGRID_API_KEY
  const from = env.SENDGRID_FROM_EMAIL
  const to = env.NEWSLETTER_ALERT_EMAIL || DEFAULT_NEWSLETTER_ALERT_EMAIL
  if (!apiKey || !from) {
    console.log('SENDGRID 환경변수 없음 — 알림 메일을 시도하지 않습니다.')
    return false
  }

  try {
    sgMail.setApiKey(apiKey)
    await sgMail.send({
      to,
      from,
      subject: input.subject,
      text: input.lines.join('\n'),
    })
    return true
  } catch (error) {
    console.error(`알림 메일 전송 실패: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}
