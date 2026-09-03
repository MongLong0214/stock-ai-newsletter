import { createClient } from '@supabase/supabase-js'

import {
  countNewsletterDeliveryStatuses,
  type NewsletterDeliveryCounts,
  type NewsletterDeliveryStatus,
} from '@/lib/newsletter/delivery'
import { fetchAllRows } from '@/lib/supabase/paginate'

export interface NewsletterStatusRow {
  readonly is_sent: boolean
  readonly picks_source: string | null
  readonly sent_at: string | null
  readonly subscriber_count: number | null
  readonly gemini_analysis: string | null
  readonly sending_owner: string | null
  readonly sending_lease_until: string | null
  readonly sending_started_at: string | null
}

type NewsletterStatusEnvironment = Readonly<Record<string, string | undefined>>

function createStatusClient(env: NewsletterStatusEnvironment) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  })
}

export async function getNewsletterStatus(
  date: string,
  env: NewsletterStatusEnvironment = process.env,
): Promise<NewsletterStatusRow | null> {
  const supabase = createStatusClient(env)
  const { data, error } = await supabase
    .from('newsletter_content')
    .select('is_sent, picks_source, sent_at, subscriber_count, gemini_analysis, sending_owner, sending_lease_until, sending_started_at')
    .eq('newsletter_date', date)
    .maybeSingle()

  if (error) throw new Error(`Database error: ${error.message}`)
  return data
}

export async function countActiveSubscribers(
  env: NewsletterStatusEnvironment = process.env,
): Promise<number> {
  const supabase = createStatusClient(env)
  const { count, error } = await supabase
    .from('subscribers')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)

  if (error) throw new Error(`Database error: ${error.message}`)
  if (count === null) throw new Error('Database error: active subscriber count is unavailable')
  return count
}

export async function countDeliveriesByStatus(
  date: string,
  env: NewsletterStatusEnvironment = process.env,
): Promise<NewsletterDeliveryCounts> {
  const supabase = createStatusClient(env)
  try {
    const rows = await fetchAllRows<{ readonly status: NewsletterDeliveryStatus }>((from, to) => supabase
      .from('newsletter_deliveries')
      .select('status')
      .eq('newsletter_date', date)
      .order('subscriber_id', { ascending: true })
      .range(from, to))
    return countNewsletterDeliveryStatuses(rows)
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      throw new Error(`Database error: ${String(error.message)}`)
    }
    throw new Error(`Database error: ${String(error)}`)
  }
}
