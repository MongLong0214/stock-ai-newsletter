# TLI 데이터 기반 블로그 키워드 생성 통합

> 작업일: 2026-02-13
> 브랜치: blog
> 상태: **구현 완료, 빌드/린트 통과**

---

## 배경 및 목적

### 문제
1. **SerpApi 0건 문제**: `HOOKING_TRIGGERS`가 AI에게 후킹 패턴 2개 이상 조합을 강제 → "99%가 모르는 '매입채무 회전율'로 흑자도산 100% 걸러내는 3초 판별법" 같은 60자 블로그 제목형 키워드 생성 → SerpApi 검색 결과 0건
2. **에버그린 콘텐츠 포화**: "차트 보는법", "증권사 수수료 비교" 류 교육 콘텐츠가 이미 다수 존재
3. **TLI 데이터 미활용**: 250+개 테마, 종목, 뉴스, 관심도 데이터가 블로그 키워드 생성과 완전 단절

### 해결 방향
- TLI(Theme Lifecycle Intelligence) 실시간 데이터를 AI 키워드 생성 프롬프트에 주입
- AI 자율성 70-80% 유지하되, 실제 테마명/종목명 기반 검색 가능한 키워드 생성 유도
- 테마:에버그린 = 8:2 비율로 콘텐츠 전략 전환
- SerpApi는 기존대로 유지 (검색 결과 검증 + 경쟁사 분석)

---

## 변경 파일 요약

| # | 파일 | 변경 유형 | 핵심 내용 |
|---|------|-----------|-----------|
| 1 | `app/blog/_types/content.ts` | MODIFY | `TopicArea` 타입 추가 (9개 버킷 + 'theme'), `KeywordMetadata`에 `topicArea?` 필드 추가 |
| 2 | `app/blog/_config/keyword-dictionaries.ts` | MODIFY | `CORE_TOPIC_WORDS`에 테마/종목 관련 용어 8개 추가 ('관련주', '수혜주', '대장주' 등) |
| 3 | `app/blog/_services/tli-context.ts` | **NEW** | TLI DB 데이터 조회 + 프롬프트용 포맷팅 모듈 |
| 4 | `app/blog/_prompts/keyword-prompt-constants.ts` | MODIFY | `HOOKING_TRIGGERS` → `SEARCH_QUERY_GUIDELINES` 교체, `TOPIC_BUCKETS`에 theme 버킷 추가, `FEW_SHOT_EXAMPLES` 테마 기반 6개 + 에버그린 2개로 재구성 |
| 5 | `app/blog/_prompts/keyword-generation.ts` | MODIFY | 프롬프트 전면 재설계: TLI 컨텍스트 주입, 후킹 지시 제거, 검색 쿼리 가이드라인 적용, 80% 테마 비율 강제 |
| 6 | `app/blog/_prompts/keyword-validation.ts` | MODIFY | `calculateSEOScore()`에 theme 부스트 (1.1x) 추가 |
| 7 | `app/blog/_services/keyword-generator.ts` | MODIFY | `fetchTLIContext()` 병렬 호출, 40자 키워드 길이 필터, TLI 컨텍스트 전달 |

---

## 상세 변경 내역

### 1. `app/blog/_types/content.ts`

```typescript
// 추가된 타입
export type TopicArea =
  | 'technical' | 'value' | 'strategy' | 'market'
  | 'discovery' | 'psychology' | 'education' | 'execution'
  | 'theme';  // NEW

export interface KeywordMetadata {
  // ... 기존 필드 동일
  topicArea?: TopicArea;  // NEW - AI가 생성한 주제 영역
  // ...
}
```

### 2. `app/blog/_config/keyword-dictionaries.ts`

```typescript
// CORE_TOPIC_WORDS에 추가
'관련주', '수혜주', '대장주', '테마주', '전망', '목표가', '실적', '종목분석'
```

이 단어들은 `isDuplicate()` 함수의 Jaccard 유사도 비교에서 핵심 주제어로 가중 처리됨.
예: "2차전지 관련주" vs "2차전지 수혜주" → 핵심 주제어 겹침 → 중복 판정.

### 3. `app/blog/_services/tli-context.ts` (NEW)

**핵심 함수:**

#### `fetchTLIContext(): Promise<TLIContext>`
- Supabase에서 4개 테이블 병렬 조회: `themes`, `lifecycle_scores`, `theme_stocks`, `theme_news_articles`, `theme_keywords`
- 필터: `is_active = true`, `score > 0`, `stage != 'Dormant'`, 3일 이내 점수
- 스테이지별 우선순위 + 제한:
  - Growth: 최대 5개 (최우선)
  - Reigniting: 최대 3개 (숨은 기회)
  - Early: 최대 3개
  - Peak: 최대 3개
  - Decay: 최대 1개
- 총 15개 테마 상한
- 에러 시 빈 컨텍스트 반환 (폴백: 기존 AI 자유 생성)

#### `formatTLIForPrompt(ctx: TLIContext): string`
- 스테이지별 그룹핑 후 마크다운 형식으로 출력
- 각 테마: 이름, 점수, 대표 종목 3개, 최신 뉴스 제목 2개

**출력 예시:**
```
## 현재 시장 트렌드 (TLI 실시간 데이터, 2026-02-13)

### Growth (성장 중 - 키워드 최우선)
- **2차전지** (점수: 72)
  종목: 에코프로비엠, LG에너지솔루션, 포스코퓨처엠
  최신뉴스: "2차전지 소재 수출 역대 최고"

### Reigniting (재점화 - 숨은 기회)
- **바이오** (점수: 45)
  종목: 삼성바이오로직스, 셀트리온
```

### 4. `app/blog/_prompts/keyword-prompt-constants.ts`

**제거:**
- `HOOKING_TRIGGERS` (후킹 트리거 7가지 + 조합 공식)

**추가:**
- `SEARCH_QUERY_GUIDELINES` - 검색 쿼리 가이드라인
  - 좋은 키워드 예시 6개 (실제 검색 쿼리 형태)
  - 나쁜 키워드 예시 4개 (후킹형/낚시형/비밀형/과장형)
  - 검색 쿼리 작성 규칙 5개 (40자 이내, 명사 중심 등)

**수정:**
- `TOPIC_BUCKETS`: 9번째 버킷 `theme` 추가
  - 트렌딩 테마, 테마 관련주, 종목 분석, 테마 비교
- `FEW_SHOT_EXAMPLES`: 8개 예시 중 6개를 테마 기반으로 교체
  - 테마: 2차전지 관련주 전망, AI 반도체 수혜주, SK하이닉스 HBM, 로봇 테마주, 2차전지 vs 반도체, 에코프로비엠 목표가
  - 에버그린: PER PBR 저평가 주식, 주식 손절 심리 극복

### 5. `app/blog/_prompts/keyword-generation.ts`

**시그니처 변경:**
```typescript
export function buildKeywordGenerationPrompt(
  count: number,
  usedKeywords: string[],
  competitorKeywords?: CompetitorKeyword[],
  existingTitles?: string[],
  tliContext?: TLIContext,  // NEW
): string
```

**프롬프트 구조 변경:**

| 섹션 | Before | After |
|------|--------|-------|
| `<task>` | 후킹 요소 필수 포함 | 검색 쿼리 형태, 시의성 있는 키워드 |
| `<service-context>` | 8개 topicArea, 기술적 분석 편중 금지 | 9개 topicArea (theme 추가), theme 최우선 |
| `<tli-market-context>` | 없음 | TLI 실시간 데이터 주입 (NEW) |
| `<analysis-framework>` | HOOKING_TRIGGERS 포함 | SEARCH_QUERY_GUIDELINES 포함 |
| `<constraints>` | 후킹 트리거 2개+ 조합 필수 | 40자 이내 검색 쿼리, 80% 테마 비율 |
| `<output-schema>` | topicArea에 theme 없음 | topicArea에 'theme' 포함 |

**TLI 데이터 활용 규칙 (프롬프트에 주입):**
- 전체 중 80%는 TLI 테마/종목 활용 키워드 (topicArea: "theme")
- 나머지 20%는 일반 투자 주제
- Growth/Reigniting 테마 우선 활용
- 같은 테마에서 최대 2개 키워드

### 6. `app/blog/_prompts/keyword-validation.ts`

```typescript
// calculateSEOScore() 내 추가
const themeBoost = keyword.topicArea === 'theme' ? 1.1 : 1.0;
const weightedScore = relevanceBase * intentWeight * difficultyWeight * volumeWeight * themeBoost;
```

테마 기반 키워드가 SEO 점수에서 10% 가산점을 받아 우선 선택됨.

### 7. `app/blog/_services/keyword-generator.ts`

**병렬 데이터 조회:**
```typescript
const [usedContent, tliContext] = await Promise.all([
  getUsedContent(),
  fetchTLIContext(),  // NEW - TLI 데이터 병렬 조회
]);
```

**40자 키워드 필터 추가:**
```typescript
if (kw.keyword.length > 40) continue;  // 블로그 제목형 키워드 차단
```

**TLI 컨텍스트 전달:**
```typescript
const newKeywords = await generateKeywordsWithAI(
  Math.ceil(remainingCount * 1.5),
  usedContent.keywords,
  usedContent.titles,
  tliContext,  // NEW
);
```

---

## 데이터 흐름 (Before → After)

### Before
```
generateKeywords()
  → getUsedContent() (blog_posts 조회)
  → buildKeywordGenerationPrompt(count, usedKw, _, titles)
    → HOOKING_TRIGGERS 적용 → 후킹형 60자 키워드 생성
  → SerpApi 검색 → 0건 (검색 불가능한 키워드)
```

### After
```
generateKeywords()
  → [getUsedContent(), fetchTLIContext()] (병렬)
    → blog_posts + themes/scores/stocks/news/keywords
  → buildKeywordGenerationPrompt(count, usedKw, _, titles, tliContext)
    → TLI 실시간 데이터 주입 + SEARCH_QUERY_GUIDELINES
    → 실제 테마명/종목명 기반 검색 쿼리 생성
  → 40자 필터 + 중복 제거 + SEO 점수 (theme 부스트)
  → SerpApi 검색 → 정상 결과 반환
```

---

## 예상 키워드 변화

### Before (HOOKING_TRIGGERS)
- "99%가 모르는 '매입채무 회전율'로 흑자도산 100% 걸러내는 3초 판별법"
- "프로만 아는 이동평균선 함정 3가지"
- "90%가 모르는 RSI 함정 3가지"

### After (TLI + SEARCH_QUERY_GUIDELINES)
- "2차전지 관련주 전망 2026"
- "SK하이닉스 HBM 실적 분석"
- "AI 반도체 수혜주 대장주 정리"
- "에코프로비엠 목표가"
- "로봇 테마주 관련주 추천 2026"

---

## 아직 미처리된 이슈

### 1. 마크다운 `**bold**` 렌더링 (미처리)
- 블로그 본문에 `**어쩌구**` 마크다운 문법이 그대로 출력되는 문제
- `seo-guidelines.ts`에 금지 규칙 추가 + `markdown-parser.ts`에 후처리 regex 필요
- 이전 세션에서 수정했으나 사용자가 revert함
- **별도 작업 필요**

### 2. 테스트 (미실행)
- TLI 데이터가 실제 Supabase에 있어야 E2E 검증 가능
- 로컬에서 `generateKeywords()` 호출하여 생성된 키워드 품질 확인 필요
- SerpApi로 생성된 키워드 검색 시 결과 반환 여부 확인 필요

---

## 빌드 상태
- **TypeScript**: `npx tsc --noEmit` 통과
- **ESLint**: 7개 파일 모두 통과
- **런타임 테스트**: 미실행 (Supabase 연동 필요)

---

## 참고: TLI DB 스키마

| 테이블 | 주요 컬럼 | 용도 |
|--------|-----------|------|
| `themes` | id, name, is_active | 테마 목록 |
| `lifecycle_scores` | theme_id, score, stage, is_reigniting, calculated_at | 라이프사이클 점수 |
| `theme_stocks` | theme_id, name, symbol, relevance, is_active | 테마별 종목 |
| `theme_news_articles` | theme_id, title, pub_date | 테마별 뉴스 |
| `theme_keywords` | theme_id, keyword, is_primary | 테마별 키워드 |

### Stage 우선순위
1. **Growth** (상승 중) → 키워드 최우선
2. **Reigniting** (재점화) → 숨은 기회
3. **Early** (초기 포착) → 선점 기회
4. **Peak** (최고조) → 검색량 높음
5. **Decay** (하락세) → 제한적 사용

### 가중치 (TLI 점수 계산)
- interest: 0.50, newsMomentum: 0.30, volatility: 0.20
