# T2: dataLayer 큐잉 + BFCache 대응 + waitForGtag 최적화

**PRD Ref**: PRD-ga4-optimization > R1.2
**Priority**: P0 (Blocker)
**Size**: S (< 2h)
**Status**: Todo
**Depends On**: T1

---

## 1. Objective

gtag 미로드 상태에서도 page_view 이벤트가 유실되지 않도록 dataLayer 큐잉을 구현하고, 네이버 뒤로가기(BFCache 복원) 시 page_view가 재발화되도록 pageshow 이벤트 리스너를 추가한다. waitForGtag 폴링을 최적화한다.

## 2. Acceptance Criteria

- [ ] AC-1: BFCache 복원(pageshow.persisted=true) 시 page_view가 1회 발화된다
- [ ] AC-2: waitForGtag 타임아웃 5초→3초, 폴링 간격 200ms→100ms
- [ ] AC-3: waitForGtag 실패 시에도 dataLayer.push로 이벤트가 큐잉된다
- [ ] AC-4: dataLayer 큐에 상한선이 있다 (최대 50개, 초과 시 oldest 제거)

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `waitForGtag resolves within 3s timeout` | Unit | 3초 후 타임아웃 | resolve(false) at ~3000ms |
| 2 | `waitForGtag polls at 100ms intervals` | Unit | 폴링 간격 100ms | setInterval(100) |
| 3 | `pageview queues to dataLayer when gtag not ready` | Unit | gtag 미로드 시 dataLayer.push 호출 | dataLayer에 page_view 이벤트 존재 |
| 4 | `setupBFCacheHandler fires pageview on persisted pageshow` | Unit | pageshow(persisted:true) 발생 시 pageview 호출 | pageview(currentPath) 1회 |
| 5 | `setupBFCacheHandler ignores non-persisted pageshow` | Unit | pageshow(persisted:false) 시 무시 | pageview 호출 0회 |
| 6 | `dataLayer queue has max 50 entries` | Unit | 51번째 push 시 oldest 제거 | dataLayer.length <= 50 |

### 3.2 Test File Location

- `lib/analytics/__tests__/ga.test.ts`

### 3.3 Mock/Setup Required

- `vi.useFakeTimers()` — waitForGtag 타이밍 테스트
- `vi.spyOn(window, 'addEventListener')` — pageshow 리스너 검증
- `window.dataLayer = []` — 매 테스트 전 초기화
- `window.gtag = undefined` → gtag 미로드 상태 시뮬레이션
- `new PageTransitionEvent('pageshow', { persisted: true })` — BFCache 이벤트

## 4. Implementation Guide

### 4.1 Files to Modify

| File | Change Type | Description |
|------|------------|-------------|
| `lib/analytics/ga.ts` | Modify | waitForGtag 파라미터 변경, dataLayer 큐잉, BFCache 핸들러 |
| `components/analytics/ga4-route-tracker.tsx` | Modify | BFCache 핸들러 setup/cleanup |

### 4.2 Implementation Steps (Green Phase)

1. `ga.ts` — `waitForGtag` 기본 파라미터: `maxWaitMs = 3000`, 폴링 간격 `100`ms로 변경
2. `ga.ts` — `pageview()` 함수: `waitForGtag` 실패 시 `window.dataLayer.push` fallback 추가
   ```
   if (!ready) {
     window.dataLayer = window.dataLayer || [];
     if (window.dataLayer.length > 50) window.dataLayer.shift();
     window.dataLayer.push({ event: 'page_view', page_path: path, page_title: document.title });
     return;
   }
   ```
3. `ga.ts` — `setupBFCacheHandler()` export 함수 추가:
   - `window.addEventListener('pageshow', (e) => { if (e.persisted) pageview(currentPath()); })`
   - cleanup 함수 반환
4. `ga4-route-tracker.tsx` — useEffect에서 `setupBFCacheHandler()` 호출 + cleanup 반환

### 4.3 Refactor Phase

- `currentPath()` 헬퍼: `pathname + (searchParams ? '?' + searchParams : '')` 추출 → 중복 제거

## 5. Edge Cases

- EC-1: Safari에서 BFCache pageshow 이벤트 — `persisted` 속성 정상 동작 (Safari 지원)
- EC-2: SSR에서 `window.addEventListener` — 'use client' 컴포넌트 내에서만 호출되므로 안전
- EC-3: dataLayer 큐 상한선 50개 — 현실적으로 50회 이상 큐잉은 gtag 완전 실패 상황. console.warn 추가 검토

## 6. Review Checklist

- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] Refactor: 테스트 실행 → PASSED 유지 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
- [ ] 코드 스타일 준수
- [ ] 불필요한 변경 없음
