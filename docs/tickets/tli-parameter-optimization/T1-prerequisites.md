# T1: Prerequisites & Environment Setup

**PRD Ref**: PRD-tli-parameter-optimization > US-1, US-2
**Priority**: P1 (High)
**Size**: S (< 2h)
**Status**: Todo
**Depends On**: None

---

## 1. Objective

.gitignore 등록, Python 환경 확인, 스크립트 디렉토리 구조 생성. 모든 후속 티켓의 선행 조건.

## 2. Acceptance Criteria

- [ ] AC-1: `.gitignore`에 `scripts/tli-optimizer/historical-data.json` 패턴 등록
- [ ] AC-2: `scripts/tli-optimizer/` 디렉토리 생성
- [ ] AC-3: `scripts/tli-optimizer/requirements.txt` 생성 (`optuna>=3.0`)
- [ ] AC-4: Python 3.10+ 설치 확인 스크립트 또는 README 가이드 포함

## 3. TDD Spec (Red Phase)

### 3.1 Test Cases

| # | Test Name | Type | Description | Expected |
|---|-----------|------|-------------|----------|
| 1 | `.gitignore contains historical-data pattern` | Unit | .gitignore 파일에 패턴 존재 확인 | PASS |

### 3.2 Test File Location
- `scripts/tli-optimizer/__tests__/setup.test.ts`

### 3.3 Mock/Setup Required
- `fs.readFileSync` for .gitignore validation

## 4. Implementation Guide

### 4.1 Files to Modify
| File | Change Type | Description |
|------|------------|-------------|
| `.gitignore` | Modify | `scripts/tli-optimizer/historical-data.json` 추가 |
| `scripts/tli-optimizer/requirements.txt` | Create | `optuna>=3.0` |
| `scripts/tli-optimizer/README.md` | Create | Python 환경 설정 가이드 |

### 4.2 Implementation Steps (Green Phase)
1. `.gitignore`에 패턴 추가
2. `scripts/tli-optimizer/` 디렉토리 생성
3. `requirements.txt` 작성
4. 테스트 통과 확인

### 4.3 Refactor Phase
- N/A

## 5. Edge Cases
- EC-1: .gitignore에 이미 유사 패턴 존재 시 중복 방지

## 6. Review Checklist
- [ ] Red: 테스트 실행 → FAILED 확인됨
- [ ] Green: 테스트 실행 → PASSED 확인됨
- [ ] AC 전부 충족
- [ ] 기존 테스트 깨지지 않음
