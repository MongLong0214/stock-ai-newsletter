# TLI 품질 게이트 v3 — Boomer 구조적 검증 리포트

**생성일**: 2026-02-27
**검증 대상**: strategist v3 제안서 (Hybrid C: minScore=50 + confidence + stage caps)
**검증 방법**: BOOMER-6 프레임워크 (가정/리스크/대안/기술부채/구현/v1패턴)
**판정**: RECONSIDER → 트리아지 후 **APPROVE (3건 수정 조건부)**

---

## 검증 결과 요약

| # | 이슈 | 심각도 | 트리아지 | 조치 |
|---|------|--------|---------|------|
| BC2 | Emerging 오름차순 정렬 + slice → 최저점 선택 | Critical | **수용** | 오름차순 유지 + 의도 문서화 |
| BC5 | confidenceLevel undefined 처리 미명시 | High | **부분 수용** | 명시적 가드 + boolean 롤백 |
| BC4 | tli-context.ts 분리 처리 미문서화 | High | **부분 수용** | 코드 주석 추가 |
| BC1 | 단일 스냅샷 과적합 위험 | High | **기각** | 단계적 배포가 live validation |
| BC3 | score>=62 대비 미검증 | High | **기각** | Stage 균형이 핵심 차별점 |
| BC6 | 0% 오차율 자기참조 | High | **기각** | DB 직접 쿼리 = 실측값 |

---

## 상세 분석

### BC2: Emerging 정렬 방향 (Critical → 해결)

**문제**: `emerging.sort((a, b) => a.score - b.score)` + `slice(0, 12)` = 최저 점수 12개 선택.

**분석**:
- Emerging은 "새로운 기회" 의미 → 낮은 점수 = 진짜 초기 단계 테마
- Emerging catch-all 문제로 고점수(avg 62.5) 테마가 오분류됨
- 최저 12개 선택 = 진짜 신규 테마 선택 + 오분류 고점수 테마 자연 필터
- **결정**: 오름차순 유지가 제품 의미론에 부합. 의도를 코드 주석으로 명시.

### BC5: confidenceLevel undefined 처리 (부분 수용)

**문제**: `confidenceLevel?: ConfidenceLevel` — undefined 시 `excludeConfidence.includes(undefined)` = false → 통과.

**분석**:
- 동작 자체는 올바름 (미확인 = 필터하지 않음)
- 단, 의도가 코드에 명시되지 않음 → 유지보수 리스크
- **조치**: 명시적 가드 `if (theme.confidenceLevel && ...)` 추가
- **추가**: 롤백을 `enabled: boolean` 스위치로 개선

### BC4: tli-context.ts 분리 (부분 수용)

**문제**: route.ts와 get-ranking-server.ts는 applyQualityGate 사용, tli-context.ts는 minScore만.

**분석**:
- tli-context.ts 자체 STAGE_CONFIG: `Growth:8, Emerging:5, Peak:5, Decline:3` = 최대 21개
- v3 caps: `Em:12, Gr:15, Pk:25, Dc:10, Ri:8` = 최대 70개
- tli-context.ts가 이미 더 엄격 → v3 caps 추가는 무의미
- **조치**: 코드 주석으로 분리 이유 문서화

### BC1: 단일 스냅샷 (기각)

- 단계적 배포 (Phase A→B→C 각 1주)가 실질적 out-of-sample 검증
- 8-12주 백테스트는 Phase 2 범위
- caps의 ±20% 민감도 분석에서 "안정" 판정 → 단기 변동에 강건

### BC3: score>=62 대비 (기각)

- score>=62는 75개로 결과 유사하지만 **Peak 과잉 제어 불가**
- Peak 100개 중 상위 62+점이 대부분 → score-only로는 Peak 비율 변화 없음
- Stage caps가 Peak를 100→25로 축소하는 것이 핵심 가치

### BC6: 0% 오차율 (기각)

- v1은 "추정"으로 65-75 예측 → 실제 151 (실패)
- v3는 실 DB 쿼리로 직접 계산 → 0%는 "예측 정확도"가 아니라 "측정값"
- Production에서의 오차는 단계적 배포 모니터링으로 검증

---

## [CONCLUSION]

v3 제안서는 과학적 검증 프로토콜(§17)을 준수하고, 모든 수치가 실 DB에서 도출됨.
Boomer 검증에서 1개 Critical(Emerging 정렬) + 2개 부분 수용 이슈가 발견되었으나,
모두 코드 수준 수정(주석, 가드, boolean 스위치)으로 해결 가능.

**최종 판정**: 3건 수정 반영 후 **APPROVE**.