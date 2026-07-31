import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationPath = 'supabase/migrations/060_generation_provenance.sql'

describe('generation provenance migration', () => {
  it('creates a complete immutable model/prompt/grounding/output manifest', async () => {
    const sql = await readFile(migrationPath, 'utf8')

    for (const column of [
      'model_provider TEXT NOT NULL',
      'model_version TEXT NOT NULL',
      'prompt_version TEXT NOT NULL',
      'prompt_sha256 TEXT NOT NULL',
      'grounding_evidence JSONB NOT NULL',
      'output_content_sha256 TEXT NOT NULL',
      'started_at TIMESTAMPTZ NOT NULL',
      'completed_at TIMESTAMPTZ NOT NULL',
    ]) expect(sql).toContain(column)

    expect(sql).toContain('generation_runs_immutable')
    expect(sql).toContain("RAISE EXCEPTION 'generation_runs rows are immutable'")
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.generation_runs/)
  })

  it('atomically verifies content hash, inserts the run, and upserts only unsent content', async () => {
    const sql = await readFile(migrationPath, 'utf8')
    const functionStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.store_newsletter_generation')
    const functionBody = sql.slice(functionStart, sql.indexOf('ALTER TABLE public.generation_runs ENABLE ROW LEVEL SECURITY'))

    expect(functionBody).toContain("extensions.digest(convert_to(p_gemini_analysis, 'UTF8'), 'sha256')")
    expect(functionBody.indexOf('INSERT INTO public.generation_runs')).toBeLessThan(
      functionBody.indexOf('INSERT INTO public.newsletter_content'),
    )
    expect(functionBody).toContain('ON CONFLICT (newsletter_date) DO UPDATE')
    expect(functionBody).toContain('WHERE public.newsletter_content.is_sent = false')
    expect(functionBody).toContain("RAISE EXCEPTION 'sent newsletter content is immutable'")
    expect(functionBody).toContain("(SELECT auth.role()) IS DISTINCT FROM 'service_role'")
  })

  it('requires HTTPS grounding URLs/timestamps and exposes no anon mutation surface', async () => {
    const sql = await readFile(migrationPath, 'utf8')

    expect(sql).toContain("~ '^https://'")
    expect(sql).toContain("v_evidence ->> 'sourceObservedAt'")
    expect(sql).toContain('REVOKE ALL ON TABLE public.generation_runs FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('REVOKE UPDATE, DELETE ON TABLE public.generation_runs FROM service_role')
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE public.generation_runs TO service_role')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.store_newsletter_generation[\s\S]*FROM PUBLIC, anon, authenticated/)
  })
})
