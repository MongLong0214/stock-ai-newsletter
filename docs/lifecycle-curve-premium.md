# 점수추이 차트 프리미엄 고도화 — 기술 문서

> 작성일: 2026-02-18 | 브랜치: `search`
> 목표: LifecycleCurve 차트를 Bloomberg Terminal / TradingView 수준으로 고도화

---

## 1. 아키텍처 개요

```
detail-content.tsx (페이지 컨테이너)
├── DetailHeader
├── ThemePrediction
├── GlassCard (차트 영역)
│   ├── LifecycleCurveHeader ← 스탯 스트립
│   ├── LifecycleCurveControls ← 레이어 토글
│   ├── LifecycleCurveTimeRange ← 7D/14D/30D 선택
│   └── LifecycleCurve ← 메인 차트
│       ├── lifecycle-curve-data.ts ← Props, 상수, 유틸
│       ├── lifecycle-curve-elements.tsx ← SVG 서브컴포넌트
│       └── lifecycle-curve-tooltip.tsx ← 커스텀 툴팁
├── NewsHeadlines
├── CommunityBuzz
└── 3열 그리드 (ScoreCard, ComparisonList, StockList)
```

### 데이터 흐름

```
useGetThemeDetail(id)
  → ThemeDetail (API 응답)
  → useSlicedTimelines(theme, timeRange)
      → slicedCurve, slicedNews, slicedInterest, slicedCommunity, rangeDelta
  → LifecycleCurve (순수 렌더링 — 받은 데이터만 표시)
```

---

## 2. 파일 맵

| 파일 | 줄 수 | 역할 | 신규 |
|------|-------|------|------|
| `components/tli/lifecycle-curve-data.ts` | 152 | Props 인터페이스, 상수, 공용 유틸 | - |
| `components/tli/lifecycle-curve-elements.tsx` | 100 | SVG 서브컴포넌트 (ActiveDot, PeakLabel, CurrentLabel), 차트 색상 | O |
| `components/tli/lifecycle-curve.tsx` | 147 | 메인 recharts ComposedChart | - |
| `components/tli/lifecycle-curve-header.tsx` | 140 | 스탯 스트립 (점수, 변동, 스테이지, 신뢰도) | O |
| `components/tli/lifecycle-curve-time-range.tsx` | 65 | 7D/14D/30D 시간 범위 토글 + 슬라이싱 유틸 | O |
| `components/tli/lifecycle-curve-controls.tsx` | 81 | 레이어 토글 + 호버 하이라이트 | O |
| `components/tli/lifecycle-curve-tooltip.tsx` | 132 | 프리미엄 커스텀 툴팁 | - |
| `app/themes/[id]/_hooks/use-sliced-timelines.ts` | 33 | 시간 범위 슬라이싱 커스텀 훅 | O |
| `app/themes/[id]/_components/detail-content.tsx` | 177 | 페이지 컨테이너 (상태 관리 + 컴포넌트 조합) | - |

**총 1,027줄** (9개 파일, 모든 파일 200줄 이하)

---

## 3. 구현된 10가지 기능

### Phase A — 차트 내부

#### 3.1 스테이지 존 밴드 (ReferenceArea)
- Y축 0-100을 5구간으로 나눠 STAGE_CONFIG 색상으로 반투명 표시
- `STAGE_ZONES` 상수: `[{y1, y2, stage, color}]`
- 각 존 중앙에 한글 라벨 (`ZONE_LABELS`): 휴면(y=10), 하락(y=30), 초기(y=50), 성장(y=70), 정점(y=90)
- 레이어 토글로 on/off 가능 (`visibleLayers.has('zones')`)

#### 3.2 피크 어노테이션 (ReferenceDot)
- 최고점에 `ReferenceDot` + **"최고 {score}"** 라벨 (amber 색상)
- "정점"이 아닌 **"최고"** 표기 — 스테이지명 "정점"과의 혼동 방지
- 현재 위치에 **"현재 {score}"** 마커 (스테이지 색상)
- 최고점 == 현재점이면 피크 마커 숨김

#### 3.3 커스텀 Active Dot
- `AnimatedActiveDot` — 점수에 따른 스테이지 색상 글로우 링
- 3중 원: 외부 글로우(r=8) + 중간(r=5) + 코어(r=2.5)
- `scoreToStage()` → `STAGE_CONFIG[stage].color` 매핑

#### 3.4 스태거드 애니메이션
- Area: 0ms begin / 1200ms duration
- Bar (뉴스): 200ms begin / 1000ms
- Interest Line: 400ms begin / 1000ms
- Community: 600-700ms begin / 1000ms
- Comparison Lines: 800ms+ (인덱스별 200ms 간격)
- `reduceMotion` prop → 모든 duration 0

### Phase B — 헤더 + 컨트롤

#### 3.5 차트 헤더 스탯 스트립
- `LifecycleCurveHeader` 컴포넌트
- 점수: framer-motion `useSpring` 카운트업 애니메이션 (`AnimatedScore`)
- 스테이지 배지: `STAGE_CONFIG` 색상
- 24H/7D 변동: `ChangeBadge` (양수 emerald, 음수 red, 0 → "—")
- 신뢰도: `CONFIDENCE_DOT` (high=emerald, medium=amber, low=red)
- 비교 테마 수: `{n}개 비교 중`
- 구간 변동: `rangeDelta` pill 배지 (`"30일간 +12.3"`)
- 모바일: `flex-wrap` 2행 스택

#### 3.6 시간 범위 선택
- `LifecycleCurveTimeRange` — 3개 pill 토글 (7D / 14D / 30D)
- `sliceByTimeRange<T>(data, range)`: 제네릭 슬라이싱 유틸
- `calcRangeDelta(data, range)`: 구간 첫날→마지막날 점수 delta
- 차트 컴포넌트는 순수 렌더링 유지 (슬라이싱은 부모에서)

#### 3.7 구간 점수 변동
- 헤더 우측 pill 배지로 표시
- `useSlicedTimelines` 훅에서 `rangeDelta` 계산
- 데이터 2개 미만이면 null 반환

### Phase C — 인터랙션

#### 3.8 프리미엄 툴팁
- 날짜 헤더: `2/15 (토)` 형식 (요일 한글)
- 히어로 점수: 큰 숫자 + 스테이지 컬러 글로우 배경
- 전일 대비 delta: `prevScore` 필드 (mergeChartData에서 생성)
- 미니 프로그레스 바: 0-100 위치 표시
- 섹션별 지표: 뉴스(sky) / 관심도(violet) / 블로그(pink) / 토론(purple)
- 비교 테마 점수 그룹
- 스테이지 컬러 왼쪽 보더

#### 3.9 레이어 토글
- `LifecycleCurveControls` — 5개 레이어 칩
- 레이어: 스테이지 존 | 뉴스 볼륨 | 관심도 | 비교 테마 | 커뮤니티
- 클릭: 토글 on/off (`visibleLayers` Set)
- 호버: 해당 레이어만 강조, 나머지 opacity 0.12 (`layerOpacity()`)
- 커뮤니티/비교 칩은 데이터 없으면 자동 숨김

#### 3.10 커뮤니티 버즈 오버레이
- 메인 차트에 blog + discussion 두 개의 Area로 오버레이
- 각각 pink / purple 그라디언트
- 독립 CommunityBuzz 섹션과 별개로, 차트 위에서 추세 비교 가능

---

## 4. 핵심 타입 & 인터페이스

### LifecycleCurveProps
```typescript
interface LifecycleCurveProps {
  currentData: Array<{ date: string; score: number }>
  comparisonData?: Array<{ themeName: string; data: Array<{ day: number; value: number }>; similarity: number }>
  newsTimeline?: Array<{ date: string; count: number }>
  interestTimeline?: Array<{ date: string; value: number }>
  communityTimeline?: Array<{ date: string; blog: number; discussion: number }>
  height?: number           // default 350
  showZones?: boolean       // default true
  visibleLayers?: Set<LayerKey>
  hoveredLayer?: LayerKey | null
  reduceMotion?: boolean    // default false
}
```

### LayerKey
```typescript
type LayerKey = 'news' | 'interest' | 'comparison' | 'zones' | 'community'
```

### TimeRange
```typescript
type TimeRange = '7d' | '14d' | '30d'
```

---

## 5. 색상 체계

### CHART_COLORS (차트 내부)
| 키 | 색상 | 용도 |
|----|------|------|
| `currentTheme` | `#10B981` (emerald) | 현재 테마 점수 영역 |
| `peak` | `#F59E0B` (amber) | 최고점 마커 |
| `news` | `#0EA5E9` (sky) | 뉴스 볼륨 바 |
| `interest` | `#8B5CF6` (violet) | 관심도 보조선 |
| `communityBlog` | `#EC4899` (pink) | 블로그 오버레이 |
| `communityDiscussion` | `#A855F7` (purple) | 토론 오버레이 |
| `grid` | `#1e293b` | 그리드 선 |
| `axis` | `#334155` | 축 선 |
| `tick` | `#64748b` | 축 라벨 |

### 스테이지 존 색상 (STAGE_CONFIG)
| 스테이지 | 색상 | Y축 범위 |
|----------|------|---------|
| Dormant (휴면) | `#64748B` (slate) | 0-20 |
| Decline (하락) | `#F59E0B` (amber) | 20-40 |
| Emerging (초기) | `#3B82F6` (blue) | 40-60 |
| Growth (성장) | `#10B981` (emerald) | 60-80 |
| Peak (정점) | `#EF4444` (red) | 80-100 |

---

## 6. 상태 관리 (detail-content.tsx)

| 상태 | 타입 | 역할 |
|------|------|------|
| `selectedComparisons` | `number[]` | 선택된 비교 테마 인덱스 |
| `timeRange` | `TimeRange` | 시간 범위 (7d/14d/30d) |
| `visibleLayers` | `Set<LayerKey>` | 표시할 레이어 |
| `hoveredLayer` | `LayerKey \| null` | 호버 중인 레이어 (하이라이트) |

**DEFAULT_LAYERS**: `new Set(['news', 'interest', 'comparison', 'zones', 'community'])` — 모듈 스코프 (안정 참조)

---

## 7. 주요 유틸리티

### scoreToStage(score: number): DisplayStage
점수 → 스테이지 판정. 차트 + 툴팁 + SVG 컴포넌트에서 공용.
- `>= 80` → Peak, `>= 60` → Growth, `>= 40` → Emerging, `>= 20` → Decline, else → Dormant
- **정의 위치**: `lifecycle-curve-data.ts` (단일 소스)

### mergeChartData(currentData, newsTimeline?, interestTimeline?, comparisonData?, communityTimeline?)
recharts에 전달할 통합 데이터 배열 생성.
- `prevScore` 필드: 전날 점수 (툴팁 delta 표시용)
- `communityBlog` / `communityDiscussion` 필드: 커뮤니티 오버레이
- `comparison{N}` 필드: 비교 테마 (비율 기반 날짜 매핑)

### sliceByTimeRange<T>(data: T[], range: TimeRange): T[]
제네릭 타임라인 슬라이싱. `data.slice(-days)`.

### calcRangeDelta(data, range): { label, value }
구간 첫날→마지막날 점수 변동 계산.

### layerOpacity(layer, hoveredLayer, baseOpacity): number
호버 시 해당 레이어만 강조, 나머지 opacity 0.12.

### findPeak(data): { date, score } | null
데이터에서 최고점 찾기.

---

## 8. 고도화 포인트

### 추가 레이어 넣기
1. `LayerKey` 유니온에 새 키 추가
2. `LAYER_OPTIONS` (controls.tsx)에 칩 추가
3. `mergeChartData`에 데이터 병합 로직 추가
4. `lifecycle-curve.tsx`에 렌더링 추가 (Area/Line/Bar)
5. `DEFAULT_LAYERS`에 기본 활성화 여부 결정

### 시간 범위 옵션 추가 (예: 60D, 90D)
1. `OPTIONS` 배열 (time-range.tsx)에 추가: `{ value: '60d', label: '60D', days: 60 }`
2. `TimeRange` 유니온에 추가
3. `calcRangeDelta`의 `rangeLabel` 분기 추가

### 툴팁에 새 지표 추가
1. `mergeChartData`에 해당 데이터 병합
2. `CustomTooltip`에서 `payload.find(p => p.dataKey === 'newMetric')` 추출
3. `IndicatorRow` 컴포넌트로 한 줄 추가

### 새 SVG 마커/어노테이션 추가
1. `lifecycle-curve-elements.tsx`에 SVG 컴포넌트 정의
2. `lifecycle-curve.tsx`에서 import + `<ReferenceDot>` 또는 `<ReferenceLine>` label prop

---

## 9. 프로덕션 리뷰 결과

### 수정된 10가지 이슈

| # | 심각도 | 이슈 | 수정 |
|---|--------|------|------|
| 1 | Critical | `lifecycle-curve.tsx` 412줄 (200 제한 초과) | SVG 컴포넌트 → `elements.tsx`로 분리 |
| 2 | Critical | 뉴스 색상 불일치 (`#F59E0B` vs `#0EA5E9`) | `prepareChartConfig`를 `#0EA5E9`로 통일 |
| 3 | High | 죽은 코드 `findPeakDate` | 완전 삭제 |
| 4 | High | 죽은 코드 `communityTotal` | 삭제 |
| 5 | High | `scoreToStage` 중복 (tooltip + curve) | `data.ts`에 단일 소스로 통합 |
| 6 | High | `detail-content.tsx` 269줄 | `use-sliced-timelines.ts` 훅으로 추출 |
| 7 | Medium | tooltip에서 `scoreToStage` 불필요 export | 삭제, data.ts에서 import |
| 8 | Medium | `formatDateWithDay` 연말-연초 버그 | `date > now` 시 작년으로 보정 |
| 9 | Medium | `export default` 컨벤션 위반 (tooltip) | `export const CustomTooltip`으로 변경 |
| 10 | — | `Stage` vs `DisplayStage` 타입 불일치 | `DisplayStage` import 경로 수정 |

### 빌드 검증 결과
| 검사 | 결과 |
|------|------|
| `tsc --noEmit` | 0 errors |
| `eslint` | 0 errors |
| `next build` | success |
| `vitest` | 168/168 passed |

---

## 10. UX 결정 사항

### "정점" vs "최고" 표기
- **문제**: "초기" 상태 테마가 차트에서 "정점" 태그를 보여주면 혼란
- **해결**: 데이터 최고점 → **"최고"**, 스테이지명 → **"정점"** 으로 구분
- 현재 위치에는 **"현재 {score}"** 마커 추가

### 존 라벨 위치
- **이전**: 경계선(y=20/40/60/80)에 라벨 → 어떤 구간인지 모호
- **현재**: 존 중앙(y=10/30/50/70/90)에 라벨 → 명확한 소속 표시
- "하락" 구간 라벨도 추가 (이전에는 누락)

### 레이어 기본값
- 모든 레이어 기본 ON → 사용자가 필요에 따라 OFF
- 커뮤니티/비교 칩은 데이터 없으면 자동 숨김

---

## 11. 의존성

### 외부 라이브러리
- `recharts` — ComposedChart, Area, Bar, Line, ReferenceArea, ReferenceDot, ReferenceLine
- `framer-motion` — useSpring, useTransform, useReducedMotion
- `@/components/ui/chart` (shadcn) — ChartContainer, ChartTooltip, ChartConfig
- `lucide-react` — ArrowLeft, MessageCircle

### 내부 의존성
- `@/lib/tli/types/stage` — STAGE_CONFIG, DisplayStage
- `@/lib/tli/types` — Stage, ConfidenceLevel, ThemeDetail
- `@/lib/tli/constants/comparison-colors` — COMPARISON_COLORS

---

## 12. 배포 전 체크리스트

- [ ] `localhost:3000/themes/{id}` 에서 차트 시각적 확인
- [ ] 스테이지 존 밴드 + 라벨 표시 확인
- [ ] 최고점 "최고" / 현재점 "현재" 마커 확인
- [ ] 레이어 토글 (클릭 on/off, 호버 하이라이트) 확인
- [ ] 시간 범위 토글 (7D/14D/30D) 데이터 슬라이싱 확인
- [ ] 툴팁 (날짜+요일, 점수, delta, 미니바, 지표 섹션) 확인
- [ ] 커뮤니티 오버레이 (pink/purple Area) 확인
- [ ] 모바일 반응형 (헤더 스탯 스트립, 컨트롤 칩) 확인
- [ ] `prefers-reduced-motion` 시 애니메이션 비활성화 확인
