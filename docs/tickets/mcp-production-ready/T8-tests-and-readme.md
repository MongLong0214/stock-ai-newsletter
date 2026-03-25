# T8: 테스트 프레임워크 + README 리디자인

**PRD Ref**: PRD-mcp-production-ready > US-8
**Priority**: P2 (Medium)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: T7

---

## 1. Objective
MCP 패키지 핵심 테스트 완성 + README 리디자인 (가치 제안 선두).

## 2. Acceptance Criteria
- [ ] AC-1: tool registration 테스트 — 전체 도구 11개 등록 확인 (기존 8 + 신규 3; get_stock_theme은 deprecated wrapper로 유지)
- [ ] AC-2: fetch-helper 테스트 — retry, timeout, error format, response unwrapping, Zod 검증
- [ ] AC-3: formatResult/formatError 테스트
- [ ] AC-4: README 첫 문단 = 사용자 가치 ("Ask about Korean stock themes in natural conversation")
- [ ] AC-5: README에 신규 도구 3개 문서 추가 (get_theme_changes, compare_themes, get_predictions) + `get_methodology` section=scoring 토큰 절약 예시
- [ ] AC-6: README에 `search_stocks` 통합 기능 반영, `get_stock_theme` deprecated 안내
- [ ] AC-7: `npm run test` (루트 vitest) 에서 MCP 테스트 실행 가능

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `createSandboxServer registers all tools` | Integration | createSandboxServer() | 11개 도구 등록 |
| 2 | `fetchApi retries on 503` | Unit | 503 → 503 → 200 | 성공 |
| 3 | `fetchApi throws after max retries` | Unit | 503 × 3 | Error |
| 4 | `fetchApi respects timeout` | Unit | 15초 초과 | AbortError |
| 5 | `fetchApi unwraps ApiResponse envelope` | Unit | { success: true, data: X } | X |
| 6 | `formatResult includes context header` | Unit | data + context | context + JSON |
| 7 | `formatError formats Error message` | Unit | new Error("msg") | "Error: msg" |

### 3.2 Test File Location
- `mcp/src/__tests__/index.test.ts` (registration)
- `mcp/src/__tests__/fetch-helper.test.ts` (이미 T2에서 일부, 여기서 보완)
- `mcp/src/__tests__/format.test.ts`

### 3.3 Mock/Setup Required
- Vitest: global fetch mock, AbortSignal.timeout mock
- createSandboxServer: 실제 import (ESM guard 덕분에 안전)

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `mcp/src/__tests__/index.test.ts` | Create | tool registration 통합 테스트 |
| `mcp/src/__tests__/format.test.ts` | Create | formatResult/formatError 테스트 |
| `mcp/src/__tests__/fetch-helper.test.ts` | Modify | retry/timeout 보완 |
| `mcp/package.json` | Modify | test script 추가 |
| `mcp/README.md` | Modify | 리디자인 |
| `vitest.config.ts` (루트) | Modify | mcp 경로 포함 확인 |

### 4.2 Implementation Steps (Green Phase)
1. `mcp/package.json`에 `"test": "vitest run"` + devDependencies에 `vitest` 추가
2. `index.test.ts`: createSandboxServer → server._registeredTools (또는 SDK API) 접근해 도구 수 확인
3. `format.test.ts`: formatResult, formatError 출력 검증
4. `fetch-helper.test.ts`: retry 시나리오 보완
5. README 리디자인: 첫 문단 가치 제안 → Quick Start → Try Asking → Tools (신규 3개 포함) → Scoring → Lifecycle

### 4.3 Refactor Phase
- 테스트 중복 정리

## 5. Edge Cases
- 순수 스타일/텍스트 변경(README)은 snapshot 불필요

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
- [ ] 코드 스타일 준수
- [ ] 불필요한 변경 없음
