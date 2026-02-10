# 데이터 파이프라인 (TLI 중심)

## 개요
TLI(Theme Lifecycle Intelligence)는 한국 주식 시장 테마의 생명주기를 추적하는 시스템.
네이버 금융/뉴스/DataLab에서 데이터를 수집하여 점수를 계산하고, 유사 테마를 비교 분석한다.

## GitHub Actions 스케줄

| 워크플로우 | 파일 | 스케줄 (KST) | 실행 내용 |
|-----------|------|-------------|----------|
| TLI Data Collection | tli-collect-data.yml | 평일 16:30, 09:00 / 일 02:00 | 데이터 수집 + 점수 계산 |
| Prepare Newsletter | prepare-newsletter.yml | 평일 07:00 | Gemini AI 분석 → DB 저장 |
| Daily Newsletter | daily-newsletter.yml | 평일 07:48 | DB → SendGrid 발송 + Twitter 게시 |
| Update Archive | update-archive.yml | 평일 08:00 또는 뉴스레터 후 | archives.json 갱신 + git push |
| Generate Blog | generate-blog-content.yml | 수동 | AI 블로그 글 생성 |
| Test Twitter | test-twitter.yml | 수동 | Twitter 게시 테스트 |
| Test Gemini Email | test-gemini-email.yml | 수동 | Gemini + 이메일 테스트 |

## TLI 수집 파이프라인 (scripts/tli/)

### 엔트리포인트: collect-and-score.ts
실행 모드: `TLI_MODE=full` (기본) 또는 `TLI_MODE=news-only`

### full 모드 파이프라인
```
0. 테마 발견 (일/수만) → discover-themes.ts
   ├─ collectNaverThemeList() → 네이버 금융 테마 목록 스크래핑
   ├─ discoverNewThemes() → DB 비교, 신규 등록 (upsert on name)
   ├─ populateKeywords() → 키워드 자동 생성 (theme-keywords.ts)
   ├─ autoActivate() → 조건 충족 테마 자동 활성화 (theme-lifecycle.ts)
   └─ autoDeactivate() → 장기 미관측 테마 비활성화

1. 네이버 DataLab 수집 → collectors/naver-datalab.ts
   ├─ 테마별 키워드 그룹으로 검색 트렌드 조회 (30일)
   ├─ 자체 max 정규화 (0-100)
   └─ upsertInterestMetrics() → interest_metrics 테이블

2. 네이버 뉴스 수집 → collectors/naver-news.ts
   ├─ 테마별 키워드로 뉴스 검색 (14일)
   ├─ 일별 기사 수 집계 → news_metrics
   ├─ 상위 10개 기사 제목/링크/출처 수집 → theme_news_articles
   ├─ HTML 태그 제거, pub_date 기반 UNIQUE 제약
   └─ (theme_id, link) 중복 제거 후 배치 upsert (ON CONFLICT 방지)

3. 네이버 금융 종목 수집 → collectors/naver-finance-themes.ts
   ├─ naver_theme_id로 테마 페이지 스크래핑
   ├─ 종목명, 현재가, 등락률, 거래량 파싱
   ├─ 시장 감지: 종목코드 '0'시작 = KOSPI, 나머지 = KOSDAQ
   ├─ upsertThemeStocks() → theme_stocks 테이블 (is_active=true)
   └─ **미출현 종목 비활성화**: upsert 후 이번 수집에 없는 기존 활성 종목을 is_active=false 처리

4. 점수 계산 → calculate-scores.ts
   ├─ 테마별 interest_metrics, news_metrics 조회
   ├─ calculateLifecycleScore() 호출 (lib/tli/calculator.ts)
   ├─ determineStage() 호출 (lib/tli/stage.ts)
   ├─ detectReigniting() 호출 (lib/tli/reigniting.ts)
   └─ lifecycle_scores 테이블 upsert

5. 비교 분석 → calculate-comparisons.ts
   ├─ 현재 테마 vs 과거 테마 (Decay/Dormant) 비교
   ├─ compositeCompare() = 3-Pillar (feature+curve+keyword)
   └─ theme_comparisons 테이블 upsert

6. 예측 스냅샷 → snapshot-predictions.ts
   ├─ 활성 테마별 theme_comparisons 로딩 (calculated_at desc, 중복 제거)
   ├─ calculatePrediction() 호출 (lib/tli/prediction.ts)
   └─ prediction_snapshots 테이블 upsert

7. 예측 평가 → evaluate-predictions.ts
   ├─ 14일 이상 경과한 pending 스냅샷 로딩
   ├─ 현재 lifecycle_scores와 비교
   ├─ phase_correct, peak_timing_error_days 계산
   └─ status='evaluated' 업데이트

8. 비교 결과 검증 → evaluate-comparisons.ts
   ├─ outcome_verified=false인 14일+ 비교 로딩
   ├─ past theme의 first_spike_date 기반 궤적 정렬
   ├─ 실제 궤적 vs 예측 궤적 pearsonCorrelation
   ├─ stage_match 판정
   └─ comparison_calibration 집계 upsert
```

### news-only 모드
2번(뉴스 수집)만 실행. 아침 뉴스 감지용.

### 독립 스크립트
- `backtest-comparisons.ts` — 비활성 테마로 threshold sweep (0.30-0.60) 실행. 수동 분석용.

## 테스트

### Vitest 설정
- `vitest.config.ts` — @/ alias, node 환경
- `pnpm test` / `pnpm test:watch`

### 테스트 파일 (10개, 132 테스트)
| 파일 | 대상 | 테스트 수 |
|------|------|----------|
| lib/tli/__tests__/normalize.test.ts | normalize, standardDeviation, avg, daysBetween | 16 |
| lib/tli/__tests__/calculator.test.ts | calculateLifecycleScore (노이즈 감지 포함) | 10 |
| lib/tli/__tests__/stage.test.ts | determineStage | 8 |
| lib/tli/__tests__/reigniting.test.ts | checkReigniting | 6 |
| lib/tli/__tests__/sentiment.test.ts | analyzeSentiment, aggregateSentiment | 10 |
| lib/tli/__tests__/similarity.test.ts | pearsonCorrelation, cosineSimilarity, zScore, jaccard | 23 |
| lib/tli/__tests__/timeline.test.ts | normalizeTimeline, normalizeValues, findPeakDay, resample | 15 |
| lib/tli/__tests__/features.test.ts | extractFeatures, featuresToArray, classifySector | 16 |
| lib/tli/__tests__/composite.test.ts | compositeCompare | 14 |
| lib/tli/__tests__/prediction.test.ts | calculatePrediction (5 phase + confidence) | 14 |

## 점수 계산 알고리즘 (lib/tli/calculator.ts)

### 입력
- interestMetrics: 최신순 정렬된 관심도 (normalized 0-100)
- newsMetrics: 최신순 정렬된 뉴스 (article_count)
- firstSpikeDate, sentimentScores, rawPercentile

### 4요소 가중합
| 요소 | 가중치 | 계산 방법 |
|------|--------|----------|
| Interest (관심도) | 40% | 7일 평균 / 30일 평균 → normalize(0.5, 3.0) * dampening |
| News Momentum | 25% | (이번주-지난주)/지난주 → normalize(-0.5, 2.0) |
| Sentiment (감성) | 20% | 뉴스 감성 점수 평균 → normalized |
| Volatility (변동성) | 15% | 7일 표준편차 → normalize(0, 50) |

### 안전장치
- **최소 데이터**: interest 3일 미만 → null (스킵)
- **뉴스 모멘텀**: 합계 < 5건 OR 지난주 = 0 → momentum = 0
- **Cross-theme percentile dampening**: 하위 20% → 0.1~1.0 감쇠
- **뉴스 dampening**: 총 3건 미만 → 0.5, 0건 → 0.2
- **노이즈 감지**: CV > 0.8 && dampening < 1 → volatility * 0.3
- **normalize() isFinite 가드**: NaN/Infinity 전파 방지
- **최종 점수 clamp**: 0-100 정수

## 단계 결정 (lib/tli/stage.ts)

| 단계 | 조건 |
|------|------|
| Peak | score >= 80 OR (score >= 60 && interest > 0.8 && (momentum > 0.7 OR sentiment > 0.7)) |
| Growth | score >= 60 |
| Early | score >= 40 |
| Decay | score >= 20 OR (score >= 10 && maturity > 0.8 && interest < 0.3) |
| Dormant | 나머지 |

maturity_ratio는 단계 판정용으로만 사용 (점수 가중합에 미반영).

## 예측 로직 (lib/tli/prediction.ts)

### 구조
- `lib/tli/prediction.ts` — 핵심 로직 (calculatePrediction). 서버/클라이언트 공용.
  - `today?: string` 파라미터로 서버에서 KST 날짜 주입 가능
- `lib/tli/prediction-helpers.ts` — UI 메시지 (buildRiskMessage, buildPhaseMessage, buildKeyInsight)
- `app/themes/[id]/_utils/calculate-prediction.ts` → lib/tli/prediction에서 re-export
- `app/themes/[id]/_utils/calculate-prediction-helpers.ts` → lib/tli/prediction-helpers에서 re-export

### 예측 결과
- phase: pre-peak | near-peak | at-peak | post-peak | declining
- confidence: high | medium | low
- riskLevel: low | moderate | high | very-high
- momentum: accelerating | stable | decelerating
- scenarios: best/median/worst (과거 테마 기반)

## 비교 분석 (lib/tli/comparison/)

### 3-Pillar 유사도
| Pillar | 가중치 | 방법 |
|--------|--------|------|
| Curve Similarity | 50% | Pearson 상관계수 (정규화된 interest 시계열) |
| Feature Similarity | 30% | 코사인 유사도 (interest_score, news_momentum 등) |
| Keyword Similarity | 20% | Jaccard 계수 (theme_keywords 집합 비교) |

- Pearson 상관: stddev < 0.01 → 스킵 (상수 시계열 방지)
- 최소 요건: 현재 테마 >= 7일 interest, 과거 테마 >= 14일
- 임계값: 0.40 이상만 유의미한 비교로 저장

## Supabase 테이블 스키마

### subscribers
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID PK | |
| email | TEXT UNIQUE | |
| name | TEXT | nullable |
| is_active | BOOLEAN | 구독 상태 |
| created_at, updated_at | TIMESTAMPTZ | |

### newsletter_content
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID PK | |
| newsletter_date | DATE UNIQUE | 발행일 |
| gemini_analysis | TEXT | JSON 문자열 (3종목 분석) |
| is_sent | BOOLEAN | 발송 여부 |
| sent_at | TIMESTAMPTZ | 발송 시각 |
| subscriber_count | INTEGER | 수신자 수 |

### blog_posts
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID PK | |
| slug | VARCHAR(255) UNIQUE | URL 경로 |
| title, description, content | TEXT | 본문 |
| target_keyword | VARCHAR(255) | 주 SEO 키워드 |
| secondary_keywords, tags | TEXT[] | 부 키워드 |
| status | ENUM (draft/published/archived) | |
| schema_data, faq_items | JSONB | Schema.org, FAQ |
| view_count | INTEGER (atomic increment) | |

### themes
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID PK | |
| name | VARCHAR(100) UNIQUE | 테마명 |
| name_en | VARCHAR(100) | 영문명 |
| naver_theme_id | VARCHAR(20) | 네이버 금융 ID |
| is_active | BOOLEAN | 활성 상태 |
| first_spike_date | DATE | 첫 급등일 |
| discovery_source | VARCHAR(30) | manual/naver_finance |
| last_seen_on_naver | DATE | 네이버 금융 최근 관측일 |
| auto_activated | BOOLEAN | 자동 활성화 여부 |

### theme_keywords
| 컬럼 | 타입 | 설명 |
|------|------|------|
| theme_id | UUID FK → themes | |
| keyword | VARCHAR(100) | |
| source | VARCHAR(20) | general/naver_datalab |
| weight | DECIMAL(3,2) | 가중치 |
| is_primary | BOOLEAN | 주요 키워드 여부 |
| UNIQUE(theme_id, keyword, source) | | |

### theme_stocks
| 컬럼 | 타입 | 설명 |
|------|------|------|
| theme_id | UUID FK → themes | |
| symbol | VARCHAR(20) | 종목코드 |
| name | VARCHAR(100) | 종목명 |
| market | VARCHAR(10) | KOSPI/KOSDAQ |
| current_price | INTEGER | 현재가 |
| price_change_pct | REAL | 등락률 |
| volume | BIGINT | 거래량 |
| is_active | BOOLEAN | 활성 여부 (미출현 시 false) |
| UNIQUE(theme_id, symbol) | | |

### interest_metrics
| 컬럼 | 타입 | 설명 |
|------|------|------|
| theme_id | UUID FK → themes | |
| time | DATE | 날짜 |
| source | VARCHAR(20) | naver_datalab |
| raw_value | INTEGER | 원시 관심도 |
| normalized | DECIMAL(5,2) | 정규화 (0-100, self-max) |
| UNIQUE(theme_id, time, source) | | |

### news_metrics
| 컬럼 | 타입 | 설명 |
|------|------|------|
| theme_id | UUID FK → themes | |
| time | DATE | |
| article_count | INTEGER | 기사 수 |
| growth_rate | DECIMAL(6,2) | 증가율 |
| UNIQUE(theme_id, time) | | |

### theme_news_articles
| 컬럼 | 타입 | 설명 |
|------|------|------|
| theme_id | UUID FK → themes | |
| title | TEXT | 기사 제목 |
| link | TEXT | 기사 URL |
| source | TEXT | 출처 |
| pub_date | DATE | 발행일 |
| sentiment_score | REAL | 감성 점수 (-1~+1) |
| UNIQUE(theme_id, link) | | |

### lifecycle_scores
| 컬럼 | 타입 | 설명 |
|------|------|------|
| theme_id | UUID FK → themes | |
| calculated_at | DATE | 계산일 (YYYY-MM-DD) |
| score | INTEGER (0-100) | 종합 점수 |
| stage | VARCHAR(20) | Peak/Growth/Early/Decay/Dormant |
| is_reigniting | BOOLEAN | 재점화 여부 |
| stage_changed | BOOLEAN | 단계 변경 여부 |
| prev_stage | VARCHAR(20) | 이전 단계 |
| components | JSONB | 점수 구성요소 상세 |
| UNIQUE(theme_id, calculated_at) | | |

### theme_comparisons
| 컬럼 | 타입 | 설명 |
|------|------|------|
| current_theme_id | UUID FK → themes | |
| past_theme_id | UUID FK → themes | |
| similarity_score | DECIMAL(4,3) | 종합 유사도 |
| feature_sim | REAL | 특성 유사도 |
| curve_sim | REAL | 곡선 유사도 |
| keyword_sim | REAL | 키워드 유사도 |
| past_peak_score | INTEGER | 과거 최고 점수 |
| past_final_stage | TEXT | 과거 최종 단계 |
| past_decline_days | INTEGER | 하락 기간 |
| outcome_verified | BOOLEAN | 결과 검증 여부 |
| trajectory_correlation | REAL | 궤적 상관계수 |
| stage_match | BOOLEAN | 단계 일치 여부 |
| verified_at | DATE | 검증일 |
| UNIQUE(current_theme_id, past_theme_id, calculated_at) | | |

### prediction_snapshots
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID PK | |
| theme_id | UUID FK → themes | |
| snapshot_date | DATE | 스냅샷 날짜 |
| comparison_count | INTEGER | 비교 수 |
| avg_similarity | REAL | 평균 유사도 |
| phase | TEXT | 예측 단계 (pre-peak/near-peak/at-peak/post-peak/declining) |
| confidence | TEXT | 신뢰도 (high/medium/low) |
| risk_level | TEXT | 위험도 |
| momentum | TEXT | 모멘텀 |
| avg_peak_day, avg_total_days, avg_days_to_peak | INTEGER | 예측 수치 |
| current_progress | REAL | 현재 진행률 |
| days_since_spike | INTEGER | 급등 후 경과일 |
| best/median/worst_scenario | JSONB | 시나리오 |
| status | TEXT | pending → evaluated |
| actual_score | INTEGER | 실제 점수 (평가 시) |
| actual_stage | TEXT | 실제 단계 (평가 시) |
| phase_correct | BOOLEAN | 단계 예측 정확도 |
| peak_timing_error_days | INTEGER | 피크 타이밍 오차 |
| evaluated_at | TIMESTAMPTZ | 평가일 |
| UNIQUE(theme_id, snapshot_date) | | |

### comparison_calibration
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID PK | |
| calculated_at | DATE UNIQUE | 계산일 |
| total_verified | INTEGER | 검증 건수 |
| avg_trajectory_corr | REAL | 평균 궤적 상관계수 |
| stage_match_rate | REAL | 단계 일치율 |
| feature/curve/keyword_corr_when_accurate | REAL | 정확 비교의 필라별 기여도 |
| feature/curve/keyword_corr_when_inaccurate | REAL | 부정확 비교의 필라별 기여도 |
| suggested_threshold | REAL | 추천 임계값 |
| suggested_sector_penalty | REAL | 추천 섹터 패널티 |
| details | JSONB | 상세 |

### email_logs
| 컬럼 | 타입 | 설명 |
|------|------|------|
| subscriber_count | INTEGER | 대상 수 |
| success_count | INTEGER | 성공 수 |
| fail_count | INTEGER | 실패 수 |
| gemini_recommendation | TEXT | 분석 내용 (5000자 제한) |

## 마이그레이션 순서
1. 001_create_newsletter_content.sql — newsletter_content
2. 002_create_blog_posts.sql — blog_posts (enum, FTS, RLS)
3. 003_create_tli_tables.sql — themes, theme_keywords, theme_stocks, interest_metrics, news_metrics, lifecycle_scores, theme_comparisons
4. 004_add_discovery_columns.sql — themes에 discovery 컬럼 추가
5. 005_add_stock_prices_and_news_articles.sql — theme_stocks 가격 컬럼 + theme_news_articles 테이블
6. 006_add_sentiment_score.sql — theme_news_articles에 sentiment_score
6b. 006_add_comparison_pillar_scores.sql — theme_comparisons에 3-pillar 컬럼
7. 007_create_prediction_snapshots.sql — prediction_snapshots 테이블
8. 008_add_comparison_outcome_tracking.sql — theme_comparisons 검증 컬럼 + comparison_calibration
