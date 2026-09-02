const GITHUB_OWNER = 'MongLong0214'
const GITHUB_REPO = 'stock-ai-newsletter'
const GITHUB_API_VERSION = '2022-11-28'
const GITHUB_USER_AGENT = 'stock-ai-newsletter-vercel-cron'
const DISPATCH_TIMEOUT_MS = 10_000

export class GitHubDispatchError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string,
  ) {
    super(`GitHub workflow dispatch failed (${status})`)
    this.name = 'GitHubDispatchError'
  }
}

export async function dispatchGitHubWorkflow(
  workflowFile: string,
  token: string | undefined = process.env.GH_DISPATCH_TOKEN,
  inputs?: Record<string, string>,
): Promise<void> {
  if (!token) {
    throw new Error('GH_DISPATCH_TOKEN is not set')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS)

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflowFile}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
          'User-Agent': GITHUB_USER_AGENT,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inputs === undefined ? { ref: 'main' } : { ref: 'main', inputs }),
        signal: controller.signal,
      },
    )

    if (response.status !== 204) {
      const responseBody = await response.text()
      console.error(
        `GitHub workflow dispatch failed: status=${response.status}, body=${responseBody}`,
      )
      throw new GitHubDispatchError(response.status, responseBody)
    }
  } finally {
    clearTimeout(timeout)
  }
}
