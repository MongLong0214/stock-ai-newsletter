import { createClient } from '@supabase/supabase-js'

export interface NewsletterStatusRow {
  readonly is_sent: boolean
  readonly picks_source: string | null
  readonly sent_at: string | null
  readonly subscriber_count: number | null
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
    .select('is_sent, picks_source, sent_at, subscriber_count')
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
