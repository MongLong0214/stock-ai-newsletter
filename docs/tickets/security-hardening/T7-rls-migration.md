# T7: Migration 029 (RLS 4개 테이블) + rollback SQL

**PRD Ref**: PRD-security-hardening > US-4
**Priority**: P1
**Size**: S (< 2h)
**Status**: Todo
**Depends On**: None

---

## 1. Objective
4개 public 테이블에 Row Level Security 활성화 + service_role 전용 정책. anon/authenticated 완전 차단.

대상 테이블:
- `newsletter_content` (001)
- `prediction_snapshots` (007, v1)
- `comparison_calibration` (008)
- `calibration_artifact` (021)

## 2. Acceptance Criteria
- [ ] AC-1: 4개 테이블에 `ENABLE ROW LEVEL SECURITY`
- [ ] AC-2: 각 테이블에 `CREATE POLICY` — service_role만 ALL 허용
- [ ] AC-3: `REVOKE ALL ON TABLE ... FROM anon, authenticated`
- [ ] AC-4: Migration 029는 `BEGIN; ... COMMIT;` 트랜잭션 래핑
- [ ] AC-5: `DO $$ ... ASSERT (SELECT rowsecurity FROM pg_tables WHERE tablename = ...) $$` 로 enabled 여부 단언
- [ ] AC-6: 2회 연속 실행 idempotent (`DROP POLICY IF EXISTS`, `IF NOT EXISTS` 활용)
- [ ] AC-7: rollback SQL 실제 작성 (`029_rollback.sql`)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `migration 029 is idempotent` | Integration | 2회 실행 | exit 0, 에러 없음 |
| 2 | `all 4 tables have rowsecurity = true after migration` | Integration | `pg_tables` 쿼리 | 4 rows, rowsecurity=t |
| 3 | `anon key SELECT returns 0 rows from newsletter_content` | Integration | Supabase anon client | `data: []` |
| 4 | `anon key SELECT returns 0 rows from prediction_snapshots` | Integration | | `data: []` |
| 5 | `anon key SELECT returns 0 rows from comparison_calibration` | Integration | | `data: []` |
| 6 | `anon key SELECT returns 0 rows from calibration_artifact` | Integration | | `data: []` |
| 7 | `service_role SELECT works after migration` | Integration | admin client | `data.length >= 0` |
| 8 | `rollback restores anon access` | Integration | 029_rollback 후 | anon 가능 |
| 9 | `prediction_snapshots_v2 rowsecurity stays true (regression)` | Integration | 016 적용 확인 유지 | rowsecurity=t |

### 3.2 Test File Location
- `supabase/migrations/__tests__/029-rls.test.ts` (신규 디렉토리)

### 3.3 Mock/Setup Required
- 로컬 `supabase start` 필수. CI 환경에서는 `supabase db reset`
- 테스트 내에서 `createClient(url, anon_key)` + `createClient(url, service_role_key)` 두 클라이언트
- **CI skip 가드**: 파일 상단에 `const skipIfNoSupabase = !process.env.SUPABASE_LOCAL_URL; describe.skipIf(skipIfNoSupabase)('RLS integration', () => { ... })`. GitHub Actions job에서는 `env.SUPABASE_LOCAL_URL` 미설정으로 skip되고, 로컬에서 `export SUPABASE_LOCAL_URL=http://localhost:54321` 설정 시 실행

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `supabase/migrations/029_enable_rls_missing_tables.sql` | Create | RLS + policies + REVOKE |
| `supabase/migrations/029_rollback.sql` | Create | DISABLE + DROP POLICY |
| `supabase/migrations/__tests__/029-rls.test.ts` | Create | 8 테스트 |

### 4.2 Implementation Steps (Green Phase)
1. `029_enable_rls_missing_tables.sql`:
   ```sql
   BEGIN;

   DO $$
   BEGIN
     -- 4개 테이블 RLS enable
     EXECUTE 'ALTER TABLE newsletter_content ENABLE ROW LEVEL SECURITY';
     EXECUTE 'ALTER TABLE prediction_snapshots ENABLE ROW LEVEL SECURITY';
     EXECUTE 'ALTER TABLE comparison_calibration ENABLE ROW LEVEL SECURITY';
     EXECUTE 'ALTER TABLE calibration_artifact ENABLE ROW LEVEL SECURITY';
   END $$;

   -- service_role 전용 정책 (각 테이블)
   DROP POLICY IF EXISTS "service_role_all_newsletter_content" ON newsletter_content;
   CREATE POLICY "service_role_all_newsletter_content" ON newsletter_content
     FOR ALL TO service_role USING (true) WITH CHECK (true);
   -- (3개 테이블 반복)

   -- anon / authenticated 명시적 REVOKE
   REVOKE ALL ON TABLE newsletter_content, prediction_snapshots,
     comparison_calibration, calibration_artifact FROM anon, authenticated;

   -- assertion
   DO $$
   DECLARE cnt int;
   BEGIN
     SELECT COUNT(*) INTO cnt FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename IN ('newsletter_content', 'prediction_snapshots',
                         'comparison_calibration', 'calibration_artifact')
       AND rowsecurity = true;
     IF cnt <> 4 THEN
       RAISE EXCEPTION 'RLS not enabled on all 4 tables (got %)', cnt;
     END IF;
   END $$;

   COMMIT;
   ```
2. `029_rollback.sql`:
   ```sql
   BEGIN;
   DROP POLICY IF EXISTS ... (4개);
   ALTER TABLE ... DISABLE ROW LEVEL SECURITY (4개);
   -- REVOKE는 유지 (복원 불필요)
   COMMIT;
   ```
3. 로컬 `supabase db push` 로 적용
4. 테스트 실행

### 4.3 Refactor Phase
- SQL 주석으로 각 블록 설명 1줄씩

## 5. Edge Cases
- EC-1: 이미 RLS가 켜져 있는 테이블에 재적용 → `ENABLE` 은 idempotent, 에러 없음
- EC-2: `prediction_snapshots_v2` (016에서 이미 RLS) vs `prediction_snapshots` (이 티켓) — 두 테이블 공존 확인
- EC-3: 기존 cron/script가 service_role 키로 SELECT/INSERT 수행하는지 확인 (`scripts/tli/**` 이미 `supabase-admin.ts` 사용)

## 6. Review Checklist
- [ ] Red: 8 테스트 FAILED (로컬 supabase 없으면 skip 태그)
- [ ] Green: migration 적용 + 8 테스트 PASSED
- [ ] rollback SQL로 원상복구 가능 확인
- [ ] 기존 cron/script가 migration 후에도 성공 (수동 `npm run tli:run` dry-run)
