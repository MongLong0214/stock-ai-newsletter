import { siteConfig } from '@/lib/constants/seo/config'
import { sendNewsletterAlertEmail } from '@/lib/newsletter/alert'

type PipelineStage = 'prepare' | 'send'
type FailureEnvironment = Readonly<Record<string, string | undefined>>

interface FailureLogger {
  log(message: string): void
  error(message: string): void
}

export interface NotifyPipelineFailureDependencies {
  readonly env?: FailureEnvironment
  readonly sendAlert?: typeof sendNewsletterAlertEmail
  readonly logger?: FailureLogger
  readonly getTodayKst?: () => string
}

function readOption(args: readonly string[], name: string): string | undefined {
  const inline = args.find((argument) => argument.startsWith(`${name}=`))
  return inline?.slice(name.length + 1)
}

export function parseFailureStage(args: readonly string[]): PipelineStage {
  const stage = readOption(args, '--stage')
  if (stage !== 'prepare' && stage !== 'send') {
    throw new Error('--stage=prepare 또는 --stage=send가 필요합니다.')
  }
  return stage
}

function runUrl(env: FailureEnvironment): string {
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
    return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
  }
  return 'GitHub Actions run URL unavailable'
}

export async function notifyPipelineFailure(
  stage: PipelineStage,
  dependencies: NotifyPipelineFailureDependencies = {},
): Promise<0> {
  const env = dependencies.env ?? process.env
  const logger = dependencies.logger ?? console
  const targetDate = env.TARGET_DATE
    || (dependencies.getTodayKst ?? (() => new Date().toLocaleDateString(
      'en-CA',
      { timeZone: 'Asia/Seoul' },
    )))()
  const dispatchId = env.DISPATCH_ID || 'none'
  let delivered = false
  try {
    delivered = await (dependencies.sendAlert ?? sendNewsletterAlertEmail)({
      subject: `[${siteConfig.serviceName}] ${targetDate} newsletter ${stage} pipeline failure`,
      lines: [
        `stage: ${stage}`,
        `target_date: ${targetDate}`,
        `dispatch_id: ${dispatchId}`,
        `run: ${runUrl(env)}`,
      ],
      env,
    })
  } catch (error) {
    logger.error(`파이프라인 실패 알림 예외: ${error instanceof Error ? error.message : String(error)}`)
    return 0
  }

  if (delivered) logger.log(`파이프라인 실패 알림 전송 완료: stage=${stage}`)
  else logger.error(`파이프라인 실패 알림 전송 실패 또는 설정 누락: stage=${stage}`)
  // Alert delivery must never hide the original workflow failure.
  return 0
}

const isDirectRun = /notify-pipeline-failure\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  try {
    const stage = parseFailureStage(process.argv.slice(2))
    notifyPipelineFailure(stage).catch((error) => {
      console.error(`파이프라인 실패 알림 중 예기치 않은 오류: ${String(error)}`)
      process.exitCode = 0
    })
  } catch (error) {
    console.error(String(error))
    process.exitCode = 0
  }
}
