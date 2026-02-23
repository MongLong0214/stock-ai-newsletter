# 뉴스레터 시스템

## 개요
매일 평일 오전 7:30 KST (cron 07:25)에 AI 분석 종목 3개를 이메일로 발송하는 시스템.
2단계 파이프라인(준비→발송)으로 안정성 확보.

## 2단계 파이프라인

### 1단계: 준비 (07:00 KST)
**워크플로우**: prepare-newsletter.yml
**스크립트**: scripts/prepare-newsletter.ts

```
1. Gemini AI 7단계 분석 실행 (getStockAnalysis)
   → lib/llm/stock-analysis.ts → lib/llm/korea/gemini-pipeline.ts
   → 200개 종목 수집 → 30개 필터링 → 3개 선정
   → 30개 기술적 지표 수집/검증 → 7카테고리 점수 → JSON 출력

2. newsletter_content 테이블에 upsert
   → newsletter_date = KST 기준 오늘
   → gemini_analysis = JSON 문자열
   → is_sent = false
```

### 2단계: 발송 (07:25 KST)
**워크플로우**: daily-newsletter.yml
**스크립트**: scripts/send-newsletter.ts

```
1. Supabase subscribers (is_active=true) 조회
2. newsletter_content에서 오늘 날짜 + is_sent=false 조회
3. SendGrid 이메일 발송 (구독자별 개별 발송)
4. newsletter_content 업데이트 (is_sent=true, sent_at, subscriber_count)
5. X(Twitter) 자동 게시 (이미지 + 텍스트)
```

**설계 의도**: AI 분석(~40분)과 발송을 분리하여, 분석 실패 시 재시도 가능.
발송은 DB에서 준비된 콘텐츠를 읽기만 하므로 빠르고 안정적.

## 이메일 템플릿 (lib/sendgrid.ts)

### HTML 구조
```
<body style="background: #F8FAFC">
  <table max-width="640px">
    ├─ Header (bg: #0F172A)
    │   ├─ "Stock Matrix" 라벨 (emerald)
    │   ├─ "오늘의 AI 기술적 분석" 제목
    │   ├─ "기술적 지표 기반 3개 종목 분석" 부제
    │   └─ 날짜 뱃지
    │
    ├─ Content
    │   ├─ Stock Card × 3 (overall_score 내림차순)
    │   │   ├─ 종목명 + 티커 (KOSPI:XXXXXX)
    │   │   ├─ 전일 종가 (comma 포맷 + 원)
    │   │   ├─ Rationale (파이프 구분 → 블릿 목록)
    │   │   └─ 6개 시그널 점수 (색상: >=70 초록, >=40 노랑, <40 빨강)
    │   │       추세/모멘텀/거래량/변동성/패턴/심리 + 종합
    │   │
    │   └─ Disclaimer (법적 고지, bg: #FEF2F2)
    │       투자권유 금지, 매매가격 미제시, 원금손실 위험 고지
    │
    └─ Footer
        ├─ "Stock Matrix" 텍스트
        └─ 구독 취소 링크 (/unsubscribe?email=...)
  </table>
</body>
```

### 점수 색상 체계
| 범위 | 배경색 | 글자색 | 의미 |
|------|--------|--------|------|
| >= 70 | #DCFCE7 | #15803D | 강세 |
| 40-69 | #FEF3C7 | #CA8A04 | 중립 |
| < 40 | #FEE2E2 | #DC2626 | 약세 |
| 종합 >= 70 | #10B981 | #FFFFFF | 강세 (pill) |
| 종합 40-69 | #F59E0B | #FFFFFF | 중립 (pill) |
| 종합 < 40 | #EF4444 | #FFFFFF | 약세 (pill) |

### 에러 처리
- 빈 문자열/비-JSON → "서비스 준비 중입니다" 표시
- JSON 파싱 실패 → "분석 결과를 표시할 수 없습니다"
- 빈 배열 → "서비스 준비 중입니다"

## 구독/해지 플로우

### 구독 (app/subscribe/page.tsx)
```
1. 폼 입력: email (필수), name (선택)
2. Zod 검증: 이메일 형식, 일회용 이메일 차단 (disposable-email-domains-js)
3. Supabase 확인:
   ├─ 기존 구독자 → is_active=true 업데이트 (재구독)
   └─ 신규 → subscribers 테이블 INSERT
4. 성공 메시지 + 상태 리셋
```

**UI 특징**:
- 카운트다운 버튼 ("XX:XX:XX 후 메일 받기")
- Glass morphism 폼
- Framer Motion 애니메이션
- Trust signals (100% 무료, 매일 7:30, 30개 지표, 250+ 테마)

### 해지 (app/unsubscribe/page.tsx)
```
1. URL 쿼리: ?email=user@example.com
2. Zod 이메일 검증
3. Supabase: subscribers.is_active = false (UPDATE, DELETE 아님)
4. 상태별 UI: loading → success → error
5. "다시 구독" 버튼 제공
```

**설계 의도**: 이메일의 구독 취소 링크에 email 파라미터 포함.
클릭 한 번으로 즉시 해지. 데이터 삭제가 아닌 soft delete.

## 아카이브 시스템

### 데이터 갱신
**워크플로우**: update-archive.yml
**스크립트**: scripts/update-archive-data.ts

```
1. Supabase newsletter_content에서 is_sent=true 데이터 조회
2. archives.json 생성 (app/archive/_archive-data/)
3. Git commit + push (변경 시에만)
```

**트리거**: 매일 08:00 KST + newsletter 워크플로우 성공 후

### 아카이브 페이지 (app/archive/)
- 정적 JSON (archives.json)에서 데이터 로딩
- 캘린더 UI (데스크톱 사이드바 / 모바일 토글)
- 날짜 선택 → 해당 일자 뉴스레터 카드 표시
- KIS API로 실시간 주가 표시 (use-stock-prices 훅)
- 키보드 단축키 지원 (화살표 키 날짜 이동)
- 시장 시간 계산 + 공휴일 목록 (market/hours.ts, holidays.ts)

## Twitter/X 자동 게시 (lib/twitter.ts)
- 뉴스레터 발송 후 자동 실행
- 분석 결과 JSON → 이미지 생성 (lib/text-to-image.ts, Canvas)
- Twitter API v2로 이미지 + 텍스트 게시
- 실패해도 뉴스레터 발송은 성공으로 처리

## Gemini AI 파이프라인 구조

### 파일 구조
```
lib/prompts/korea/          → 7단계 프롬프트 (한국어)
lib/llm/korea/gemini-pipeline.ts → 파이프라인 실행기
lib/llm/korea/gemini.ts     → Gemini 클라이언트
lib/llm/gemini-client.ts    → 공용 Gemini 클라이언트
lib/llm/stock-analysis.ts   → 진입점 (getStockAnalysis)
lib/llm/_config/pipeline-config.ts → Stage 설정 (타임아웃, 딜레이)
```

### 7단계 요약
| Stage | 입력 | 출력 | 핵심 |
|-------|------|------|------|
| 0 | 30개 검색 쿼리 | 200개 종목 | 시총/모멘텀/자금흐름/테마 |
| 1 | 200개 | 30개 | 99% 확신 필터 |
| 2 | 30개 | 전일종가 검증 | 5개 소스 교차검증 |
| 3 | 30개 | 30개 지표 | Tier1/2/3 10개씩 |
| 4 | 지표 데이터 | 7카테고리 점수 | 과매수 필터링 |
| 5 | 점수 | 최종 3종목 JSON | 3대 검증 |
| 6 | JSON | 검증된 JSON | 배치 검색 최적화 |

### 동적 날짜 시스템 (v2.0)
- createDateContext(executionDate) 팩토리
- 모든 Stage 프롬프트가 함수 기반 (런타임 날짜 주입)
- toKoreaTime() UTC+9 직접 계산 (서버 타임존 독립)

## 환경변수 (뉴스레터 관련)
| 변수 | 용도 |
|------|------|
| SENDGRID_API_KEY | SendGrid 인증 |
| SENDGRID_FROM_EMAIL | 발신 이메일 |
| SENDGRID_FROM_NAME | 발신자 이름 |
| GOOGLE_CLOUD_PROJECT | Vertex AI 프로젝트 |
| GOOGLE_CLOUD_LOCATION | Vertex AI 리전 (us-central1) |
| GOOGLE_CLOUD_CREDENTIALS | 서비스 계정 JSON |
| CRON_SECRET | Cron 엔드포인트 인증 토큰 |
| TWITTER_API_KEY + 3개 | Twitter API v2 인증 |
