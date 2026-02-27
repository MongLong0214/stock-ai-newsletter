# TLI 품질 게이트 v3 — 최종 설계 제안서

**생성일**: 2026-02-27
**팀**: team-quality-gate-v3 (strategist + boomer)
**Level**: 2 | **등급**: L | **Score**: 82 (보정 후 72)
**상태**: Boomer 검증 완료 — RECONSIDER → 3건 수정 후 APPROVE

---

## 요약

| 항목 | 값 |
|------|-----|
| 접근법 | Hybrid C (minScore + confidence + stage caps) |
| 현재 테마 수 | 220개 (전량 통과) |
| 적용 후 테마 수 | **70개** [SIM: 실 DB 검증] |
| 필터율 | 68.2% (150개 제거) |
| 신규 파일 | 2개 (constants/quality-gate.ts, quality-gate.ts) |
| 수정 파일 | 3개 (route.ts, get-ranking-server.ts, tli-context.ts) |
| 롤백 | `enabled: false` 1줄 변경으로 즉시 원복 |
| SEO 영향 | 없음 (상세 페이지는 is_active 기준) |

---

## 1. 접근법: Hybrid C

| 기준 | A. 점수만 | B. Cap만 | **C. Hybrid** | D. 동적 |
|------|-----------|----------|---------------|---------|
| 결과 | 75개 | 75개 | **70개** | 75개 |
| 단계 균형 | X | O | **O** | X |
| 최소 품질 보장 | O | X | **O** | O |
| 설정 유연성 | 낮음 | 높음 | **높음** | 낮음 |
| 예측 가능성 | O | O | **O** | X |

---

## 2. 설정값 (모든 수치 출처 태그 포함)

### 필터 조건 (순서대로)

| 조건 | 기준 | 필터 수 | 출처 |
|------|------|---------|------|
| stage === 'Dormant' | 제거 | 0 | [DB] |
| score <= 0 | 제거 | 0 | [DB] |
| score < 50 | 제거 | 28 | [DB: p25=53에서 -3 마진] |
| confidenceLevel === 'low' | 제거 | ~6 | [DB: score≥50인 low 중] |

### Stage Caps

| Stage | Cap | 정렬 | 근거 |
|-------|-----|------|------|
| Emerging | 12 | 오름차순 | 최저 점수 = 진짜 신규 기회 [DB/SIM] |
| Growth | 15 | 내림차순 | 상위 15개 [DB/SIM] |
| Peak | 25 | 내림차순 | 100→25로 과잉 억제 [DB/SIM] |
| Decline | 10 | 내림차순 | 상위 10개 [DB/SIM] |
| Reigniting | 8 | 내림차순 | 현재 8개 전량 [DB] |

**총 70개** = 12+15+25+10+8

---

## 3. 구현 아키텍처

```
lib/tli/constants/quality-gate.ts  ← 설정값 단일 소스 + enabled 스위치 (NEW)
lib/tli/quality-gate.ts            ← applyQualityGate 함수 (NEW)
    ↑ 사용처
    ├── route.ts               (완전 적용)
    ├── get-ranking-server.ts  (완전 적용 + confidenceLevel 추가)
    └── tli-context.ts         (minScore만 — 자체 caps가 더 엄격)
```

### constants/quality-gate.ts

```typescript
import type { Stage } from '../types'
import type { ConfidenceLevel } from '../types/db'

export const QUALITY_GATE = {
  enabled: true,
  minScore: 50,
  excludeConfidence: ['low'] as const satisfies readonly ConfidenceLevel[],
  stageCaps: {
    Emerging: 12, Growth: 15, Peak: 25, Decline: 10, Reigniting: 8,
  } satisfies Partial<Record<Stage, number>>,
} as const
```

### quality-gate.ts (핵심 로직)

```typescript
import type { ThemeListItem } from './types'
import { QUALITY_GATE } from './constants/quality-gate'

export function applyQualityGate(themes: ThemeListItem[]): {
  emerging: ThemeListItem[]
  growth: ThemeListItem[]
  peak: ThemeListItem[]
  decline: ThemeListItem[]
  reigniting: ThemeListItem[]
} {
  const { enabled, minScore, excludeConfidence, stageCaps } = QUALITY_GATE

  const emerging: ThemeListItem[] = []
  const growth: ThemeListItem[] = []
  const peak: ThemeListItem[] = []
  const decline: ThemeListItem[] = []
  const reigniting: ThemeListItem[] = []

  for (const theme of themes) {
    if (theme.stage === 'Dormant') continue
    if (theme.score <= 0) continue

    if (enabled) {
      if (theme.score < minScore) continue
      if (theme.confidenceLevel && excludeConfidence.includes(theme.confidenceLevel)) continue
    }

    if (theme.isReigniting) {
      reigniting.push(theme)
    } else {
      switch (theme.stage) {
        case 'Emerging': emerging.push(theme); break
        case 'Growth': growth.push(theme); break
        case 'Peak': peak.push(theme); break
        case 'Decline': decline.push(theme); break
      }
    }
  }

  // Emerging: 오름차순 — 낮은 점수 = 진짜 신규 기회.
  // 고점수 Emerging은 catch-all 오분류(avg 62.5 > Growth avg 49.7)이므로 의도적 제외.
  emerging.sort((a, b) => a.score - b.score)
  growth.sort((a, b) => b.score - a.score)
  peak.sort((a, b) => b.score - a.score)
  decline.sort((a, b) => b.score - a.score)
  reigniting.sort((a, b) => b.score - a.score)

  if (!enabled) {
    return { emerging, growth, peak, decline, reigniting }
  }

  const result = {
    emerging: emerging.slice(0, stageCaps.Emerging),
    growth: growth.slice(0, stageCaps.Growth),
    peak: peak.slice(0, stageCaps.Peak),
    decline: decline.slice(0, stageCaps.Decline),
    reigniting: reigniting.slice(0, stageCaps.Reigniting),
  }

  const total = result.emerging.length + result.growth.length + result.peak.length
    + result.decline.length + result.reigniting.length
  console.log(`[Quality Gate v3] 입력: ${themes.length}개 → 출력: ${total}개 (Em:${result.emerging.length}, Gr:${result.growth.length}, Pk:${result.peak.length}, Dc:${result.decline.length}, Ri:${result.reigniting.length})`)

  return result
}
```

---

## 4. 민감도 분석

### minScore ±20%

| 설정값 | -20% (40) | 제안값 (50) | +20% (60) | 판정 |
|--------|-----------|-------------|-----------|------|
| minScore 필터 후 | 210개 | 192개 | 96개 | 민감 |
| cap 적용 최종 | 70개 | 70개 | ~65개 | **cap이 완충** |

### Stage Caps ±20%

| 설정값 | -20% | 제안값 | +20% | 판정 |
|--------|------|--------|------|------|
| Em | 10 (56개) | 12 (70개) | 14 (84개) | 안정 |
| Gr | 12 (57개) | 15 (70개) | 18 (83개) | 안정 |
| Pk | 20 (57개) | 25 (70개) | 30 (83개) | 안정 |
| Dc | 8 (68개) | 10 (70개) | 12 (72개) | 안정 |
| Ri | 6 (68개) | 8 (70개) | 10 (72개) | 안정 |

---

## 5. 롤백 전략

| 방법 | 소요 | 동작 |
|------|------|------|
| `enabled: false` | 10초 | v3 필터 전체 비활성 → 기존 220개 |
| git revert | 1분 | 코드 원복 |
| Vercel 이전 배포 | 30초 | 이전 빌드로 복원 |

### 단계적 적용 (권장)

1. **Phase A** (1주): minScore=50만 → 192개
2. **Phase B** (1주): + confidence 필터 → ~186개
3. **Phase C**: + stage caps → 70개

---

## 6. SEO 영향

**피해 없음**. 상세 페이지(`/themes/[id]`)는 `is_active` 기준 → 품질 게이트와 무관.
랭킹 목록만 220→70으로 축소. 직접 URL 접근 시 220개 모두 정상 표시.

---

## 7. 모니터링

| 지표 | 정상 | 경고 | 위험 |
|------|------|------|------|
| 최종 테마 수 | 60-80 | <50 또는 >90 | <30 또는 >120 |
| stage 비율 편차 | ±30% | 1개 stage 0개 | 2개+ stage 0개 |
| minScore 필터율 | 10-20% | >30% | >50% |

---

## 8. Phase 2 진화 기준

| 조건 | 액션 |
|------|------|
| p50 ±10pt 이상 변동 | stageCaps 재산정 |
| 총 테마 300+ | minScore 55로 상향 검토 |
| stage 0개 2주 연속 | cap 하향 + 재분배 |
| Emerging 역전 해소 | 정렬 내림차순 전환 검토 |

---

## 9. Boomer 수렴 이력

| 이슈 | 심각도 | 판정 | 조치 |
|------|--------|------|------|
| BC1 단일 스냅샷 | High | 기각 | 단계적 배포가 live validation |
| BC2 Emerging 정렬 | Critical | **수용** | 오름차순 유지 + 의도 명시 주석 |
| BC3 score>=62 미비교 | High | 기각 | Stage 균형이 핵심 차별점 |
| BC4 tli-context 분리 | High | **부분 수용** | 분리 이유 주석 추가 |
| BC5 undefined + 롤백 | High | **부분 수용** | 명시적 가드 + enabled 스위치 |
| BC6 0% 오차율 | High | 기각 | DB 직접 쿼리 = 실측값 |

---

## 10. 구현 단계

| 단계 | 에이전트 | 작업 | 파일 |
|------|---------|------|------|
| 1 | backend | 설정 + 함수 생성 | `lib/tli/constants/quality-gate.ts`, `lib/tli/quality-gate.ts` |
| 2 | backend | route.ts 게이트 교체 | `app/api/tli/scores/ranking/route.ts` |
| 3 | backend | get-ranking-server.ts 교체 + confidenceLevel | `app/themes/_services/get-ranking-server.ts` |
| 4 | backend | tli-context.ts minScore 추가 | `app/blog/_services/tli-context.ts` |
| 5 | tester | 단위 테스트 | `lib/tli/__tests__/quality-gate.test.ts` |
| 6 | guardian | 리뷰 + AC 검증 | — |

**범위 외**: 점수 계산/stage 분류/DB 스키마/UI/타입 변경