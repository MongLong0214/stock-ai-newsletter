import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/067_stock_daily_prices_close_provenance.sql', 'utf8')
const normalizedSql = sql.replace(/\s+/g, ' ').trim()
const original049 = readFileSync('supabase/migrations/049_tli_experiment_cycles.sql', 'utf8')

const enrollBody = (text: string): string => {
  const start = text.indexOf('CREATE OR REPLACE FUNCTION public.enroll_tli_origin(')
  return text.slice(start, text.indexOf('\n$$;', start))
}

describe('stock_daily_prices close provenance migration (067)', () => {
  it('is one additive transaction that adds a nullable column and a stamping trigger', () => {
    expect(normalizedSql).toMatch(/^BEGIN;/)
    expect(normalizedSql).toMatch(/^BEGIN; SET LOCAL lock_timeout = '5s';/)
    expect(normalizedSql).toMatch(/COMMIT;$/)
    expect(normalizedSql).toContain('ADD COLUMN close_written_at TIMESTAMPTZ;')
    expect(normalizedSql).toContain('BEFORE INSERT OR UPDATE ON public.stock_daily_prices FOR EACH ROW')
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE)\b/i)
    expect(sql).not.toMatch(/UPDATE public\.stock_daily_prices\s+SET/i)
  })

  it('re-stamps when close, source, or identity changes and keeps created_at immutable', () => {
    expect(normalizedSql).toContain('NEW.close IS DISTINCT FROM OLD.close OR NEW.source IS DISTINCT FROM OLD.source')
    expect(normalizedSql).toContain('NEW.symbol IS DISTINCT FROM OLD.symbol')
    expect(normalizedSql).toContain('NEW.trade_date IS DISTINCT FROM OLD.trade_date')
    expect(normalizedSql).toContain('NEW.close_written_at := OLD.close_written_at;')
    expect(normalizedSql.match(/NEW\.close_written_at := clock_timestamp\(\);/g)).toHaveLength(2)
    expect(normalizedSql).toContain("IF TG_OP = 'INSERT' THEN NEW.close_written_at := clock_timestamp();")
    expect(normalizedSql).toContain('ELSIF NEW.close IS DISTINCT FROM OLD.close OR NEW.source IS DISTINCT FROM OLD.source OR NEW.symbol IS DISTINCT FROM OLD.symbol OR NEW.trade_date IS DISTINCT FROM OLD.trade_date THEN NEW.close_written_at := clock_timestamp();')
    expect(sql).not.toMatch(/NEW\.close_written_at\s*:=\s*NEW\.created_at\b/i)
    const triggerFunction = sql.slice(
      sql.indexOf('CREATE FUNCTION public.stamp_stock_daily_price_close_written_at()'),
      sql.indexOf('REVOKE EXECUTE ON FUNCTION public.stamp_stock_daily_price_close_written_at()'),
    )
    expect(triggerFunction.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ')).toContain("IF TG_OP = 'UPDATE' THEN NEW.created_at := OLD.created_at; END IF; IF TG_OP = 'INSERT' THEN")
    expect(triggerFunction).not.toMatch(/\bnow\s*\(/i)
  })

  it('changes enroll_tli_origin only in the two KOSPI provenance predicates', () => {
    const before = enrollBody(original049).split('\n')
    const after = enrollBody(sql).split('\n')
    expect(after).toHaveLength(before.length)
    const changed = after.filter((line, index) => line !== before[index])
    expect(changed).toEqual([
      '    AND COALESCE(close_written_at, created_at) <= v_forecast.forecast_cutoff',
      '    AND COALESCE(close_written_at, created_at) <= v_forecast.forecast_cutoff',
    ])
  })
})
