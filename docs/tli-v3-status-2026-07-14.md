# TLI v3 현황 인수인계 (2026-07-14)

> **맨땅 세션용 단일 상태 문서.** 이 파일 하나로 TLI v3의 현재 상태·유지보수·코드 작업 진입점을 파악한다.
> 최신 HEAD: `dc3855b` · 프로덕션 배포 완료 · 재구축 공식 완료(Isaac 승인 2026-07-13).
> (2026-07-14 갱신: `/themes` 빈 화면+React #418 P0 근본 수정 배포 완료 — dc3855b. 실측 visibleThemes 43, 콘솔 에러 0.)

---

## 0. 30초 요약

- **TLI v3 과학적 재구축 = 구현(Todo 1~15) + 최종감사(F1~F4) 완료, 프로덕션 배포됨.** 예측 API는 검증된 champion cycle이 생길 때까지 **의도적으로 empty**(containment). 이건 고장이 아니라 설계다.
- **테마 목록/점수/뉴스 기능은 정상 동작** (`/themes` 렌더 정상, visibleThemes 45+). 예측 "확률 카드"만 검증 전까지 서술적 fallback.
- **지금은 데이터 축적 국면.** 첫 forecast origin 2026-07-13 생성됨(t=0). clean weekly origin 26개(~26주) 축적 후에야 Todo 16(첫 candidate cycle) 착수 가능. 그때까지 새 구현 작업 없음 — 운영 모니터링만.
- **작업 규칙(절대)**: 모든 코드 변경은 `codex exec -m gpt-5.6-sol`(xhigh/max)에 위임. Opus/Sonnet 폴백 금지(쿼터/장애 시 대기·재시도). 메인 세션은 판단·리뷰·배포만.

---

## 1. 무엇을 만들었나 (재구축의 본질)

과거 TLI는 자기참조 라벨·누수 평가·비재현 데이터로 "검증 불가"였다. v3는 **검증 전에는 아무것도 공개·승격되지 않는** end-to-end 시스템으로 재건:

- **불변 PIT 원천**(immutable collection runs) → **gta-v2 라벨**(정확히 과거5+미래5 거래일) → **결정론적 dataset hash** → **PIT feature** → **누수 없는 walk-forward 평가** → **동결된 전향 experiment cycle** → **fail-closed 승격/노출/채점**.
- 원 계획서(SSOT): `.omo/plans/tli-v3-scientific-rebuild-master.md` — **TLI 작업 전 반드시 Read.** 기존 PRD/문서는 상단 `superseded_for_scientific_claims` 배너로 격하됨.

**예측 대상(estimand)**: 시점 t 장마감 후, 그때 이용가능 데이터만으로 **향후 5거래일 관심도 상승확률** `P(future5_mean/past5_mean ≥ 1.10)`. 가격·수익·투자알파 아님(GT-B는 별도, 미착수).

---

## 2. 현재 배포 상태

- **HEAD `9696028`**, origin/main 동기화됨.
- **적용된 마이그레이션**: `045`~`055` 전부 프로덕션 Supabase 적용 완료.
  - 045 containment(레거시 M1 invalidated, registry 변경 동결 trigger) / 046 immutable source snapshots+manifest RPC / 047 bitemporal membership / 048 gta-v2 라벨 / 049 experiment cycle+state machine RPC 12종 / 050 append RPC+git SHA / 051 trigger 바인딩 수정 / 052 abstain sentinel DB 가드 / 053 라벨 가드+legacy upsert / 054 legacy 라벨 finalizer / 055 theme_labels TRUNCATE 가드+atomic cohort RPC.
- **Vercel**: 배포 success. 앱 정상(200).
- **미커밋 잔여**: `.serena/project.yml`, `mcp/.serena/project.yml`, `DESIGN.md`(재구축 이전부터 dirty, 절대 건드리지 말 것), `.next-font-mock.cjs`(빌드 아티팩트). 그 외 없음.

### 환경 플래그(전부 미설정/‘false’ = 안전 기본)
| 플래그 | 의미 | 현재 |
|---|---|---|
| `TLI_M1_PROMOTION_ENABLED` | 주간 승격 RPC 허용 | 미설정(=승격 0) |
| `TLI_M1_REGISTRATION_ENABLED` | challenger 등록 허용 | 미설정(=등록 0) |
| `TLI_PREDICTIONS_V3_EXPOSURE_ENABLED` | 예측 API 노출 | 미설정(=empty) |

노출은 위 플래그 `'true'` **AND** registry champion이 `eligible/public` **AND** exact cycle/role join **모두** 충족해야만 가능. 현재 어느 것도 충족 안 됨 → API empty가 정상.

---

## 3. 운영 파이프라인 (GitHub Actions)

`.github/workflows/tli-collect-data.yml` (cron, UTC):
| cron | KST | 역할 |
|---|---|---|
| `30 7 * * 1-5` | 평일 16:30 | full 수집+점수 |
| `0 0 * * 1-6` | 월~토 09:00 | news 수집 |
| `0 17 * * 6` | 일 02:00 | 주말 full |
| `30 9 * * 1` | 월 18:30 | Monday origin 생성 |

`.github/workflows/tli-weekly-learn.yml`: 토 21:00 UTC weekly-learn(현재 promotion/registration disabled로 zero-RPC).

**중요 운영 특성**:
- **GitHub cron 상습 지연 60~90분** (플랫폼 이슈, 우리 문제 아님). run이 예정보다 늦게 떠도 정상. 발화 안 하면 `gh workflow run tli-collect-data.yml -f mode=full|news-only`로 수동 dispatch.
- Monday origin은 cron + **backfill 이중 안전망**: 늦게 떠도 cutoff(18:00 KST) 지난 미생성 월요일을 자동 backfill. PIT-파생이라 늦은 생성도 payload byte 동일.
- 과학 실행 런타임 고정: **uv 0.9.25 + CPython 3.13.11 + frozen lockfile + PYTHONHASHSEED=0/OMP·OPENBLAS·MKL_NUM_THREADS=1**.
- **이중 lockfile**: 의존성 변경 시 `pnpm-lock.yaml`(Vercel)과 `package-lock.json`(Actions) **둘 다** 갱신 필수. → `pnpm install --lockfile-only`.

---

## 4. 축적 시계 (지금 여기)

- **첫 forecast origin: 2026-07-13** 생성됨(`tli_forecast_origin_manifests`, cutoff 18:00 KST, 200테마). **26주 시계 t=0.**
- 단, 첫 origin `usable=0` — immutable interest 이력이 20거래일 미달(축적 7/11 시작). **실질 clean-origin 카운트는 20일 이력 성숙(~2026년 8월 초)부터.**
- Naver DataLab은 발행 지연 있음(현재 source_max ~7/10). 수집은 정상, 원천이 늦는 것. 이력이 이 속도로 깊어짐.
- **다음 마일스톤**: clean weekly origin ≥26 + retrospective OOS(paired ≥800, positive ≥100) 충족 시 **Todo 16**(candidate cycle 사전등록·시작). 그 전엔 착수 불가.

---

## 5. 상태 점검 방법 (맨땅 세션이 바로 실행)

```bash
# CI 최근 실행
gh run list --workflow=tli-collect-data.yml --limit 3 --json status,conclusion,createdAt,event

# API 헬스 + containment(empty가 정상)
curl -s -o /dev/null -w "%{http_code}\n" https://stockmatrix.co.kr
curl -s "https://stockmatrix.co.kr/api/tli/predictions" | grep -o '"dataSource":"[a-z]*"'   # → "none"

# ★ 테마 목록 실제 렌더 (API만 보지 말 것 — 2026-07-14 P0 교훈)
curl -s "https://stockmatrix.co.kr/themes?v=$(date +%s)" | grep -oE 'visibleThemes\\":[0-9]+'  # → 45+ 면 정상, 0이면 장애
```

프로덕션 DB 실측(read-only)은 `scripts/tli/shared/supabase-admin`(service_role) 재사용. 임시 조회 스크립트는 `scripts/tli/ops/`에 만들고 실행 후 삭제.

**마이그레이션 리허설**: 로컬 스크래치 PG로 검증(로컬 Supabase reset은 030에서 깨짐 — 대신 `prod-schema.sql` 덤프 + 스크래치 postgres:17 컨테이너에 049~최신 순서 적용). `env -u JWT_SECRET`로 실행(스크립트가 JWT_SECRET readonly 충돌).

---

## 6. 아키텍처 지도 (코드 작업 진입점)

| 영역 | 경로 |
|---|---|
| 원 계획서(SSOT) | `.omo/plans/tli-v3-scientific-rebuild-master.md` |
| 마이그레이션 | `supabase/migrations/045~055_*.sql` |
| 수집기 | `scripts/tli/collectors/` (naver-datalab, naver-news, collection-run-store/contract) |
| origin 생성 | `scripts/tli/origins/` (run-monday-origins, forecast-origin-manifest, lock-study-contract, origin-sources) |
| 라벨 gta-v2 | `lib/tli/labels/gt-a-v2.ts`, `scripts/tli/labels/finalize-gt-a-v2.ts`, `daily-label-phase.ts` |
| feature 빌더 | `lib/tli/features/build-confirmatory-features.ts`, `scripts/tli/features/` |
| dataset/평가 | `scripts/tli/learn/dataset-manifest.ts`, `lib/tli/eval/walk-forward.ts`, `lib/tli/model/baselines.ts` |
| 학습(Python) | `scripts/tli/learn/train_m1.py`, `m1_calibration*.py`, `stats_bootstrap.py`, `interval_ensemble.py`, `study_eval_*.py` |
| scoring/gate | `scripts/tli/comparison/theme-predictions-v3-scientific-*.ts`, `scripts/tli/learn/prospective-gate-*.ts` |
| 예측 API | `app/api/tli/predictions/prediction-loader.ts` (containment: validated champion 없으면 empty) |
| **테마 목록(사용자 화면)** | `app/themes/(list)/page.tsx` → `themes-content.tsx` → `useGetRanking` → `/api/tli/scores/ranking`; SSR는 `get-ranking-server.ts` |
| e2e 드라이버 | `npm run tli:e2e:dry-run -- --fixture=happy --prod-schema=<덤프> --output=<경로>` |
| 감사 증적 | `.omo/evidence/tli-v3-scientific-rebuild/` (F1~F4 보고 + 리허설 receipt) |
| 커밋 정본 증적 | `docs/evidence/` (study-contract 등) ·  로컬 QA 증적은 `.omo/evidence`(gitignore) |

---

## 7. 열려있는 이슈 / 개선 후보 (비차단)

- **F2 P2 4건 중 일부**: 055로 F2-07(atomic cohort)·F2-08(TRUNCATE 가드) 해소. 나머지 P2 및 `theme-predictions-v3-scientific-preflight.ts` 추가 분리 여지는 `.omo/evidence/.../final-wave/f2-code-security.md` 참조. 비차단.
- **Todo 13 잔여**: candidate 성공 후 comparator 인프라 실패 시 자동재개 불가(명시적 partial). paired finalize/recovery RPC는 개선 후보.
- **DataLab 지연**: 축적 속도에 영향(usable origin 지연). 데이터 소스 특성, 코드 이슈 아님.
- **plan Todo 9 AC 주석**: "O(1) batch"를 anti-N+1로 해석(page-bounded 허용)한 CTO 주석이 `master.md:410`에 있음. 근거: `.omo/evidence/.../final-wave/cto-decision-o1-interpretation.md`.

---

## 8. 사고 이력에서 나온 불변 규칙 (재발 방지)

1. **실제 페이지 렌더를 확인하라** — API·CI green ≠ 사용자 화면 정상. 2026-07-14 `/themes` 빈 화면 P0(SSR 쿼리 timeout→EMPTY_RANKING→RQ 고착)를 며칠 놓친 원인. 배포/모니터 시 `/themes` visibleThemes·카드 수 실측 필수. **→ dc3855b로 근본 수정·배포 완료**: SSR/헬퍼를 anon→service-role 클라이언트로 전환(대용량 news 테이블 RLS 평가 statement_timeout 제거, anon 841ms→service 223ms), asOfDate를 로케일/TZ 의존 `toLocaleDateString`→결정론적 `formatKoreanDate`로 교체(#418 제거). 프로덕션 Playwright 검증: 카드 렌더 + 콘솔 에러 0. 상세 교훈: `~/.claude 메모리 ssr-anon-rls-timeout`.
2. **fail-loud를 신뢰하되 근본을 봐라** — 주말 라벨 확정 0건 경보는 fail-loud가 잡았지만 원인은 3중(finalizer 원자성·maturity 계산·가격 갭)이었다.
3. **마이그레이션은 실 PG 리허설** — SQL 텍스트 테스트로 안 잡히는 PL/pgSQL 문법(049 CASE-in-IF), trigger 바인딩(051), 부정+긍정 경로를 스크래치 PG로 실행 검증.
4. **배포 순서**: 스키마(migration) 먼저 → 앱(코드) 나중. 특히 RPC를 호출하는 loader는 RPC 적용 후 배포.
5. **첫 origin 당일 등 민감일엔 프로덕션 변경 게이트** — 단, 원인이 명확한 사용자 P0는 예외로 즉시 배포.

---

## 9. 성공/완료의 정의 (착각 금지)

- 테스트 green·좋은 retrospective metric·많은 pending prediction·B-Abl보다 예쁜 차트는 **완료 증거가 아니다.**
- L3(모델 효능)은 최소 16주 전향 gate를 **실제로** 통과해야만 인정. 실패 시 효능 기각하고 L2 유지 — 기준을 바꾸거나 재탐색해 성공으로 만들지 않는다.
- 가격·수익·투자알파 주장은 GT-B(별도 plan, 미착수) 전까지 금지.