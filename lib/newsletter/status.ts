import { createClient } from '@supabase/supabase-js'

export interface NewsletterStatusRow {
  readonly is_sent: boolean
  readonly picks_source: string | null
}

type NewsletterStatusEnvironment = Readonly<Record<string, string | undefined>>

export async function getNewsletterStatus(
  date: string,
  env: NewsletterStatusEnvironment = process.env,
): Promise<NewsletterStatusRow | null> {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  })
  const { data, error } = await supabase
    .from('newsletter_content')
    .select('is_sent, picks_source')
    .eq('newsletter_date', date)
    .maybeSingle()

  if (error) throw new Error(`Database error: ${error.message}`)
  return data
}
