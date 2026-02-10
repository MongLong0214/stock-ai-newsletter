# 전체 아키텍처

## 기술 스택
- **Framework**: Next.js 15.5.7 (App Router, Turbopack)
- **React**: 19.1.0, TypeScript (strict mode)
- **Styling**: Tailwind CSS 4, Framer Motion, glass morphism 기반 Matrix 다크 테마
- **DB**: Supabase (PostgreSQL), RLS 활성
- **AI**: Gemini (Google Vertex AI) - 종목 분석 파이프라인
- **Email**: SendGrid, **Social**: Twitter API v2
- **Charts**: recharts (shadcn/ui chart wrapper)
- **State**: TanStack React Query v5
- **Hosting**: Vercel (Analytics, SpeedInsights 포함)
- **CI/CD**: GitHub Actions (5개 워크플로우)
- **Font**: Noto Sans KR (Google Fonts), AppleSDGothicNeo (OG 이미지용)
- **Testing**: Vitest 4.0 (132 unit tests, 10 files)

## 라우트 맵

### 페이지 라우트
| 경로 | 파일 | 렌더링 | 설명 |
|------|------|--------|------|
| `/` | app/page.tsx | Client | 메인 랜딩 (Hero, Email Preview, Theme Preview, Technical Indicators, CTA) |
| `/subscribe` | app/subscribe/page.tsx | Client | 구독 폼 (Zod 검증, 일회용 이메일 차단) |
| `/unsubscribe` | app/unsubscribe/page.tsx | Client | 구독 취소 (쿼리파라미터 email) |
| `/archive` | app/archive/page.tsx | Client | 뉴스레터 아카이브 (캘린더, 실시간 시세) |
| `/themes` | app/themes/page.tsx | Server→Client | TLI 테마 랭킹 (SSR 초기 데이터 + React Query) |
| `/themes/[id]` | app/themes/[id]/page.tsx | Server→Client | 테마 상세 (점수, 차트, 종목, 뉴스, 비교분석, 예측) |
| `/blog` | app/blog/page.tsx | Server | 블로그 목록 (Supabase에서 published 글 조회) |
| `/blog/[slug]` | app/blog/[slug]/page.tsx | Server | 블로그 상세 (MDX 파싱, TOC, FAQ, Schema.org) |
| `/about` | app/about/page.tsx | Server | 서비스 소개 |
| `/faq` | app/faq/page.tsx | Server | FAQ 아코디언 (Schema.org FAQPage) |
| `/technical-indicators` | app/technical-indicators/page.tsx | Server | 30개 기술적 지표 설명 |

### API 라우트
| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/stock/price` | GET | KIS API 실시간 주가 (최대 10개, 1분 캐시) |
| `/api/stock/daily-close` | GET | KIS API 전일 종가 |
| `/api/cron/send-newsletter` | POST | 뉴스레터 발송 (CRON_SECRET 인증) |
| `/api/cron/send-recommendations` | GET | 추천 발송 (timingSafeEqual 인증) |
| `/api/tli/themes` | GET | 활성 테마 목록 + 점수 |
| `/api/tli/themes/[id]` | GET | 테마 상세 (점수, 종목, 뉴스, 비교) |
| `/api/tli/themes/[id]/history` | GET | 30일 점수 이력 |
| `/api/tli/scores/ranking` | GET | 단계별 랭킹 (Early/Growth/Peak/Decay/Reigniting) |
| `/api/tli/stocks/[symbol]/theme` | GET | 종목이 속한 테마 목록 |

## 데이터 흐름

### 뉴스레터 파이프라인
```
prepare-newsletter.yml (07:00 KST)
  → scripts/prepare-newsletter.ts
    → Gemini AI 7단계 분석 (200→30→3 종목)
    → Supabase newsletter_content 테이블 저장

daily-newsletter.yml (07:48 KST)
  → scripts/send-newsletter.ts
    → newsletter_content에서 오늘 데이터 조회
    → SendGrid 개별 발송 (구독자별 해지 링크)
    → X(Twitter) 자동 게시 (이미지 + 텍스트)
    → newsletter_content.is_sent = true 업데이트

update-archive.yml (08:00 KST 또는 newsletter 완료 후)
  → scripts/update-archive-data.ts
    → Supabase → archives.json 정적 데이터 갱신
    → Git commit + push (자동)
```

### TLI 데이터 파이프라인
```
tli-collect-data.yml
  ├─ 장 마감 후 (평일 16:30 KST) → full 모드
  ├─ 아침 (평일 09:00 KST) → news-only 모드
  └─ 주말 (일 02:00 KST) → full 모드

full 모드 (8단계):
  0. 테마 발견 (일/수) → 네이버 금융 스크래핑 → DB 등록 → 키워드 생성 → 자동 활성화/비활성화
  1. 네이버 DataLab 관심도 수집 (30일)
  2. 네이버 뉴스 수집 (14일, 감성 분석 포함, 배치 내 중복 제거)
  3. 네이버 금융 종목 수집 (현재가, 등락률, 거래량) + 미출현 종목 자동 비활성화
  4. 라이프사이클 점수 계산 (4요소 가중합)
  5. 테마 비교 분석 (3-Pillar: feature+curve+keyword)
  6. 예측 스냅샷 (비교 기반 calculatePrediction → prediction_snapshots)
  7. 예측 평가 (14일 경과 스냅샷 vs 실제 결과)
  8. 비교 결과 검증 (궤적 상관 + 단계 일치 → comparison_calibration)

news-only 모드:
  1. 네이버 뉴스 수집만 실행
```

### 웹 데이터 흐름
```
Server Component (SSR)
  → Supabase 직접 조회 (get-ranking-server.ts)
  → HTML 렌더링 + 초기 데이터 전달

Client Component (Hydration)
  → React Query (useGetRanking, useGetThemeDetail)
  → API 라우트 호출 (/api/tli/*)
  → 캐시: short(60s), medium(300s), long(3600s)
```

## 핵심 라이브러리 구조 (lib/tli/)

### 점수/단계 판정
- `calculator.ts` — calculateLifecycleScore (4요소 가중합)
- `stage.ts` — determineStage (점수→단계)
- `reigniting.ts` — checkReigniting (재점화 감지)
- `sentiment.ts` — analyzeSentiment, aggregateSentiment
- `normalize.ts` — normalize, standardDeviation, avg, daysBetween

### 비교 분석 (lib/tli/comparison/)
- `composite.ts` — compositeCompare (3-Pillar 종합)
- `similarity.ts` — pearsonCorrelation, cosineSimilarity, zScoreEuclidean, keywordJaccard
- `timeline.ts` — normalizeTimeline, normalizeValues, findPeakDay, resampleCurve
- `features.ts` — extractFeatures, featuresToArray, classifySector

### 예측
- `prediction.ts` — calculatePrediction (서버/클라이언트 공용, today? 파라미터)
- `prediction-helpers.ts` — buildRiskMessage, buildPhaseMessage, buildKeyInsight

### 타입
- `types/db.ts` — 전체 DB 모델 인터페이스

## 외부 서비스 의존성
| 서비스 | 용도 | 인증 |
|--------|------|------|
| Supabase | PostgreSQL DB, RLS | ANON_KEY (읽기), SERVICE_ROLE_KEY (쓰기) |
| Google Vertex AI | Gemini 2.0 Flash (종목 분석) | GOOGLE_CLOUD_CREDENTIALS |
| SendGrid | 이메일 발송 | SENDGRID_API_KEY |
| KIS API | 실시간/전일 주가 | KIS_APP_KEY, KIS_APP_SECRET |
| Naver DataLab API | 검색 트렌드 | NAVER_CLIENT_ID, NAVER_CLIENT_SECRET |
| Naver Finance | 테마/종목 스크래핑 | 없음 (웹 스크래핑) |
| Naver News API | 뉴스 기사 수집 | NAVER_CLIENT_ID, NAVER_CLIENT_SECRET |
| Twitter API v2 | 자동 게시 | TWITTER_API_KEY 등 4개 |
| Vercel | 호스팅, Analytics, SpeedInsights | 자동 |

## 보안 설정
- **next.config.ts**: X-Frame-Options DENY, CSP, X-XSS-Protection, Permissions-Policy
- **CRON 인증**: timingSafeEqual로 Bearer 토큰 검증
- **RLS**: 모든 테이블 활성화 (anon=SELECT, service_role=ALL)
- **일회용 이메일 차단**: disposable-email-domains-js
- **환경변수 검증**: Zod 스키마 (lib/env.ts), 빌드 시 스킵

## 디자인 시스템
- **테마**: Matrix 다크 (bg-black, emerald-500 액센트)
- **Glass morphism**: glass-morphism CSS 클래스
- **Scanline Effect**: CSS 애니메이션 (matrix-scan)
- **애니메이션**: Framer Motion (reveal, hover, 스크롤)
- **폰트**: Noto Sans KR, font-mono (코드 느낌)
- **반응형**: mobile-first, useIsMobile 훅
- **스크롤바**: body + .custom-scroll 클래스 모두에 에메랄드 커스텀 스크롤바 (4px, transparent track)
