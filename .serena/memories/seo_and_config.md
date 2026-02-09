# SEO / 설정 / 환경변수

## SEO 설정 체계 (lib/constants/seo/)

### Single Source of Truth 구조
```
lib/constants/seo/
├─ index.ts          → 중앙 export (모든 SEO 설정 re-export)
├─ types.ts          → 타입 정의 (SiteConfig, MetadataConfig 등)
├─ config.ts         → 사이트 기본 설정 (domain, serviceName 등)
├─ metadata.ts       → 페이지 메타데이터 (title, description)
├─ social.ts         → 소셜 미디어 링크 (Twitter, Instagram, Threads)
├─ schema.ts         → JSON-LD 스키마 설명 텍스트
├─ keywords.ts       → SEO 키워드 (카테고리별 70개)
├─ faq-data.ts       → FAQ 데이터 + Schema 생성 유틸
├─ breadcrumb-schema.ts → Breadcrumb Schema 생성
├─ internal-links.ts → 내부 링크 전략
└─ technical-indicators-content.tsx → 기술적 지표 설명 콘텐츠
```

### 사이트 설정 (config.ts)
```typescript
siteConfig = {
  domain: 'https://stockmatrix.co.kr',
  serviceName: 'Stock Matrix',
  serviceNameKo: '스탁매트릭스',
  deliveryTime: '오전 7시 50분',
  stockCount: 3,
  indicatorCount: 30,
  markets: 'KOSPI·KOSDAQ',
}
```

### 메타데이터 (metadata.ts)
- title: "StockMatrix — 한국 주식 무료 투자 뉴스레터"
- titleTemplate: "%s | StockMatrix"
- description: AI 분석, 30개 지표, 250+ 테마 생명주기 추적 포함

### 키워드 카테고리 (keywords.ts)
- core: 주식 뉴스레터, AI 주식 분석 등
- technical: RSI, MACD, 볼린저밴드 등
- market: KOSPI, KOSDAQ, 코스피 등
- service: 무료 뉴스레터, 이메일 투자 등
- theme: 테마 생명주기, 테마 분석 등
- 총 70개 키워드

### FAQ 데이터 (faq-data.ts)
- 20+ 질문/답변 (한국어)
- generateFAQSchema(): Schema.org FAQPage 생성
- calculateTotalCharacters(): 총 문자 수 분석
- analyzeKeywordDensity(): 키워드 밀도 분석

## JSON-LD Schema.org 구현

### 루트 레이아웃 (app/layout.tsx)
```
@graph:
  1. Organization — 서비스 정보, 소셜 링크, 연락처
  2. WebSite — 사이트 메타
  3. Service — 주식 분석 서비스 (무료, 한국 대상)
  4. NewsMediaOrganization — 뉴스레터 서비스
```

### 홈페이지 (app/page.tsx)
- SoftwareApplication: FinanceApplication, featureList 포함

### 블로그 상세 ([slug]/page.tsx)
- Article + FAQPage + BreadcrumbList

### FAQ 페이지 (app/faq/)
- FAQPage schema

### 기술적 지표 페이지
- schema-org-structured-data.tsx: 구조화 데이터

## OG 이미지 생성
| 파일 | 설명 |
|------|------|
| app/opengraph-image.tsx | 루트 OG 이미지 |
| app/twitter-image.tsx | 루트 Twitter 이미지 |
| app/themes/opengraph-image.tsx | 테마 목록 OG |
| app/themes/twitter-image.tsx | 테마 목록 Twitter |
| app/themes/[id]/opengraph-image.tsx | 테마 상세 OG (동적) |
| app/blog/[slug]/opengraph-image.tsx | 블로그 OG (동적) |

- 폰트: AppleSDGothicNeo (fonts/ 디렉토리)
- Next.js ImageResponse API 사용

## SEO 인프라

### Sitemap (app/sitemap.ts)
- 정적 페이지: /, /subscribe, /archive, /about, /faq, /themes, /technical-indicators, /blog
- 동적: /themes/[id] (Supabase에서 활성 테마 조회), /blog/[slug]

### Robots (app/robots.ts)
- 표준 robots.txt 생성

### 검증
- Google: verification 메타 태그 + googlecb7f206d08d70ab3.html
- Naver: naver-site-verification + naver9c49fecd25fb494a71dfea8db8a8dd43.html

### PWA
- manifest.webmanifest (public/)
- icon-192.png, icon-512.png, apple-touch-icon.png, favicon.ico/svg

## 환경변수 전체 목록

### 필수 (Zod 검증)
| 변수 | 설명 | 예시 |
|------|------|------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase 프로젝트 URL | https://xxx.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase 익명 키 | eyJ... |
| GEMINI_API_KEY | Gemini API 키 | AIza... |
| NEXT_PUBLIC_APP_URL | 앱 URL | https://stockmatrix.co.kr |

### 선택 (필요 시)
| 변수 | 설명 |
|------|------|
| OPENAI_API_KEY | OpenAI (현재 미사용) |
| ANTHROPIC_API_KEY | Anthropic (현재 미사용) |
| SENDGRID_API_KEY | SendGrid 이메일 |
| SENDGRID_FROM_EMAIL | 발신 이메일 |
| SENDGRID_FROM_NAME | 발신자 이름 |

### GitHub Actions 전용
| 변수 | 설명 |
|------|------|
| SUPABASE_SERVICE_ROLE_KEY | Supabase 서비스 역할 키 (TLI 쓰기용) |
| NAVER_CLIENT_ID | 네이버 API 클라이언트 ID |
| NAVER_CLIENT_SECRET | 네이버 API 시크릿 |
| GOOGLE_CLOUD_PROJECT | Vertex AI 프로젝트 ID |
| GOOGLE_CLOUD_LOCATION | Vertex AI 리전 |
| GOOGLE_CLOUD_CREDENTIALS | 서비스 계정 JSON |
| CRON_SECRET | Cron 엔드포인트 인증 |
| TWITTER_API_KEY | Twitter API 키 |
| TWITTER_API_SECRET | Twitter API 시크릿 |
| TWITTER_ACCESS_TOKEN | Twitter 액세스 토큰 |
| TWITTER_ACCESS_SECRET | Twitter 액세스 시크릿 |
| KIS_APP_KEY | KIS API 앱 키 |
| KIS_APP_SECRET | KIS API 앱 시크릿 |

### 빌드 시 안전장치
- lib/env.ts: `NEXT_PHASE === 'phase-production-build'`이면 검증 스킵
- lib/supabase.ts: URL/Key 없으면 placeholder 사용 + `isSupabasePlaceholder` 플래그
- 모든 API 라우트: placeholderResponse()로 빈 응답 반환

## Tailwind CSS 4 설정
- postcss.config.mjs: @tailwindcss/postcss 플러그인
- app/globals.css: 글로벌 스타일, 커스텀 CSS 변수
- tw-animate-css: 애니메이션 유틸리티
- 커스텀 애니메이션: matrix-scan, matrix-pulse

## next.config.ts 설정
- **보안 헤더**: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, X-XSS-Protection, Permissions-Policy (카메라/마이크/위치 차단), CSP
- **CSP 상세**: self + Vercel scripts + Supabase connect + Vercel live frame
- **리다이렉트**: /icon → /icon-512.png (permanent)

## ESLint 설정 (eslint.config.mjs)
- eslint-config-next 15.5.7
- strict: any 금지, unused 변수 금지

## TypeScript 설정 (tsconfig.json)
- target: ES2017, strict: true
- paths: @/* → ./*
- incremental: true, isolatedModules: true
