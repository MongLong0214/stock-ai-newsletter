# P1 legacy label finalizer — 검증 영수증

기준 HEAD: `4d3df946ff8b3fd371923854173a5b20ee3ed4dc` 위 미커밋 워크트리

## 최종 게이트

| 게이트 | 결과 | 증거 |
|---|---|---|
| canonical Vitest | PASS | `./node_modules/.bin/vitest run` → 257 files passed, 3189 tests passed, 0 failed |
| TypeScript | PASS | `./node_modules/.bin/tsc --noEmit --pretty false` → exit 0 |
| canonical ESLint | PASS | `./node_modules/.bin/eslint .` → exit 0, 0 errors, 기존 비변경 파일의 22 warnings |
| 변경 TS ESLint | PASS | 변경 TS/테스트 전체 + `--max-warnings=0` → exit 0 |
| diff integrity | PASS | `git diff --check` → exit 0 |
| rehearsal shell | PASS | `bash -n` 및 `--help` → exit 0, 인자 누락 → 의도한 exit 64, 실행 권한 `-rwxr-xr-x` |
| writer manual QA | PASS | 실제 public API를 최소 driver로 호출 → `{"finalized":992,"batches":[500,492],"zeroRowRejected":true}` |
| PostgreSQL 17 실실행 | BLOCKED BY ENV | `docker info` 조회는 되지만 `docker run`/cleanup mutation에서 OrbStack socket permission denied |

## 회귀·계약 검증

- `daily-label-phase.test.ts`: legacy version scoping, `(base_date,id)` 안정 정렬, 500행 초과 pagination, 관측된 1개 GT-A 날짜 + 3개 GT-B 날짜 무제한 순회, GT-B 가격 부족 경고, 전체 버전 fail-loud를 검증한다.
- `legacy-label-finalizer.test.ts`: 완전한 mature fixture가 저장된 gta-v1/gtb-v1 pending `id`를 사용해 각각 final로 가는 성공 경로를 검증한다.
- `legacy-label-finalizer-rpc.test.ts`: 992건을 500+492로 처리하고, error 없는 0행 반환도 실패시키며, DB error와 금지 payload를 전파한다.
- `legacy-label-finalizer-migration.test.ts`: exact pending WHERE, gta-v2 배제, scientific/provenance 열 비수정, service-role 전용 실행권한, SQL fixture의 992건/원자성 계약을 고정한다.
- `analysis-snapshot-fail-loud.test.ts`: 전체 버전 적체가 계속 critical이며 gta-v1/gta-v2/gtb-v1 진단 조회를 추가로 수행함을 검증한다.

red/green 핵심은 다음과 같다.

1. 수정 전 version-scoping 테스트는 `labeler_version=gta-v1` 조건 부재로 실패했다.
2. 수정 전 mature 성공-path 테스트는 GT-A가 version/pending id를 결합하지 않고 GT-B가 pending identity를 읽지 않아 실패했다.
3. 수정 후 exact success-path와 0-row rejection, 992 batching을 포함한 전체 canonical suite가 통과했다.

## SQL 리허설 범위

`scripts/tli/e2e/rehearse-migration-054.sh`는 다음을 자동 수행한다.

1. PostgreSQL 17 임시 컨테이너 생성
2. production schema snapshot through 048 로드
3. migrations 049 → 054 순서 적용
4. migration 053 legacy/security fixture 재검증
5. gta-v1 269건 + gtb-v1 723건 pending 생성
6. 500+492 두 RPC 호출로 992건 terminal 전이
7. 992 final / 0 pending / scientific contract unchanged 검증
8. terminal replay가 SQLSTATE `55000`인지 검증
9. 한 건 valid + 한 건 missing identity인 부분 batch가 `55000` 후 valid 행까지 pending으로 롤백되는지 검증
10. gta-v2 payload가 SQLSTATE `22023`으로 거부되는지 검증

현재 샌드박스에서는 컨테이너 mutation 권한이 없어 1번에서 중단됐다. CTO/배포 환경에서 다음 한 줄로 남은 DB gate를 수행한다.

```bash
cd /Users/isaac/WebstormProjects/stock-ai-newsletter
scripts/tli/e2e/rehearse-migration-054.sh /absolute/path/to/prod-schema-through-048.sql
```

마지막 receipt는 다음 필드를 포함해야 한다.

```json
{
  "status": "pass",
  "requested": 992,
  "finalized": 992,
  "gt_a": 269,
  "gt_b": 723,
  "batches": [500, 492],
  "zero_row_sqlstate": "55000",
  "partial_batch_atomic": "pass",
  "gta_v2_sqlstate": "22023",
  "scientific_contract": "unchanged"
}
```

## 배포 후 acceptance

1. migration 054 적용 후 full run을 실행한다.
2. 적체 로그의 `gta-v1`과 `gtb-v1`이 0인지 확인한다.
3. GT-B `가격 부족으로 pending 유지`가 있으면 해당 base date의 KOSPI/종목 가격을 backfill하고 full run을 재실행한다.
4. exact identity 불일치가 있으면 warning으로 삼키지 않고 `legacy 라벨 확정 영향 행 불일치` 또는 SQLSTATE `55000`으로 드러나야 한다.

## 독립 리뷰 판정

- 목표/제약: PASS — existing migration 미수정, 054만 추가, gta-v2 경계 불변, git commit 없음.
- 코드 품질: PASS — strict typed payload, exact affected-count contract, 변경 파일 lint/typecheck 통과.
- 보안: PASS (정적) — SECURITY DEFINER + `pg_catalog` search path, service-role only, legacy allowlist, protected science/provenance 열 비수정.
- 실행 QA: PARTIAL — TS/runtime 계약과 전체 suite는 PASS, 실제 PostgreSQL 컨테이너 리허설만 환경 권한으로 미실행.
- 컨텍스트: PASS (local) — migrations 045/048/053와 기존 writer/guard를 직접 대조. GitHub run 원문은 로컬 인증/connector 부재로 조회하지 못함.

따라서 최종 판정은 **코드 게이트 PASS, 배포 승인 전 PostgreSQL 리허설 1건 필요**다.
