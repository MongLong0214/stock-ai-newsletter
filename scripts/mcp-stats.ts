import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const days = Number(process.argv[2]) || 30

  const since = new Date()
  since.setDate(since.getDate() - days)

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_mcp_analytics_stats`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_since: since.toISOString() }),
  })

  if (!res.ok) {
    console.error(`Error ${res.status}: ${await res.text()}`)
    process.exit(1)
  }

  const data = await res.json()

  console.log(`\n=== MCP Usage Stats (last ${days} days) ===\n`)
  console.log(`Total calls:  ${data.totalCalls ?? 0}`)
  console.log(`Unique users: ${data.uniqueUsers ?? 0}`)

  const byTool = data.byTool ?? {}
  if (Object.keys(byTool).length > 0) {
    console.log('\n--- By Tool ---')
    for (const [tool, count] of Object.entries(byTool)) {
      console.log(`  ${tool}: ${count}`)
    }
  }

  const byDay = data.byDay ?? {}
  if (Object.keys(byDay).length > 0) {
    console.log('\n--- By Day ---')
    for (const [day, count] of Object.entries(byDay).sort()) {
      console.log(`  ${day}: ${count}`)
    }
  }

  const byUA = data.byUserAgent ?? {}
  if (Object.keys(byUA).length > 0) {
    console.log('\n--- By User Agent ---')
    for (const [ua, count] of Object.entries(byUA)) {
      console.log(`  ${ua}: ${count}`)
    }
  }

  console.log()
}

main()