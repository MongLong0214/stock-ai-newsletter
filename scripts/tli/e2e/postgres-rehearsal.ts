import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import {
  buildInterestCollectionRun,
  buildNewsCollectionRun,
} from '../collectors/collection-run-contract'
import { buildCollectionRunAppendRequest } from '../collectors/collection-run-store'
import { todo12LifecycleReceiptSchema } from './todo12-lifecycle-receipt'

const CONTAINER_NAME = process.argv[2] ?? 'tli-e2e-dryrun'
const NEWS_THEME_ID = '15000000-0000-4000-8000-000000000001'
const DATALAB_THEME_ID = '15000000-0000-4000-8000-000000000002'
const FIXTURE_DATE = '2026-07-10'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const sqlLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`

const psql = (sql: string): string => {
  const result = spawnSync(
    'docker',
    ['exec', '-i', CONTAINER_NAME, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
    { encoding: 'utf8', input: sql },
  )
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`psql exit ${result.status ?? 'signal'}: ${result.stderr.trim()}`)
  }
  return result.stdout.trim()
}

const append = (canonicalJson: string, payloadSha256: string): string => {
  const runId = psql(
    `SELECT public.append_tli_collection_run(${sqlLiteral(canonicalJson)}, ${sqlLiteral(payloadSha256)})::TEXT;`,
  )
  if (!UUID_PATTERN.test(runId)) throw new Error(`append RPC returned a non-UUID value: ${runId}`)
  return runId
}

const assertComplete = (runId: string, source: string, table: string): void => {
  const actual = psql(`
SELECT concat_ws('|', source, status, expected_row_count, observed_row_count,
  (SELECT count(*) FROM public.${table} WHERE collection_run_id = runs.id))
FROM public.tli_collection_runs AS runs
WHERE id = ${sqlLiteral(runId)}::UUID;
`)
  const expected = `${source}|complete|1|1|1`
  if (actual !== expected) throw new Error(`collection run read-back mismatch: expected ${expected}, received ${actual}`)
}

const timestamps = {
  requestedAt: '2026-07-10T00:00:00.000Z',
  collectedAt: '2026-07-10T00:00:01.000Z',
  completedAt: '2026-07-10T00:00:02.000Z',
}

psql(`
INSERT INTO public.themes (id, name)
VALUES
  (${sqlLiteral(NEWS_THEME_ID)}::UUID, 'todo-15-news-fixture'),
  (${sqlLiteral(DATALAB_THEME_ID)}::UUID, 'todo-15-datalab-fixture')
ON CONFLICT (id) DO NOTHING;
`)

const news = buildNewsCollectionRun({
  contractVersion: 'tli-news-v1',
  themeId: NEWS_THEME_ID,
  requestWindowStart: FIXTURE_DATE,
  requestWindowEnd: FIXTURE_DATE,
  requestPayload: { query: 'todo-15', source: 'naver_news' },
  responsePayload: { items: [], total: 0 },
  keywordGroupSha256: 'a'.repeat(64),
  articleCountByDate: new Map(),
  timestamps,
})
if (news.observations.length !== 1 || news.observations[0]?.article_count !== 0) {
  throw new Error('news builder did not preserve the explicit-zero observation')
}
const newsRequest = buildCollectionRunAppendRequest(news)
const firstNewsRunId = append(newsRequest.canonicalJson, newsRequest.payloadSha256)
const secondNewsRunId = append(newsRequest.canonicalJson, newsRequest.payloadSha256)
if (firstNewsRunId === secondNewsRunId) throw new Error('identical collection payload did not create a separate immutable run')
assertComplete(firstNewsRunId, 'naver_news', 'tli_news_observations')
assertComplete(secondNewsRunId, 'naver_news', 'tli_news_observations')

const datalab = buildInterestCollectionRun({
  contractVersion: 'tli-interest-v1',
  requestWindowStart: FIXTURE_DATE,
  requestWindowEnd: FIXTURE_DATE,
  requestPayload: { source: 'naver_datalab', themes: [DATALAB_THEME_ID] },
  responsePayload: { results: [{ period: FIXTURE_DATE, ratio: 0 }] },
  keywordGroupHash: 'b'.repeat(64),
  requestedThemes: [{ themeId: DATALAB_THEME_ID, groupName: 'todo-15' }],
  observations: [{
    theme_id: DATALAB_THEME_ID,
    trading_date: FIXTURE_DATE,
    source: 'naver_datalab',
    raw_value: 0,
    normalized: 0,
    anchor_scaled_value: null,
    keyword_epoch: 1,
  }],
  respondedThemeIds: [DATALAB_THEME_ID],
  timestamps,
})
const datalabRequest = buildCollectionRunAppendRequest(datalab)
const datalabRunId = append(datalabRequest.canonicalJson, datalabRequest.payloadSha256)
assertComplete(datalabRunId, 'naver_datalab', 'tli_interest_observations')

const lifecycleOutput = psql(readFileSync(
  'scripts/tli/e2e/sql/todo12-lifecycle-rehearsal.sql',
  'utf8',
))
const lifecycleLine = lifecycleOutput.split('\n').at(-1)
if (lifecycleLine === undefined) throw new TypeError('Todo 12 lifecycle rehearsal returned no receipt')
let lifecycleValue: unknown
try {
  lifecycleValue = JSON.parse(lifecycleLine) as unknown
} catch {
  throw new TypeError(`Todo 12 lifecycle rehearsal returned invalid JSON: ${lifecycleLine}`)
}
const lifecycle = todo12LifecycleReceiptSchema.parse(lifecycleValue)

process.stdout.write(`${JSON.stringify({
  status: 'pass',
  sources: ['naver_news', 'naver_datalab'],
  identicalPayloadContract: 'separate_immutable_runs',
  runCount: 3,
  lifecycle,
})}\n`)
