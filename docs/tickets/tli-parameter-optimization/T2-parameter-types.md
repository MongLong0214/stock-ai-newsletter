# T2: Parameter Types & Config Extension

**PRD Ref**: PRD-tli-parameter-optimization > US-1
**Priority**: P1 (High)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: T1

---

## 1. Objective

32개 TLI 파라미터(계산값 w_activity, sent_volume_weight 제외)의 TypeScript 인터페이스 정의 + score-config.ts에 통합 getter/setter + TLI_PARAMS_VERSION env var 기반 전환 로직. 타입은 `lib/tli/constants/tli-params.ts`에 위치하여 lib → scripts 의존성 역전 방지.

## 2. Acceptance Criteria

- [ ] AC-1: `TLIParams` 인터페이스에 32개 탐색 파라미터 포함 (§4.5 탐색 공간. 계산값 w_activity, sent_volume_weight 제외)
- [ ] AC-2: `getTLIParams(): TLIParams` — 현재 활성 파라미터 세트 반환
- [ ] AC-3: `setTLIParams(params: Partial<TLIParams>)` — 런타임 오버라이드 (evaluate.ts용)
- [ ] AC-4: `TLI_PARAMS_VERSION` env var: `v2` → `optimized-params.json` 로드, 미설정/`v1` → 기본값
- [ ] AC-5: 기본값이 현재 하드코딩 값과 동일 (regression 없음)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `getTLIParams returns defaults when no override` | Unit | 기본 파라미터 반환 검증 | 33개 필드 현재값과 일치 |
| 2 | `setTLIParams overrides specific fields` | Unit | partial override 적용 | 변경 필드만 반영, 나머지 기본값 |
| 3 | `setTLIParams resets on null` | Unit | null 전달 시 기본값 복원 | 기본값 반환 |
| 4 | `weight fields sum to 1.0 in defaults` | Unit | 기본 가중치 합계 검증 | 1.0 |
| 5 | `stage thresholds are monotonically increasing` | Unit | dormant < emerging < growth < peak | true |
| 6 | `env var v1 returns defaults` | Unit | TLI_PARAMS_VERSION=v1 | 기본값 |
| 7 | `env var v2 loads optimized-params.json` | Unit | TLI_PARAMS_VERSION=v2 + valid JSON | JSON 값 반환 |
| 8 | `env var v2 with missing file falls back to defaults + warning` | Unit | v2 + 파일 미존재 | 기본값 + console.warn |
| 9 | `env var v2 with partial JSON merges with defaults` | Unit | v2 + 일부 필드만 | 나머지 기본값 merge |

### 3.2 Test File Location
- `scripts/tli-optimizer/__tests__/types.test.ts`

### 3.3 Mock/Setup Required
- `vi.stubEnv('TLI_PARAMS_VERSION', 'v1')` for env var tests

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `lib/tli/constants/tli-params.ts` | Create | `TLIParams` 인터페이스 + DEFAULT_PARAMS 상수 (lib 내부에 위치하여 의존성 역전 방지) |
| `lib/tli/constants/score-config.ts` | Modify | `getTLIParams()`/`setTLIParams()` 추가, env var 전환 로직 |

### 4.2 Implementation Steps (Green Phase)
1. `TLIParams` 인터페이스 정의 (33개 필드 + JSDoc)
2. `DEFAULT_PARAMS` 상수 — 현재 하드코딩 값과 동일
3. score-config.ts에 getter/setter 추가
4. env var 전환 로직 (`v2` → JSON 파일 로드 시도)
5. 기존 `getScoreWeights()` 등은 `getTLIParams()` 위임으로 리팩토링

### 4.3 Refactor Phase
- 기존 `setScoreWeights`/`setMinRawInterest`/`setConfidenceThresholds`를 `setTLIParams` 래퍼로 전환 (하위 호환 유지)

## 5. Edge Cases
- EC-1: `optimized-params.json` 미존재 시 v2 요청 → 기본값 + 경고 로그
- EC-2: JSON 파일 내 일부 필드만 존재 → 나머지는 기본값으로 fallback

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
- [ ] 기존 `getScoreWeights()` 호출 코드 regression 없음
