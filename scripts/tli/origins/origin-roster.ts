import { z } from 'zod'

import {
  keywordGroupSha256,
  type KeywordGroupSpec,
} from '@/scripts/tli/collectors/collection-run-contract'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'

const recordedInterestRequestSchema = z.object({
  keywordGroups: z.array(z.object({
    groupName: z.string().min(1),
    keywords: z.array(z.string().min(1)).min(1),
  })).min(1),
})

export const recordedKeywordGroupSpec = (
  requestPayload: unknown,
  expectedSha256: string,
): KeywordGroupSpec | null => {
  const parsed = recordedInterestRequestSchema.safeParse(requestPayload)
  if (!parsed.success) return null
  const matches = parsed.data.keywordGroups
    .map((group) => ({ group_name: group.groupName, keywords: [...group.keywords] }))
    .filter((spec) => keywordGroupSha256(spec) === expectedSha256)
  return matches.length === 1 ? matches[0] : null
}

export interface OriginRosterTheme {
  readonly runId: string
  readonly keywordGroupSpec: KeywordGroupSpec
}

export type OriginRoster = Map<string, OriginRosterTheme>

const originRosterRowSchema = z.object({
  theme_id: z.string().uuid(),
  run_id: z.string().uuid(),
  keyword_group_hash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  request_payload: z.unknown(),
  completed_at: z.string(),
})

interface OriginRosterRpcResult {
  readonly data: unknown
  readonly error: { readonly message: string } | null
}

export interface OriginRosterDeps {
  readonly loadRows?: (originDate: string) => Promise<OriginRosterRpcResult>
  readonly warn?: (message: string) => void
}

export const loadOriginRoster = async (
  input: { readonly originDate: string },
  deps: OriginRosterDeps = {},
): Promise<OriginRoster> => {
  const loadRows = deps.loadRows ?? (async (originDate) => supabaseAdmin.rpc('tli_origin_roster', {
    p_origin_date: originDate,
  }))
  const { data, error } = await loadRows(input.originDate)
  if (error) throw new Error(`origin roster 조회 실패: ${error.message}`)

  const rows = originRosterRowSchema.array().parse(data ?? [])
  // WHY: PostgREST may silently cap RPC rows at 1,000, which would shrink the universe denominator.
  if (rows.length >= 1_000) {
    throw new Error('origin roster가 PostgREST 상한(1000)에 도달했습니다 — 절단 가능성. RPC 페이지네이션 필요')
  }

  const roster: OriginRoster = new Map()
  for (const row of rows) {
    const keywordGroupSpec = row.keyword_group_hash === null
      ? null
      : recordedKeywordGroupSpec(row.request_payload, row.keyword_group_hash)
    if (keywordGroupSpec === null) {
      throw new Error(`origin roster keyword spec 복원 실패: ${row.theme_id} (${row.run_id})`)
    }
    roster.set(row.theme_id, { runId: row.run_id, keywordGroupSpec })
  }
  return roster
}
