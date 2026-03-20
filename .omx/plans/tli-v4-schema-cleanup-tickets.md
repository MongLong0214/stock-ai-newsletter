# TLI V4 Schema Cleanup Tickets

## Ticket 1: Schema Test Hardening

Goal:
- Add failing tests that define the v4-only comparison schema target state.

Likely files:
- `scripts/tli/__tests__/comparison-v4-schema.test.ts`

## Ticket 2: Forward Migration

Goal:
- Add a new migration to retire legacy comparison schema safely.

Likely files:
- `supabase/migrations/028_*.sql`
- schema tests

## Ticket 3: Runtime and Maintenance Cleanup

Goal:
- Remove or rewrite scripts that still read retired legacy tables.

Likely files:
- `scripts/tli/validate-stage-persistence.ts`
- `scripts/tli/validate-horizon-fix.ts`
- `scripts/tli/calibrate-confidence.ts` comments/shape if needed
- any remaining runtime references

## Ticket 4: Types, Docs, Final Sweep

Goal:
- Remove legacy db interfaces and stale docs
- final suite verification

Likely files:
- `lib/tli/types/db.ts`
- `scripts/tli/README.md`
