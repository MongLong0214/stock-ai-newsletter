import { fetchAllRows } from '@/lib/supabase/paginate'
import type {
  RankedStockFeature,
  StockPicksFunnel,
} from '@/scripts/stock-picks/generate-picks'
import { supabaseAdmin } from '@/scripts/tli/shared/supabase-admin'

export interface StockPickSnapshot {
  readonly signal_date: string
  readonly strategy: string
  readonly strategy_version: string
  readonly parameters_hash: string
  readonly generated_at: string
  readonly git_sha: string | null
  readonly run_id: string | null
  readonly funnel: StockPicksFunnel
  readonly picks: readonly RankedStockFeature[]
  readonly top_candidates: readonly RankedStockFeature[]
}

const databaseError = (error: unknown): Error => {
  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(`Database error: ${String(error.message)}`)
  }
  return new Error(`Database error: ${String(error)}`)
}

export async function persistStockPickSnapshot(snapshot: StockPickSnapshot): Promise<void> {
  if (snapshot.picks.length !== 3) {
    throw new Error(`stock pick snapshot은 정확히 3개 픽이 필요합니다: ${snapshot.picks.length}`)
  }
  const { error } = await supabaseAdmin
    .from('stock_pick_snapshots')
    .upsert({
      ...snapshot,
      picks: [...snapshot.picks],
      top_candidates: [...snapshot.top_candidates],
    }, { onConflict: 'signal_date,strategy' })
  if (error) throw databaseError(error)
}

export async function loadStockPickSnapshots(input: {
  readonly from: string
  readonly to: string
}): Promise<StockPickSnapshot[]> {
  return fetchAllRows<StockPickSnapshot>((fromRow, toRow) => supabaseAdmin
    .from('stock_pick_snapshots')
    .select([
      'signal_date',
      'strategy',
      'strategy_version',
      'parameters_hash',
      'generated_at',
      'git_sha',
      'run_id',
      'funnel',
      'picks',
      'top_candidates',
    ].join(', '))
    .gte('signal_date', input.from)
    .lte('signal_date', input.to)
    .order('signal_date', { ascending: true })
    .returns<StockPickSnapshot[]>()
    .range(fromRow, toRow))
}
