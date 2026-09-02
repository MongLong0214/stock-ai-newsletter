import { describe, expect, it, vi } from 'vitest'

import {
  notifyPipelineFailure,
  parseFailureStage,
} from './notify-pipeline-failure'

describe('notifyPipelineFailure', () => {
  it('sends stage, target date, dispatch ID, and exact Actions run URL', async () => {
    const sendAlert = vi.fn(async () => true)
    const logger = { log: vi.fn(), error: vi.fn() }

    await expect(notifyPipelineFailure('prepare', {
      env: {
        TARGET_DATE: '2026-09-02',
        DISPATCH_ID: 'dispatch-fixture',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'MongLong0214/stock-ai-newsletter',
        GITHUB_RUN_ID: '12345',
      },
      sendAlert,
      logger,
    })).resolves.toBe(0)

    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('2026-09-02 newsletter prepare pipeline failure'),
      lines: expect.arrayContaining([
        'stage: prepare',
        'dispatch_id: dispatch-fixture',
        'run: https://github.com/MongLong0214/stock-ai-newsletter/actions/runs/12345',
      ]),
    }))
  })

  it('still exits zero when alert delivery fails', async () => {
    const logger = { log: vi.fn(), error: vi.fn() }

    await expect(notifyPipelineFailure('send', {
      env: {},
      sendAlert: vi.fn(async () => {
        throw new Error('synthetic delivery failure')
      }),
      logger,
      getTodayKst: () => '2026-09-02',
    })).resolves.toBe(0)
    expect(logger.error).toHaveBeenCalledOnce()
  })
})

describe('parseFailureStage', () => {
  it('rejects an unsupported stage', () => {
    expect(() => parseFailureStage(['--stage=publish'])).toThrow(/prepare.*send/)
  })
})
