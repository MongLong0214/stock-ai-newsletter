# 배포 런북 — PR 3: TLI 데이터 정합성

마이그레이션: `061`, `062`. **PR 2(`058`, `059`) 적용 이후에만 진행한다.**

## 1. 사전 게이트

1. 복구 가능한 DB 백업 확인
2. **`061`은 데이터 상태를 변경한다.** `model_type`이 `b_abl` / `m1_logistic`이 아닌
   `model_registry` 행을 `archived` + `invalidated`로 격리한다. 적용 전에 대상 행을 조회해
   개수와 내용을 기록해 둔다.

   ```sql
   SELECT id, model_type, status, scientific_claim_status
   FROM public.model_registry
   WHERE model_type NOT IN ('b_abl', 'm1_logistic');
   ```

3. TLI 수집 잡(`tli-collect-data.yml`)이 실행 중이 아닌지 확인
4. 클린 체크아웃에서 `tsc`, `eslint`, `vitest`, `next build` 통과

## 2. 적용 순서

1. 마이그레이션 `061` → `062` 적용
2. 검증된 커밋 배포
3. TLI 수집 잡 재개

## 3. 스모크 체크

- 수집 파이프라인 1회 수동 실행:
  - 점수 계산이 실패하면 후속 비교/예측/평가 단계가 **건너뛰어지고** 로그에
    `[Pipeline Abort]`가 남는지 확인 (ARC-001)
  - 네이버 테마 수집 로그에 거래소 미확인 제외 종목이 있으면 경고로 남고 수집 자체는
    계속되는지 확인
- `/api/tli/changes?period=7d` 응답의 비교 기준일이 최신 관측일로부터 5일 이상 떨어져 있는지
  확인 (DATA-001)
- `theme_stock_membership_history`에 중복 열림 구간이 생기지 않는지 확인 (062 원자적 전이)
- 공개 예측 API가 stale 예측을 내보내지 않는지 확인 (061 freshness)

## 4. 롤백

- TLI 수집 잡부터 정지
- 앱을 직전 검증 배포로 롤백
- **`061`의 `model_registry` 격리는 자동 되돌림이 없다.** 되돌려야 하면 1번에서 기록한
  행 목록을 근거로 수동 복원하거나 백업 복구 지점을 사용한다.
- `062`의 RPC는 additive이므로 앱 롤백 시 남겨둘 수 있다.
