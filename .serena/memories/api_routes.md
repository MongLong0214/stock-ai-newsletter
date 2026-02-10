# API 라우트 전체 문서

## 공통 패턴

### TLI API 유틸리티 (lib/tli/api-utils.ts)
- `apiSuccess(data, metadata?, cache?)` — 성공 응답, Cache-Control 자동 설정
- `apiError(message, status)` — 에러 응답
- `placeholderResponse(emptyData)` — Supabase 미설정 시 빈 응답 반환
- `isTableNotFound(error)` — 42P01 에러 감지 (테이블 미존재 graceful fallback)
- `handleApiError(error, context)` — 콘솔 로깅 + 에러 응답
- `UUID_RE` — UUID 형식 검증 정규식
- 캐시 프리셋: short(60s), medium(300s+SWR 600s), long(3600s+SWR 1800s)

### 모든 TLI API 라우트 공통
- `export const runtime = 'nodejs'`
- Supabase placeholder 환경 체크 (빌드 시 빈 응답)
- 에러 시 한국어 메시지 반환

---

## 1. GET /api/stock/price
**파일**: app/api/stock/price/route.ts

**요청**: `?tickers=005930,000660,035420` (쉼표 구분, 최대 10개)

**응답**:
```json
{
  "success": true,
  "prices": { "005930": { "price": 75300, "change": 1.2 } },
  "failures": { "INVALID": "Not found" },
  "metadata": { "requested": 3, "success": 2, "failed": 1, "duration_ms": 450 }
}
```

**로직**:
- KIS API getBatchStockPrices() 호출
- 1분 CDN 캐시 (s-maxage=60, stale-while-revalidate=30)
- 프로덕션에서 에러 상세 숨김

---

## 2. GET /api/stock/daily-close
**파일**: app/api/stock/daily-close/route.ts

**요청**: `?tickers=KOSPI:005930&date=20241220`

**응답**: `{ "success": true, "prices": { "KOSPI:005930": 75300 } }`

**로직**: KIS API getBatchDailyClosePrices() 호출, 최대 10개

---

## 3. POST /api/cron/send-newsletter
**파일**: app/api/cron/send-newsletter/route.ts

**인증**: `Authorization: Bearer {CRON_SECRET}` (선택)

**로직**:
1. Supabase subscribers (is_active=true) 조회
2. Gemini AI 분석 실행 (getStockAnalysis)
3. SendGrid 뉴스레터 전송
4. 결과 응답

**설계 의도**: 레거시 엔드포인트. 실제 운영은 prepare→send 2단계 스크립트 사용.

---

## 4. GET /api/cron/send-recommendations
**파일**: app/api/cron/send-recommendations/route.ts

**인증**: timingSafeEqual로 Bearer 토큰 검증 (보안 강화)

**로직**:
1. 환경변수 검증 (validateEnv)
2. Gemini 추천 생성 (getGeminiRecommendation)
3. Supabase subscribers 조회
4. SendGrid 발송
5. email_logs 테이블에 기록 (성공/실패 카운트, 분석 내용 5000자)
6. 발송 실패해도 로그 기록

**설정**: `maxDuration = 300` (5분), `force-dynamic`

---

## 5. GET /api/tli/themes
**파일**: app/api/tli/themes/route.ts

**응답**: 활성 테마 목록 + 현재 점수

**로직**:
1. themes (is_active=true) 전체 조회
2. theme_stocks 활성 종목 수 배치 조회
3. lifecycle_scores 배치 조회 (70개씩 chunking, 1000행 제한 우회)
4. 7일 전 점수 별도 배치 조회
5. O(n) 인메모리 맵 (latestScoreMap, weekAgoMap, stockCountMap)
6. 결과 조합: id, name, score, stage, change7d, stockCount, isReigniting

**캐시**: long (3600s)

---

## 6. GET /api/tli/themes/[id]
**파일**: app/api/tli/themes/[id]/route.ts

**요청**: UUID 형식 검증

**응답**: 테마 상세 (점수, 종목, 뉴스, 키워드, 비교분석, 차트 데이터)

**로직**:
1. themes에서 기본 정보 + first_spike_date 조회
2. 병렬 배치 쿼리 (fetchThemeData): latestScore, 30일 scores, stocks, comparisons, news, interest, newsArticles(limit 50), keywords
3. 최신/24H전/7일전 점수 O(n) 역순 패스 파싱
4. buildComparisonResults: 유사 테마 이름 + lifecycle curve 배치 조회
5. buildThemeDetailResponse: 최종 응답 조합

**파일 분리**: fetch-theme-data.ts, build-comparisons.ts, build-response.ts

---

## 7. GET /api/tli/themes/[id]/history
**파일**: app/api/tli/themes/[id]/history/route.ts

**응답**: 30일 점수 이력 배열 `[{ date, score, stage }]`

**로직**: lifecycle_scores에서 30일 이내 데이터 ascending 조회

---

## 8. GET /api/tli/scores/ranking
**파일**: app/api/tli/scores/ranking/route.ts

**응답**: 단계별 그룹화된 랭킹
```json
{
  "early": [...], "growth": [...], "peak": [...],
  "decay": [...], "reigniting": [...],
  "summary": {
    "totalThemes", "byStage",
    "hottestTheme": { "id", "name", "score", "stage", "stockCount" },
    "surging": { "id", "name", "score", "change7d", "stage" },
    "avgScore"
  }
}
```

**로직**:
1. 활성 테마 전체 조회
2. 병렬: batchLoadStockData, batchLoadNewsCounts(7일), lifecycle_scores(90일, 10개씩 → Promise.all)
3. O(n) 맵: scoreMetaMap (latest, weekAgo, sparkline), stockCountMap, stockNamesMap, newsCountMap
4. ThemeListItem 조합 (score, stage, sparkline, newsCount7d, sentimentScore, topStocks)
5. 품질 게이트: Dormant 제거, score <= 0 제거
6. 단계별 분류: isReigniting이면 reigniting, 아니면 stage별
7. 정렬: Early 오름차순 (새로운 기회), 나머지 내림차순
8. calculateRankingSummary: hottestTheme, surging 감지

**급상승(surging) 판정 조건** (2026-02-10 수정):
- score >= 15
- stage === 'Early' || 'Growth' (Peak/Decay/Dormant 제외)
- change7d > 3
- newsCount7d >= 2
- sparkline.length >= 3
- sentimentScore >= 0.3

**캐시**: medium (300s)

**헬퍼**: ranking-helpers.ts (buildScoreMetaMap, buildCountMaps, calculateRankingSummary, batchLoadStockData, batchLoadNewsCounts)

---

## 9. GET /api/tli/stocks/[symbol]/theme
**파일**: app/api/tli/stocks/[symbol]/theme/route.ts

**응답**: 해당 종목이 속한 테마 목록 + 각 테마 점수/단계

**로직**:
1. theme_stocks에서 symbol 매칭 (is_active=true)
2. 배치 쿼리: themes 정보 + lifecycle_scores 최신 점수
3. 인메모리 조인 (themeMap, scoreMap)
4. score 내림차순 정렬

---

## 에러 처리 패턴
- 모든 catch: `handleApiError(error, '한국어 메시지')`
- Supabase 42P01: isTableNotFound → 빈 응답 반환 (500 아님)
- UUID 검증 실패: 400 + 한국어 메시지
- Placeholder 환경: 빈 데이터 + short 캐시
