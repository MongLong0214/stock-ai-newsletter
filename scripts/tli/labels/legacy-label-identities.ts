import { batchQuery } from '../shared/supabase-batch'

type LegacyLabelType = 'gt_a' | 'gt_b'
type LegacyLabelStatus = 'pending' | 'final' | 'censored' | 'excluded'

export interface LegacyLabelIdentityRow {
  readonly id: string
  readonly theme_id: string
  readonly keyword_epoch?: number
  readonly label_status: LegacyLabelStatus
}

export async function loadLegacyLabelIdentities(input: {
  readonly themeIds: readonly string[]
  readonly baseDate: string
  readonly labelType: LegacyLabelType
  readonly labelerVersion: string
  readonly horizonDays: number
  readonly includeKeywordEpoch?: boolean
  readonly pendingOnly: boolean
}): Promise<Map<string, LegacyLabelIdentityRow>> {
  const rows = await batchQuery<Omit<LegacyLabelIdentityRow, 'label_status'> & {
    readonly label_status?: LegacyLabelStatus
  }>(
    'theme_labels',
    input.includeKeywordEpoch
      ? 'id, theme_id, keyword_epoch, label_status'
      : 'id, theme_id, label_status',
    [...input.themeIds],
    (query) => {
      const scoped = query
        .eq('base_date', input.baseDate)
        .eq('label_type', input.labelType)
        .eq('labeler_version', input.labelerVersion)
        .eq('horizon_days', input.horizonDays)
      return input.pendingOnly ? scoped.eq('label_status', 'pending') : scoped
    },
    'theme_id',
    { failOnError: true },
  )

  return new Map(rows.map((row) => {
    const labelStatus = input.pendingOnly ? 'pending' : row.label_status
    if (labelStatus === undefined) {
      throw new Error(`${input.labelType} 라벨 identity 조회 결과에 label_status가 없습니다`)
    }
    return [row.theme_id, { ...row, label_status: labelStatus }]
  }))
}
