import { randomUUID } from 'node:crypto'

const GITHUB_OWNER = 'MongLong0214'
const GITHUB_REPO = 'stock-ai-newsletter'
const GITHUB_API_VERSION = '2022-11-28'
const GITHUB_USER_AGENT = 'stock-ai-newsletter-vercel-cron'
const GITHUB_REF = 'main'
const DISPATCH_BUDGET_MS = 40_000
const RUN_CLOCK_SKEW_MS = 5_000
const RUN_POLL_ATTEMPTS = 4
const RUN_POLL_INTERVAL_MS = 3_000

type WorkflowInputs = Readonly<Record<string, string | boolean>>

export interface GitHubDispatchOptions {
  readonly inputs?: WorkflowInputs
  readonly token?: string
}

export interface GitHubDispatchResult {
  readonly dispatchId: string
  readonly tokenExpiresInDays: number | null
}

interface GitHubWorkflowRun {
  readonly created_at?: unknown
  readonly head_branch?: unknown
}

export class GitHubDispatchError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string,
  ) {
    super(`GitHub workflow dispatch failed (${status})`)
    this.name = 'GitHubDispatchError'
  }
}

export function createDispatchId(date: string): string {
  return `${date}-${randomUUID().slice(0, 8)}`
}

export function readTokenExpiryDays(
  headers: Headers,
  now: Date = new Date(),
): number | null {
  const rawExpiry = headers.get('github-authentication-token-expiration')
  if (!rawExpiry) return null
  const expiresAt = new Date(rawExpiry).getTime()
  if (!Number.isFinite(expiresAt)) return null
  return Math.ceil((expiresAt - now.getTime()) / 86_400_000)
}

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': GITHUB_USER_AGENT,
    'Content-Type': 'application/json',
  }
}

async function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout)
      reject(signal.reason)
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function postDispatch(input: {
  readonly workflowFile: string
  readonly token: string
  readonly inputs: WorkflowInputs
  readonly signal: AbortSignal
}): Promise<Response> {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${input.workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: githubHeaders(input.token),
      body: JSON.stringify({ ref: GITHUB_REF, inputs: input.inputs }),
      signal: input.signal,
    },
  )
  if (response.status !== 204) {
    const responseBody = await response.text()
    console.error(
      `GitHub workflow dispatch failed: status=${response.status}, body=${responseBody}`,
    )
    throw new GitHubDispatchError(response.status, responseBody)
  }
  return response
}

function containsMatchingRun(payload: unknown, earliestCreatedAt: number): boolean {
  if (!payload || typeof payload !== 'object') return false
  const workflowRuns = (payload as { workflow_runs?: unknown }).workflow_runs
  if (!Array.isArray(workflowRuns)) return false
  return workflowRuns.some((candidate: GitHubWorkflowRun) => {
    if (candidate.head_branch !== GITHUB_REF || typeof candidate.created_at !== 'string') {
      return false
    }
    const createdAt = new Date(candidate.created_at).getTime()
    return Number.isFinite(createdAt) && createdAt >= earliestCreatedAt
  })
}

async function verifyRunCreated(input: {
  readonly workflowFile: string
  readonly token: string
  readonly dispatchStartedAt: number
  readonly signal: AbortSignal
}): Promise<boolean> {
  const runsUrl = new URL(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${input.workflowFile}/runs`,
  )
  runsUrl.searchParams.set('event', 'workflow_dispatch')
  runsUrl.searchParams.set('per_page', '5')

  for (let attempt = 1; attempt <= RUN_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(runsUrl, {
      headers: githubHeaders(input.token),
      signal: input.signal,
    })
    if (!response.ok) {
      const responseBody = await response.text()
      throw new GitHubDispatchError(response.status, responseBody)
    }
    if (containsMatchingRun(
      await response.json(),
      input.dispatchStartedAt - RUN_CLOCK_SKEW_MS,
    )) {
      return true
    }
    if (attempt < RUN_POLL_ATTEMPTS) {
      await wait(RUN_POLL_INTERVAL_MS, input.signal)
    }
  }
  return false
}

function retryInputs(inputs: WorkflowInputs): WorkflowInputs {
  const targetDate = typeof inputs.target_date === 'string'
    ? inputs.target_date
    : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  return { ...inputs, dispatch_id: createDispatchId(targetDate) }
}

export async function dispatchGitHubWorkflow(
  workflowFile: string,
  options: GitHubDispatchOptions = {},
): Promise<GitHubDispatchResult> {
  const token = options.token ?? process.env.GH_DISPATCH_TOKEN
  if (!token) throw new Error('GH_DISPATCH_TOKEN is not set')

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error('GitHub workflow dispatch verification timed out')),
    DISPATCH_BUDGET_MS,
  )
  let inputs: WorkflowInputs = options.inputs ?? {}
  let tokenExpiresInDays: number | null = null

  try {
    for (let dispatchAttempt = 1; dispatchAttempt <= 2; dispatchAttempt += 1) {
      const dispatchStartedAt = Date.now()
      const response = await postDispatch({
        workflowFile,
        token,
        inputs,
        signal: controller.signal,
      })
      tokenExpiresInDays = readTokenExpiryDays(response.headers) ?? tokenExpiresInDays
      if (await verifyRunCreated({
        workflowFile,
        token,
        dispatchStartedAt,
        signal: controller.signal,
      })) {
        const dispatchId = typeof inputs.dispatch_id === 'string'
          ? inputs.dispatch_id
          : createDispatchId(
            typeof inputs.target_date === 'string' ? inputs.target_date : 'dispatch',
          )
        return { dispatchId, tokenExpiresInDays }
      }

      // WHY: a 204 only acknowledges the request; a missing run is retried with a new correlation ID.
      inputs = retryInputs(inputs)
    }

    throw new GitHubDispatchError(0, 'Workflow run was not created after two dispatches')
  } finally {
    clearTimeout(timeout)
  }
}
