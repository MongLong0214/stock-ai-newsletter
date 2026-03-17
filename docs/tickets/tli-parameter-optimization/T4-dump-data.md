# T4: Historical Data Dump Script

**PRD Ref**: PRD-tli-parameter-optimization > US-1, US-2
**Priority**: P1 (High)
**Size**: M (2-4h)
**Status**: Todo
**Depends On**: T1

---

## 1. Objective

Supabase에서 과거 60일+ 테마 데이터를 SELECT-only로 추출하여 historical-data.json으로 저장. 최적화 인프라의 고정 데이터 레이어.

## 2. Acceptance Criteria

- [ ] AC-1: `npx tsx scripts/tli-optimizer/dump-data.ts` 실행 시 historical-data.json 생성
- [ ] AC-2: SELECT-only 쿼리만 실행. `.insert()/.update()/.delete()/.rpc()` 호출 시 즉시 abort
- [ ] AC-3: 실행 전 .gitignore에 historical-data.json 패턴 존재 확인. 미등록 시 abort + 안내 메시지
- [ ] AC-4: 60일 미만 데이터 테마 자동 제외
- [ ] AC-5: 덤프 후 테마 수, 날짜 범위, 총 데이터 포인트 로깅

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `aborts when gitignore missing pattern` | Unit | .gitignore에 패턴 없을 때 | throw Error |
| 2 | `excludes themes with less than 60 days` | Unit | 30일 데이터 테마 | 결과에서 제외 |
| 3 | `output JSON has correct schema` | Unit | 덤프 결과 구조 검증 | themes[].interestMetrics, newsMetrics 존재 |
| 4 | `logs summary after dump` | Unit | 로그 출력 검증 | 테마 수, 날짜 범위 포함 |
| 5 | `aborts when non-SELECT query attempted` | Unit | .insert()/.update()/.delete()/.rpc() 호출 시 | throw Error + abort |

### 3.2 Test File Location
- `scripts/tli-optimizer/__tests__/dump-data.test.ts`

### 3.3 Mock/Setup Required
- Supabase client mock (`vi.mock('@supabase/supabase-js')`)
- `fs.readFileSync` mock for .gitignore check
- `fs.writeFileSync` mock for JSON output

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `scripts/tli-optimizer/dump-data.ts` | Create | Supabase → JSON 덤프 스크립트 |

### 4.2 Implementation Steps (Green Phase)
1. .gitignore 패턴 존재 확인 로직
2. Supabase client 생성 (service_role, SELECT-only 래퍼)
3. 4개 테이블 쿼리: themes, interest_metrics, news_metrics, lifecycle_scores
4. 테마별 데이터 병합 + 60일 미만 필터링
5. JSON 직렬화 + 파일 저장
6. 요약 로깅 (테마 수, 날짜 범위, 총 레코드)

### 4.3 Refactor Phase
- 쿼리 결과를 스트리밍으로 처리하여 메모리 최적화 (대규모 데이터 시)

## 5. Edge Cases
- EC-1: Supabase 연결 실패 → 명확한 에러 + exit(1) (PRD E1)
- EC-2: 특정 테마에 interest_metrics는 있지만 news_metrics 없음 → newsMetrics: [] 허용
- EC-3: service_role key 미설정 → 환경변수 체크 + 안내 메시지

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] AC 전부 충족
- [ ] SELECT 외 Supabase 메서드 사용하지 않음
- [ ] .gitignore 선행 체크 구현됨
