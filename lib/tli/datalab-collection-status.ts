import { createClient } from '@supabase/supabase-js'

type DatalabCollectionStatusEnvironment = Readonly<Record<string, string | undefined>>

export async function hasCompleteDatalabCollection(
  kstDate: string,
  env: DatalabCollectionStatusEnvironment = process.env,
): Promise<boolean> {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  })
  const { count, error } = await supabase
    .from('tli_collection_runs')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'naver_datalab')
    .eq('status', 'complete')
    .gte('completed_at', `${kstDate}T00:00:00+09:00`)
    // WHY: interest batch runs end today; forecast runs end on the previous trading day and
    // must not suppress today's pre-collection. This also excludes a prior-day run completed late.
    .gte('request_window_end', kstDate)

  if (error) throw new Error(`Database error: ${error.message}`)
  return (count ?? 0) > 0
}
