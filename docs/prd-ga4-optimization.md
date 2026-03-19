# PRD: StockMatrix GA4 분석 기반 사용자 경험 & 전환 최적화

> **작성**: team-ga4-optimization (strategist + frontend + domain + boomer)
> **날짜**: 2026-03-19
> **GA4 분석 기간**: 2026-03-13 ~ 2026-03-17 (5일)
> **상태**: FINAL — Boomer 검증 완료 (PROCEED_WITH_CAUTION)

---

## Boomer 검증 결과 요약

> **판정**: PROCEED_WITH_CAUTION
> **검증 도구**: Codex CLI (gpt-5.4, xhigh reasoning)

### 핵심 반론 3건 (반영됨)

| # | 반론 | 대응 |
|---|------|------|
| BC1 | `send_page_view:false`를 단일 원인으로 특정했으나 네트워크/타이밍 변수 미검증. P0 후에도 30~50% 미발화 가능성 | DebugView 검증 48시간→**1주 확대**, PV 95% 미달 시 에스컬레이션 |
| BC2 | BFCache 복원 시 send_page_view:true + pageshow → page_view 중복 발화 리스크 | RouteTracker skip 조건 + **중복 제거 플래그** 스펙 추가 (R1.2) |
| BC6 | R2.6(Level 2) 메타 변경 구체안 부재 — 승인 판단 근거 없음 | Phase 2 진행 전 **메타 백업 + 기존 vs 신규 비교표** Isaac에게 사전 제출 |

### 재조정 사항 (반영됨)

| 항목 | 기존 | 재조정 |
|------|------|--------|
| 일정 | 8~11일 | **2.5주** (Phase 검증 기간 포함) |
| R2.6 vs R2.2 순서 | 동시 | R2.6(메타) 먼저 → 효과 가시화 1~2주 → R2.2(Hero) |
| AI 챗봇 분류 | P3 (Low) | **P2+ (Medium)** 상향 — engagement 최상급 |
| CTA 전환율 8% 목표 | 확정 | **가설** — A/B 테스트 설계 필요 |
| 재방문율 10% 목표 | 확정 | **가설** — 신규 획득 증가 후 자연 증가 관찰 먼저 |

### 진행 게이트 3개

| 게이트 | 담당 | 기준 | 충족 시 |
|--------|------|------|---------|
| GA1 | frontend | PV 발화율 95%+, (not set) <10% (1주 검증) | Phase 2 진행 |
| GA2 | domain + Isaac | R2.6 메타 변경안 + 백업 + Isaac 승인 | R2.6 착수 |
| GA3 | strategist | P1 A/B 실험 설계 (가설/MDE/샘플수) | Hero 변경 착수 |

### 확신도 매트릭스

| KPI | 현재 → 목표 | 확신도 |
|-----|------------|--------|
| page_view 발화율 58%→95% | 높음 (P0만으로 달성 가능) |
| 이탈률 82%→60% | 중간 (P0+P1 모두 성공 필요) |
| CTA 전환율 4.4%→8% | 낮음 (A/B 결과 의존) |
| 재방문율 5%→10% | 낮음 (신규 증가 선행 필요) |

---

## Executive Summary

StockMatrix GA4 5일 데이터 분석 결과, **88%의 세션에서 page_view 이벤트가 미발화**되어 분석 데이터 자체가 신뢰할 수 없는 상태다. `send_page_view: false` 설정 + hydration 후 수동 발화 구조가 근본 원인이다. 이 측정 오류를 최우선 해결한 뒤, 네이버 검색 유입 이탈률 89%, 재방문율 5%, 전환율 4.4%를 단계적으로 개선한다.

**목표**: 측정 정상화(P0) → 첫인상 개선(P1) → 리텐션 구축(P2) → 성장 채널 확보(P3)

---

## Problem Statement

### P0 — GA4 측정 인프라 장애 (Critical)

**현상**: 432세션 중 380세션(88%)의 landing_page가 `(not set)`. PV 252건(세션 대비 58%).

**근본 원인 (코드 검증 완료)**:

```
google-analytics.tsx
  └─ Script strategy="afterInteractive"          ← gtag 로딩 지연
  └─ gtag('config', ..., { send_page_view: false })  ← 자동 page_view 비활성화

ga4-route-tracker.tsx (Client Component)
  └─ useEffect → pageview(path)                  ← hydration 완료 후에만 실행

lib/analytics/ga.ts > pageview()
  └─ waitForGtag(5000ms)                         ← 200ms 간격 폴링, 최대 5초 대기
```

**문제 체인**: Script afterInteractive → hydration 대기 → useEffect 실행 → waitForGtag 폴링 → **총 지연 2~8초**. 이 창 안에 이탈하면 page_view 0건.

**추가 원인** (frontend 분석):
- Hero 섹션 `initial={{ opacity: 0 }}` → 첫 0.8초 검은 화면 → 이탈 가속
- AnimatedBackground `mounted=false`면 null 반환 → SSR HTML에 빈 shell만 전달
- `window.history.scrollRestoration = 'manual'` → 뒤로가기 시 스크롤 위치 유실 → BFCache 복원 시 useEffect 미발동 → page_view 미기록

**영향**: 현재 이탈률 82%, 체류 53초는 **실제보다 나빠 보이는 편향 데이터**. 실제 PV 발생 페이지: 이탈률 0~27%.

### P1 — 네이버 검색 유입 이탈 (High)

**현상**: 네이버 유입 289명(70%), 이탈률 89~92%, 체류 7~20초.

| 소스 | 사용자 | 이탈률 | 체류 | 비고 |
|------|--------|--------|------|------|
| m.search.naver.com | 214 | 90% | 20초 | 모바일 검색 |
| naver organic | 75 | 92% | **7초** | 데스크톱 |
| google organic | 17 | 89% | **4초** | 거의 즉시 이탈 |
| bing organic | 42 | 81% | **141초** | 양질 (참조점) |

**UX 원인** (frontend 분석):
1. `HomePageClient`가 `'use client'` 전체 → SSR HTML에 빈 shell → hydration → 모바일 LCP 2~4초
2. Hero 애니메이션 `initial={{ opacity: 0 }}` → 첫 0.8초 텍스트 불가시
3. 모바일 Parallax (y:400, scale:0.85, blur:10) → 스크롤 시 의도치 않은 blur + shrink
4. CTA 카피 "{카운트다운} 후 메일 받기" — 처음 방문자에게 무엇을 받는지 불명확

**SEO 원인** (domain 분석):
1. 홈 description "무료 AI 주식 분석 뉴스레터..." — 서비스 소개형, 즉각적 가치 전달 부재
2. 키워드-콘텐츠 불일치: 70개 키워드가 정보탐색형(Informational)이나, 네이버 모바일 검색자 의도는 즉시해결형(Transactional)
3. IPO 블로그 글: 사용자 20명, PV 2, 체류 5초, 이탈 91% — 제목 낚시 or 콘텐츠 부실
4. 테마 페이지 meta에 '오늘', '실시간' 등 긴급성 신호 미포함

**참고**: 실제 PV 발생 페이지들(/themes 이탈률 0%, /subscribe 0%, /archive 22%)은 매우 양호 → **올바른 페이지에 도착한 사용자는 이탈하지 않는다**.

### P2 — 리텐션 부재 (Medium)

| 지표 | 신규 (400명) | 재방문 (21명) | 배율 |
|------|-------------|-------------|------|
| 이탈률 | 84% | 50% | 1.7x |
| 체류시간 | 42초 | 226초 | **5.4x** |
| 세션당 PV | 0.47 | 2.29 | **4.9x** |

**전환 퍼널**: 세션 432 → CTA 클릭 19(4.4%) → 폼시작 12(63%) → 제출 12(**100%**) → 리드 12건.
폼 UX는 완벽. 병목은 **세션→CTA 4.4%** (73%가 스크롤조차 안 함).

**리텐션 메커니즘 부재**: PWA manifest는 있지만 Service Worker 없음. 푸시 알림 불가. 이메일 뉴스레터만이 유일한 재방문 경로.

### P3 — 성장 기회 (Low)

- **AI 챗봇 유입 12세션**: engagement 최상급 (copilot 5, chatgpt 3, perplexity 2, gemini 1, claude 1)
- **Bing 42명, 체류 141초**: 양질 트래픽. IndexNow 구현 있으나 INDEXNOW_KEY 환경변수 미확인
- **퇴근 시간대(17~19시) 피크 22%**: 콘텐츠 타이밍 기회
- **robots.ts**: 14개 AI 봇 명시적 허용 — 이미 양호
- **/themes 체류 175~570초**: 깊이 있는 콘텐츠 수요 확인

---

## Goals & Success Metrics

| 목표 | 현재 | Phase 1 (4주) | Phase 2 (8주) | 측정 |
|------|------|--------------|--------------|------|
| page_view 발화율 | 58% | **95%+** | 99%+ | GA4 세션 vs PV |
| (not set) 랜딩 비율 | 88% | **<10%** | <5% | GA4 Landing Page |
| 전체 이탈률 | 82% (편향) | 60% (실제) | 50% | GA4 bounce rate |
| 네이버 유입 이탈률 | 89% | 70% | 60% | GA4 소스별 |
| 세션→CTA 전환율 | 4.4% | 8% | 12% | GA4 이벤트 |
| 재방문율 | 5% | 10% | 15% | GA4 신규 vs 재방문 |
| 평균 체류시간 | 53초 (편향) | 90초 | 120초 | GA4 engagement |

---

## User Stories

**US-1 (검색 유입)**: "네이버에서 '주식 테마 분석'을 검색해 StockMatrix에 도착했을 때, 3초 안에 이 사이트가 뭘 하는 곳인지 이해하고, 관심 있는 테마를 바로 탐색할 수 있어야 한다."

**US-2 (첫 방문→구독)**: "홈페이지에서 오늘의 테마 랭킹과 샘플 뉴스레터를 보고, '매일 아침 이걸 받아보고 싶다'는 판단을 30초 안에 내릴 수 있어야 한다."

**US-3 (구독자 재방문)**: "뉴스레터를 받은 후, 이메일의 '더보기' 링크를 통해 /themes에서 오늘의 전체 테마 랭킹을 확인하는 것이 자연스러운 루틴이어야 한다."

**US-4 (AI 챗봇 유입)**: "ChatGPT/Perplexity에서 '한국 주식 테마 분석'을 질문했을 때, StockMatrix가 참조 소스로 나타나고, 방문 시 바로 가치를 느끼게 해야 한다."

---

## Requirements

### R1: GA4 측정 정상화 [P0]

| ID | 피처 | Size | Impact | Effort | Level |
|----|------|------|--------|--------|-------|
| R1.1 | gtag 초기 page_view 자동 발화 복원 | **S** | **High** | **Low** | 0 |
| R1.2 | dataLayer 큐잉 + BFCache 대응 | **S** | **High** | **Low** | 0 |
| R1.3 | GA4 디버그 검증 (48시간 모니터링) | **S** | **Med** | **Low** | 0 |

#### R1.1 — gtag 초기 page_view 자동 발화 복원

**해결**:
1. `google-analytics.tsx`: `send_page_view: false` → `send_page_view: true`
2. `ga4-route-tracker.tsx`: 초기 로드 시 skip (중복 방지), SPA 내비게이션만 담당
3. Script strategy `afterInteractive` 유지 (beforeInteractive는 CWV 악화)

**영향 파일**:
- `components/analytics/google-analytics.tsx`
- `components/analytics/ga4-route-tracker.tsx`
- `lib/analytics/ga.ts`

**AC**:
- [ ] 첫 페이지 로드 시 GA4 page_view 1초 이내 발화
- [ ] SPA 내비게이션 시 page_view 정확히 1회 발화
- [ ] page_view 중복 발화 없음 (DebugView 검증)
- [ ] Core Web Vitals 변화 없음

#### R1.2 — dataLayer 큐잉 + BFCache 대응

**해결**:
1. gtag 로드 전 `window.dataLayer.push`로 page_view 큐잉
2. `document.addEventListener('visibilitychange')` + `pageshow` 이벤트로 BFCache 복원 시 재발화
3. `waitForGtag` 타임아웃 5초→3초, 폴링 간격 200ms→100ms

**영향 파일**: `lib/analytics/ga.ts`

**AC**:
- [ ] 네이버 뒤로가기 → 재방문 시 page_view 발화
- [ ] gtag 미로드 상태에서 이벤트 큐잉 동작

#### R1.3 — GA4 디버그 검증

배포 후 48시간 GA4 Realtime 모니터링. 기존 `debug_mode` 설정 활용.

**AC**:
- [ ] (not set) 랜딩 비율 10% 이하
- [ ] PV 발화율 95%+

---

### R2: 첫인상 최적화 [P1]

| ID | 피처 | Size | Impact | Effort | Level |
|----|------|------|--------|--------|-------|
| R2.1 | Hero 렌더링 최적화 (즉시 가시화) | **S** | **High** | **Low** | 0 |
| R2.2 | Hero Value Proposition + 실시간 테마 | **M** | **High** | **Med** | 1 |
| R2.3 | 모바일 UX 개선 (Parallax 비활성, scrollRestoration) | **S** | **Med** | **Low** | 0 |
| R2.4 | CTA 카피 구체화 | **S** | **Med** | **Low** | 0 |
| R2.5 | 스크롤 유도 + depth 추적 | **M** | **Med** | **Med** | 1 |
| R2.6 | 검색 의도별 랜딩 최적화 | **L** | **High** | **High** | **2** |
| R2.7 | 문제 블로그 콘텐츠 정비 | **S** | **Med** | **Low** | 0 |

#### R2.1 — Hero 렌더링 즉시 가시화

**문제**: `initial={{ opacity: 0 }}` → 0.8초 검은 화면 + AnimatedBackground `mounted=false` → null

**해결**:
1. Hero 텍스트 `initial={{ opacity: 1 }}` 또는 initial 제거 → SSR 즉시 표시
2. AnimatedBackground를 `next/dynamic` lazy loading + 정적 dark background placeholder
3. 기대: FCP/LCP 1~2초 단축

**영향 파일**:
- `app/_components/home/hero-section.tsx`
- `components/animated-background.tsx`
- `app/_components/home/home-page-client.tsx`

**AC**:
- [ ] 페이지 로드 시 Hero 텍스트가 0초에 가시
- [ ] AnimatedBackground 로드 전 dark background placeholder 표시
- [ ] CLS 0 유지

#### R2.2 — Hero Value Proposition + 실시간 테마

**문제**: 73%가 스크롤 없이 이탈. Above-the-fold에서 즉각적 가치 전달 부재.

**해결**:
1. Hero에 "오늘의 핫 테마" 1~2개 실시간 표시 (데이터: /api/tli/scores/ranking)
2. 사회적 증거: 구독자 수, 분석 테마 수 배치
3. "AI가 분석한 기술적 지표 데이터" → 구체적 가치 메시지로 변경

**AC**:
- [ ] 모바일/데스크톱에서 스크롤 없이 (a) 핵심 가치, (b) 오늘 테마 미리보기, (c) CTA 모두 가시
- [ ] Hero skeleton/placeholder로 CLS 0

#### R2.3 — 모바일 UX 개선

**해결**:
1. `useIsMobile()` → 모바일에서 Parallax scale/blur 비활성
2. `window.history.scrollRestoration = 'manual'` 제거 → 뒤로가기 스크롤 복원 허용

**영향 파일**:
- `app/_components/home/hero-section.tsx` (parallax 조건부)
- 관련 scrollRestoration 설정 파일

**AC**:
- [ ] 모바일 스크롤 시 blur/shrink 효과 없음
- [ ] 네이버→사이트→뒤로가기 시 스크롤 위치 복원

#### R2.4 — CTA 카피 구체화

"{카운트다운} 후 메일 받기" → "무료 구독 — 매일 아침 3종목 AI 분석"

**AC**: CTA 버튼 카피가 서비스 가치를 명확히 전달

#### R2.5 — 스크롤 유도 + scroll depth 추적

**해결**:
1. GA4 scroll depth 이벤트 (25/50/75/100%) 추가
2. Hero 하단에 subtle 스크롤 유도 indicator

**AC**:
- [ ] GA4에서 scroll_depth 이벤트 추적됨
- [ ] 25% 스크롤 도달률 30%+ (2주 측정)

#### R2.6 — 검색 의도별 랜딩 최적화 [Level 2 — Isaac 승인 필요]

**해결**:
1. /themes 메타: "오늘 테마주 순위 — AI 실시간 생명주기 분석" (긴급성 신호 추가)
2. /subscribe 메타: 뉴스레터 키워드 직접 랜딩 강화
3. 홈 description에 테마 즉시 가치 추가 (기존 descriptionShort 활용)

**AC**:
- [ ] "주식 테마" 관련 검색어로 /themes 직접 노출
- [ ] 각 주요 랜딩 페이지에 검색 의도 매칭 콘텐츠 우선 배치

#### R2.7 — 문제 블로그 콘텐츠 정비

**문제**: IPO 글 (사용자 20, PV 2, 체류 5초, 이탈 91%)

**해결**:
1. 이탈 91%+ 블로그 글 → `robots: { index: false }` 처리 후 콘텐츠 개선 시 재활성화
2. 블로그 description 품질 기준: 150자 이상, 구체적 데이터(날짜, 종목명, 수치) 포함

**AC**:
- [ ] 이탈률 90%+ 블로그 글 noindex 처리
- [ ] description 품질 기준 문서화

---

### R3: 리텐션 파이프라인 [P2]

| ID | 피처 | Size | Impact | Effort | Level |
|----|------|------|--------|--------|-------|
| R3.1 | 뉴스레터 → 웹 재방문 딥링크 (UTM) | **S** | **High** | **Low** | 0 |
| R3.2 | 구독 완료 → 온보딩 흐름 | **M** | **Med** | **Med** | 1 |
| R3.3 | /archive 충성 유저 경험 강화 | **M** | **Med** | **Med** | 1 |
| R3.4 | Sticky 모바일 CTA | **S** | **High** | **Low** | 0 |

#### R3.1 — 뉴스레터 → 웹 재방문 딥링크

이메일 하단에 "오늘의 테마 전체 랭킹 보기" → `/themes?utm_source=newsletter&utm_medium=email&utm_campaign=daily`

**영향 파일**: `lib/sendgrid.ts` (이메일 템플릿)

**AC**:
- [ ] 뉴스레터에 /themes, /archive 딥링크 포함 (UTM)
- [ ] GA4에서 utm_source=newsletter 세션 추적 가능

#### R3.2 — 구독 완료 → 온보딩

구독 완료 후 Thank-you 화면: "내일 아침 7:30에 첫 뉴스레터가 도착합니다. 그동안 오늘의 테마 랭킹을 확인해보세요."

**AC**:
- [ ] 구독 완료 시 /themes, /archive 유도 화면 표시
- [ ] GA4 post_subscribe_navigation 이벤트 추적

#### R3.3 — /archive 충성 유저 경험 강화

1. 뉴스레터 카드에서 해당 종목의 테마 상세 페이지 크로스 링크
2. 비구독자에게 inline 구독 CTA

**AC**:
- [ ] /archive 카드에서 관련 테마 링크 표시
- [ ] 비구독자에게 subtle 구독 CTA 표시

#### R3.4 — Sticky 모바일 CTA

모바일에서 스크롤 시 하단 고정 CTA 바. 상시 노출.

**AC**:
- [ ] 모바일에서 구독 CTA가 하단 고정
- [ ] 기존 CTA와 중복 시 기존 숨김 처리

---

### R4: 성장 채널 확보 [P3]

| ID | 피처 | Size | Impact | Effort | Level |
|----|------|------|--------|--------|-------|
| R4.1 | AI 챗봇 최적화 (Schema 강화) | **S** | **Med** | **Low** | 0 |
| R4.2 | Bing SEO + IndexNow 활성화 | **S** | **Med** | **Low** | 0 |
| R4.3 | 테마↔블로그 내부 크로스링크 | **S** | **Med** | **Low** | 1 |

#### R4.1 — AI 챗봇 최적화

1. JSON-LD에 `speakable` 프로퍼티 추가
2. 테마 상세에 `FinancialProduct` 또는 `Dataset` Schema 추가 (점수, 단계, 상위 종목)
3. 블로그 글 상단에 Summary 섹션 (AI 인용 최적화 "X는 Y입니다" 패턴)

**AC**:
- [ ] speakable 마크업 추가
- [ ] 테마 상세 Schema에 점수/단계 구조화 데이터

#### R4.2 — Bing SEO + IndexNow 활성화

1. INDEXNOW_KEY 환경변수 설정 확인 (silent skip 방지)
2. Bing Webmaster Tools 등록 + meta 태그
3. 테마 데이터 갱신 시 IndexNow ping 정상 동작 확인

**AC**:
- [ ] INDEXNOW_KEY 설정 완료
- [ ] Bing WMT 등록 + 크롤링 확인

#### R4.3 — 테마↔블로그 내부 크로스링크

테마 상세 페이지 내 "관련 블로그 글" 섹션. 현재 없음.

**AC**:
- [ ] /themes/[id]에서 관련 블로그 글 링크 표시

---

## Implementation Phases (Boomer 재조정 반영)

### Phase 1: 측정 정상화 (1주 구현 + 1주 검증 = 2주) — P0

| 단계 | 에이전트 | 작업 | Size |
|------|---------|------|------|
| 1 | frontend | R1.1 send_page_view:true + RouteTracker skip 조건 명시 + 중복 방지 플래그 | S |
| 2 | frontend | R1.2 dataLayer 큐잉 + BFCache pageshow 대응 + 큐 상한선 정의 | S |
| 3 | — | R1.3 GA4 DebugView **1주 모니터링** (48시간→확대) | S |

**Gate GA1**: (not set) <10%, PV 발화율 >95% → Phase 2 진행. **미달 시 에스컬레이션.**

### Phase 2: 첫인상 개선 (2주) — P1

> Phase 1 GA1 게이트 통과 후 시작. R2.6은 GA2+GA3 게이트 별도.

| 단계 | 에이전트 | 작업 | Size | 비고 |
|------|---------|------|------|------|
| 4 | domain | R2.6 메타 변경안 초안 + 기존 백업 → Isaac 제출 | L | **GA2: Isaac 승인 대기** |
| 5 | domain | R2.7 문제 블로그 noindex + description 기준 | S | GA2와 병렬 |
| 6 | frontend | R2.1 Hero 즉시 가시화 + AnimatedBackground lazy | S | 병렬 |
| 7 | frontend | R2.3 모바일 Parallax 비활성 + scrollRestoration | S | 병렬 |
| 8 | frontend | R2.4 CTA 카피 구체화 | S | 병렬 |
| 9 | frontend | R2.5 scroll depth 추적 + 스크롤 유도 | M | |
| 10 | strategist | **GA3: A/B 실험 설계** (가설/MDE/샘플수) | — | Hero 변경 전 필수 |
| 11 | frontend | R2.2 Hero Value Prop + 실시간 테마 | M | GA3 통과 후 |
| 12 | domain | R2.6 메타 변경 실행 | L | **GA2 Isaac 승인 후** |

**Gate**: 25% 스크롤 도달률 30%+, 네이버 이탈률 70% 이하 (2주 측정)

### Phase 3: 리텐션 + 성장 (2주) — P2+P3 (병렬)

| 단계 | 에이전트 | 작업 | Size |
|------|---------|------|------|
| 13 | backend | R3.1 뉴스레터 UTM 딥링크 | S |
| 14 | frontend | R3.4 Sticky 모바일 CTA | S |
| 15 | frontend | R3.2 구독 온보딩 Thank-you | M |
| 16 | frontend | R3.3 /archive 크로스링크 + CTA | M |
| 17 | domain | R4.1 AI 챗봇 Schema 강화 (**P2+ 상향**) | S |
| 18 | domain | R4.2 Bing + IndexNow 활성화 | S |
| 19 | domain | R4.3 테마↔블로그 크로스링크 | S |

**Gate**: utm_source=newsletter 추적 가능, 재방문율 관찰 (목표는 가설 — 신규 증가 후 자연 추이 관찰)

---

## Risk Assessment

| 리스크 | 확률 | 영향 | 완화 |
|--------|------|------|------|
| send_page_view:true → page_view 중복 | 중 | 중 | RouteTracker 초기 로드 skip + DebugView 검증 |
| Script strategy 변경 → CWV 악화 | 저 | 고 | afterInteractive 유지, send_page_view:true 조합 |
| Hero 변경 → 기존 디자인 훼손 | 중 | 중 | Isaac 디자인 선호도 준수 (과한 효과 금지, 깔끔 최소한) |
| SEO meta 변경 → 기존 랭킹 하락 | 저 | 고 | 점진적 변경, Search Console 모니터링, meta 백업 |
| P0 해결 후 실제 이탈률 여전히 높음 | 중 | 중 | Phase 2(첫인상)로 대응 |
| 문제 블로그 noindex → 트래픽 감소 | 저 | 저 | 이미 이탈 91% — 부정 신호 제거가 이득 |

---

## HGP 등급 분석

| 피처 | 등급 | Level | 비고 |
|------|------|-------|------|
| R1.1~R1.3 | S x3 | 0 | 기존 파일 수정, 기존 패턴 |
| R2.1, R2.3, R2.4, R2.7 | S x4 | 0 | UI 미세 조정 |
| R2.2, R2.5 | M x2 | 1 | API 연동 + GA4 이벤트 추가 |
| **R2.6** | **L** | **2** | **복수 페이지 SEO 변경 — Isaac 승인 필수** |
| R3.1, R3.4 | S x2 | 0 | 이메일 템플릿 + CSS 추가 |
| R3.2, R3.3 | M x2 | 1 | /subscribe, /archive 확장 |
| R4.1~R4.3 | S x3 | 0~1 | Schema 추가, 설정 파일 |

**Level 2 트리거**: R2.6만 해당 (복수 페이지 대규모 SEO 변경)

---

## Sprint 요약 (Boomer 재조정 반영)

```
Phase 1 (P0): S x3 / 구현 2일 + 검증 1주 / frontend
Phase 2 (P1): S x4 + M x2 + L x1 / ~7일 / frontend + domain + strategist
  ※ R2.6(메타) 먼저 → R2.2(Hero) 순차. GA2/GA3 게이트 포함.
Phase 3 (P2+P3): S x5 + M x2 / ~4일 / frontend + backend + domain
  ※ AI 챗봇 R4.1 → P2+ 상향

총: ~2.5주 (Phase 검증 기간 포함, 순차)
Level 2 트리거: R2.6만 (Isaac 승인 필수)

진행 조건:
  Phase 1 완료 → GA1 게이트 통과 → Phase 2
  GA2(메타 변경안 Isaac 승인) + GA3(A/B 설계) → R2.2 + R2.6
  Phase 2 완료 → Phase 3
```