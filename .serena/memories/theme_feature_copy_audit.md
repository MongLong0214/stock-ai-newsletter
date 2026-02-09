# 테마(TLI) 기능 카피 반영 현황 전수조사 (2026-02-09)

## 조사 결과 요약
테마 기능은 **기술적으로 완벽 구현**되어 있으나, 마케팅/안내 페이지들에서 **카피가 미반영**되어 신규 방문자가 TLI 기능을 발견하기 어려운 상태.

## 이미 반영된 곳 (수정 불필요)
- **Navigation**: `_constants.ts` — `{ href: '/themes', label: '테마', highlighted: true }`
- **Sitemap**: `app/sitemap.ts` — `/themes` 정적 + 동적 상세 페이지 자동 생성
- **SEO 키워드**: `lib/constants/seo/keywords.ts` — theme 카테고리 8개 키워드
- **Internal Links**: `lib/constants/seo/internal-links.ts` — 테마 링크 포함
- **메인 페이지**: `ThemePreviewSection` 컴포넌트 존재
- **테마 페이지**: `/app/themes/` 전체 완비

## 긴급 수정 필요 (High Priority)

### 1. FAQ 페이지
- **파일**: `lib/constants/seo/faq-data.ts`
- **현황**: 20개 질문 중 테마 관련 0개
- **필요**: 테마 FAQ 4개 추가 (TLI란?, 활용법, 점수 계산, 무료 여부)

### 2. About 페이지
- **파일**: `app/about/_components/service-intro-section.tsx`
- **현황**: 30개 지표 설명만, 테마 미언급
- **필요**: 테마 설명 문단 + 특징 리스트 항목 + Schema.org 키워드

### 3. SEO 메타데이터
- **파일**: `lib/constants/seo/metadata.ts` (line 14)
- **현황**: description에 테마 없음
- **필요**: "테마 생명주기 추적" 문구 포함

## 중요 수정 필요 (Medium Priority)

### 4. Footer
- **파일**: `app/_components/shared/footer.tsx`
- **필요**: Brand 설명에 테마 추가 + /themes 링크 추가

### 5. 메인 페이지 Schema.org
- **파일**: `app/page.tsx` (line 83-89)
- **필요**: featureList에 '테마 생명주기 추적' 추가

### 6. 서비스 정의 섹션
- **파일**: `app/_components/home/service-definition-section.tsx`
- **필요**: FEATURES 배열에 테마 항목 추가

### 7. 구독 페이지
- **파일**: `app/subscribe/page.tsx` (line 145)
- **필요**: Trust signals에 테마 항목 추가 (선택적)

## 수정 순서 권장
FAQ -> About -> SEO 메타데이터 -> Footer -> 메인 페이지 -> 서비스 정의 -> 구독 페이지
