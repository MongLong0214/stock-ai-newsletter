# T1: send_page_view:true 복원 + RouteTracker 초기 로드 skip

**PRD Ref**: PRD-ga4-optimization > R1.1
**Priority**: P0 (Blocker)
**Size**: S (< 2h)
**Status**: Todo
**Depends On**: None

---

## 1. Objective

GA4 `send_page_view: false` 설정을 `true`로 복원하여 gtag.js 로드 시 자동 page_view를 발화시키고, GA4RouteTracker가 초기 로드 시 중복 page_view를 발생시키지 않도록 skip 로직을 추가한다.

## 2. Acceptance Criteria

- [ ] AC-1: 첫 페이지 로드 시 GA4 page_view가 gtag config에 의해 자동 발화된다
- [ ] AC-2: GA4RouteTracker가 초기 마운트 시 pageview()를 호출하지 않는다 (중복 방지)
- [ ] AC-3: SPA 클라이언트 내비게이션(pathname 변경) 시 pageview()가 정확히 1회 발화된다
- [ ] AC-4: GA_MEASUREMENT_ID가 없으면 아무 것도 렌더링/실행하지 않는다

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `skips pageview on initial mount` | Unit | RouteTracker 첫 마운트 시 pageview() 미호출 | pageview 호출 0회 |
| 2 | `calls pageview on pathname change` | Unit | pathname이 변경되면 pageview() 1회 호출 | pageview(newPath) 1회 |
| 3 | `does not duplicate pageview on same path` | Unit | 동일 pathname으로 재렌더 시 pageview 미호출 | pageview 호출 0회 |
| 4 | `includes search params in path` | Unit | searchParams 존재 시 `path?query` 형태로 전달 | pageview('/page?q=1') |
| 5 | `renders nothing when GA_MEASUREMENT_ID is falsy` | Unit | ID 없으면 GoogleAnalytics가 null 반환 | null |

### 3.2 Test File Location

- `lib/analytics/__tests__/ga4-route-tracker.test.ts`

### 3.3 Mock/Setup Required

- `vi.mock('next/navigation')` — usePathname, useSearchParams 모킹
- `vi.mock('@/lib/analytics/ga')` — pageview 함수 모킹
- RouteTracker는 React 컴포넌트 → `@testing-library/react`의 `renderHook` 또는 `render` 사용
- pathname 변경 시뮬레이션: usePathname mock 반환값 변경 + rerender

## 4. Implementation Guide

### 4.1 Files to Modify

| File | Change Type | Description |
|------|------------|-------------|
| `components/analytics/google-analytics.tsx` | Modify | `send_page_view: false` → `true` |
| `components/analytics/ga4-route-tracker.tsx` | Modify | 초기 마운트 skip 로직 추가 |

### 4.2 Implementation Steps (Green Phase)

1. `google-analytics.tsx` line 24: `send_page_view: false` → `send_page_view: true`
2. `ga4-route-tracker.tsx`: `isInitialLoad` useRef(true) 추가
3. useEffect 내부 첫 실행 시 `isInitialLoad.current === true`이면 `isInitialLoad.current = false`만 하고 return (gtag가 이미 첫 page_view를 보냈으므로)
4. 이후 pathname/searchParams 변경 시에만 pageview() 호출

### 4.3 Refactor Phase

- 기존 `lastTrackedPathRef` 로직은 `isInitialLoad` skip과 자연스럽게 공존 — 추가 정리 불필요

## 5. Edge Cases

- EC-1: SSR 빌드 시 `window` 미존재 — GoogleAnalytics는 이미 'use client'이므로 SSR 안전
- EC-2: GA_MEASUREMENT_ID 빈 문자열 — 기존 `if (!GA_MEASUREMENT_ID) return null` 처리됨

## 6. Review Checklist

- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
- [ ] 코드 스타일 준수
- [ ] 불필요한 변경 없음
