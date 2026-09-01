import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { config as loadDotenv } from 'dotenv'

import { verifyNewsletterSent } from '@/lib/newsletter/verify-sent'

export {
  DEFAULT_NEWSLETTER_ALERT_EMAIL,
  verifyNewsletterSent,
} from '@/lib/newsletter/verify-sent'
export type {
  NewsletterAlertEmail,
  NewsletterStatusRow,
  NewsletterWatchdogDependencies,
} from '@/lib/newsletter/verify-sent'

const isDirectRun = /verify-newsletter-sent\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const envPath = resolve(process.cwd(), '.env.local')
  if (existsSync(envPath)) loadDotenv({ path: envPath, quiet: true })

  verifyNewsletterSent()
    .then((exitCode) => {
      process.exitCode = exitCode
    })
    .catch((error) => {
      console.error('뉴스레터 발송 검증 중 예기치 않은 오류:', error)
      process.exitCode = 1
    })
}
