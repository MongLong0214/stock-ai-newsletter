# 컴포넌트 계층 구조

## 공유 컴포넌트 (앱 전역)

### app/_components/shared/
| 파일 | 타입 | 설명 |
|------|------|------|
| navigation.tsx | Client | 메인 네비게이션 바 |
| navigation/_constants.ts | - | 네비 링크 목록 (테마 highlighted) |
| navigation/_types.ts | - | NavLink 타입 |
| navigation/logo.tsx | Client | 로고 컴포넌트 |
| navigation/mobile-menu.tsx | Client | 모바일 햄버거 메뉴 |
| navigation/nav-link.tsx | Client | 개별 네비 링크 |
| navigation/subscribe-button.tsx | Client | 구독 버튼 (CTA) |
| footer.tsx | Client | 푸터 (링크, 소셜, 브랜드 설명) |
| providers/query-provider.tsx | Client | TanStack React Query Provider |

### components/ (shadcn/ui + 공용)
| 파일 | 타입 | 설명 |
|------|------|------|
| ui/badge.tsx | Client | 뱃지 (shadcn) |
| ui/button.tsx | Client | 버튼 (shadcn, CVA variants) |
| ui/card.tsx | Client | 카드 (shadcn) |
| ui/chart.tsx | Client | recharts 래퍼 (shadcn) |
| ui/input.tsx | Client | 인풋 (shadcn) |
| animated-background.tsx | Client | Matrix 스타일 배경 애니메이션 |
| scroll-to-top.tsx | Client | 스크롤 최상단 버튼 |

### components/tli/ (TLI 전용 공유)
| 파일 | 타입 | 설명 |
|------|------|------|
| lifecycle-curve.tsx | Client | recharts 기반 생명주기 곡선 차트 |
| lifecycle-curve-data.ts | - | 차트 데이터 변환 유틸 |
| lifecycle-curve-tooltip.tsx | Client | 차트 툴팁 |
| lifecycle-score.tsx | Client | 원형 점수 표시 |
| score-breakdown.tsx | Client | 4요소 점수 분해 바 |
| stage-badge.tsx | Client | 단계 뱃지 (색상 매핑) |
| theme-card.tsx | Client | 테마 목록용 카드 |
| glass-card.tsx | Client | Glass morphism 카드 래퍼 |
| disclaimer.tsx | Client | 투자 면책 고지 |
| error-boundary.tsx | Client | 에러 바운더리 (LifecycleCurve 래핑) |

---

## 메인 페이지 (app/_components/home/)
| 파일 | 설명 |
|------|------|
| hero-section.tsx | 히어로 (카운트다운, CTA) |
| service-definition-section.tsx | 서비스 정의 (AI 검색 최적화용 텍스트) |
| email-preview-section.tsx | 이메일 미리보기 목업 |
| theme-preview-section.tsx | TLI 테마 미리보기 |
| technical-indicators-section.tsx | 30개 기술적 지표 카드 |
| cta-section.tsx | 하단 CTA (카운트다운) |
| cta-button.tsx | CTA 버튼 (Framer Motion) |

**데이터**: app/constants/home-page.ts (TECHNICAL_INDICATORS_DATA)

---

## 아카이브 (app/archive/_components/)

### 캘린더
| 파일 | 설명 |
|------|------|
| calendar/desktop-sidebar.tsx | 데스크톱 사이드바 캘린더 |
| calendar/mobile-calendar-toggle.tsx | 모바일 캘린더 토글 |
| calendar/mini-calendar/index.tsx | 미니 캘린더 메인 |
| calendar/mini-calendar/calendar-grid.tsx | 날짜 그리드 |
| calendar/mini-calendar/calendar-header.tsx | 월/연도 헤더 |
| calendar/mini-calendar/date-cell.tsx | 날짜 셀 (뉴스레터 있는 날 표시) |
| calendar/mini-calendar/day-names-row.tsx | 요일 행 |

### 카드
| 파일 | 설명 |
|------|------|
| cards/newsletter-card/index.tsx | 뉴스레터 카드 메인 |
| cards/newsletter-card/price-section.tsx | 실시간 주가 섹션 |
| cards/newsletter-card/constants.ts | 점수 색상 등 상수 |
| cards/newsletter-card/types.ts | 타입 정의 |
| cards/newsletter-card/utils.ts | 포맷팅 유틸 |

### 레이아웃
| 파일 | 설명 |
|------|------|
| layout/page-header.tsx | 페이지 헤더 |
| layout/newsletter-grid.tsx | 뉴스레터 그리드 |
| layout/empty-state.tsx | 빈 상태 |
| ui/score-badge.tsx | 점수 뱃지 |

### 훅 (app/archive/_hooks/)
| 파일 | 설명 |
|------|------|
| use-stock-prices.ts | KIS API 실시간 시세 조회 |
| use-archive-data.ts | 아카이브 JSON 데이터 |
| use-calendar-state.ts | 캘린더 상태 관리 |
| use-newsletter-data.ts | 뉴스레터 데이터 필터링 |
| use-mobile-calendar.ts | 모바일 캘린더 토글 |
| use-keyboard-shortcuts.ts | 키보드 단축키 |
| use-focus-trap.ts | 포커스 트랩 (모달) |

### 유틸 (app/archive/_utils/)
| 디렉토리 | 설명 |
|----------|------|
| api/kis/ | KIS API 클라이언트, rate-limiter, token-storage |
| cache/ | 주가 캐시 (stock-price.ts) |
| formatting/ | 날짜/가격/점수 포맷팅 |
| market/ | 시장 시간 계산, 공휴일 목록 |

---

## 테마 목록 (app/themes/_components/)
| 파일 | 설명 |
|------|------|
| themes-content.tsx | 메인 콘텐츠 (필터 + 섹션) |
| themes-header.tsx | 페이지 헤더 |
| stage-nav.tsx | 단계 탭 네비게이션 (Early/Growth/Peak/Decay/Reigniting) |
| stage-section.tsx | 단계별 테마 카드 그리드 |
| theme-filter.tsx | 검색 필터 |
| stats-overview.tsx | 요약 통계 — **Hottest/급상승 클릭 시 `/themes/{id}` 상세 이동** (Next.js Link) |
| themes-skeleton.tsx | 로딩 스켈레톤 |
| themes-empty-states.tsx | 빈 상태 (단계별) |

### 서비스 (app/themes/_services/)
| 파일 | 설명 |
|------|------|
| get-ranking-server.ts | Server Component용 초기 데이터 fetch |
| use-get-ranking.ts | React Query 훅 (클라이언트) |

---

## 테마 상세 (app/themes/[id]/_components/)
| 파일 | 설명 |
|------|------|
| detail-content.tsx | 메인 콘텐츠 레이아웃 (prefers-reduced-motion) |
| detail-header/index.tsx | 헤더 (테마명, 점수, 단계) |
| detail-header/metric-grid.tsx | 지표 그리드 (24H/7D 변화) |
| detail-header/score-components.tsx | 점수 구성요소 표시 |
| detail-header/top-movers.tsx | 상위 변동 종목 |
| detail-states.tsx | 로딩/에러/빈 상태 |
| score-card.tsx | 점수 카드 (24H/7D change, "—" 표시) |
| stock-list.tsx | 종목 목록 테이블 |
| stock-list-row.tsx | 종목 행 (가격 comma, 등락% 색상, 거래량 약어) |
| stock-list-utils.ts | 포맷팅 유틸 (평균 등락률 = is_active 종목만) |
| news-headlines.tsx | 뉴스 헤드라인 목록 (HTML 엔티티 디코딩, 출처, 날짜, limit 50) |
| comparison-list/index.tsx | 유사 테마 비교 목록 (품질필터 pastTotalDays≥14, 평균유사도 요약) |
| comparison-list/comparison-card.tsx | 비교 카드 (접근성, 타임라인 주체 표시, 강도 뱃지) |
| comparison-list/pillar-bars.tsx | 3-Pillar 유사도 바 |
| theme-prediction/index.tsx | 생명주기 참고 지표 (진행률 바, 피크 마커, 시나리오) |
| theme-prediction/config.ts | 예측 설정 |
| theme-prediction/sub-components.tsx | 예측 서브 컴포넌트 |

### 서비스/유틸
| 파일 | 설명 |
|------|------|
| _services/use-get-theme-detail.ts | React Query 훅 |
| _apis/index.ts | API 호출 함수 |
| _utils/calculate-prediction.ts | re-export from lib/tli/prediction |
| _utils/calculate-prediction-helpers.ts | re-export from lib/tli/prediction-helpers |

---

## 블로그 (app/blog/)
| 파일 | 설명 |
|------|------|
| page.tsx | 목록 페이지 (Server) |
| [slug]/page.tsx | 상세 페이지 (Server, MDX 렌더링) |
| [slug]/opengraph-image.tsx | 동적 OG 이미지 |
| _components/blog-list/ | 카드, 목록, 빈 상태 |
| _components/filters/ | 검색, 태그 필터 |
| _components/shared/icons.tsx | 공용 아이콘 |
| [slug]/_components/ | CTA, FAQ 아코디언, 읽기 진행도, Schema, 소셜 공유, TOC |
| _services/ | blog-repository, content-generator, keyword-generator, serp-api, web-scraper |
| _utils/ | markdown-parser, schema-generator, slug-validator, tag-utils, toc-extractor |
| _prompts/ | AI 콘텐츠/키워드 생성 프롬프트 |
| pipeline.ts | 블로그 생성 파이프라인 오케스트레이터 |

---

## 기타 페이지 컴포넌트

### About (app/about/_components/)
- service-intro-section.tsx: 서비스 소개 섹션

### FAQ (app/faq/_components/)
- faq-section.tsx: FAQ 목록
- faq-accordion-item.tsx: 아코디언 항목

### Technical Indicators (app/technical-indicators/_components/)
- cards/indicator-card.tsx: 지표 카드
- icons/: 체크/지표 아이콘
- sections/: AI 통합, 결론 CTA, 지표 그리드, 섹션 헤더
- seo/schema-org-structured-data.tsx: Schema.org

---

## 전역 훅 (hooks/)
| 파일 | 설명 |
|------|------|
| use-calendar-dates.ts | 캘린더 날짜 계산 |
| use-countdown-to-tomorrow.ts | 내일 7:30까지 카운트다운 (lib/constants/delivery.ts 상수 참조) |
| use-is-mobile.ts | 모바일 감지 |
| use-reveal.ts | 스크롤 reveal 애니메이션 |

## 서버/클라이언트 구분 원칙
- **Server Components**: 페이지 메타데이터, 블로그 콘텐츠 렌더링, 초기 데이터 fetch
- **Client Components**: 인터랙션 (폼, 필터, 차트, 애니메이션, React Query)
- **'use client' 선언**: 페이지 최상위 또는 인터랙티브 컴포넌트
- **데이터 전달**: Server → Client는 props (themes/page.tsx → themes-content.tsx)
