# Technical SEO Reference

> Last Updated: 2026-03 | Next.js: 15+ (App Router) | Schema.org: 2024-12 | CWV: INP (FID deprecated 2024-03)

## Table of Contents
1. [Crawlability & Indexation](#crawlability--indexation)
2. [Core Web Vitals](#core-web-vitals)
3. [Site Speed Optimization](#site-speed-optimization)
4. [Mobile-First](#mobile-first)
5. [Page Experience Signals](#page-experience-signals)
6. [Security & HTTPS](#security--https)
7. [URL Architecture](#url-architecture)
8. [Next.js Technical SEO Implementation](#nextjs-technical-seo-implementation)
9. [Naver SEO (한국 검색 시장)](#naver-seo-한국-검색-시장)

---

## Crawlability & Indexation

### Robots.txt
- Verify no unintentional blocks on important pages
- Reference sitemap URL
- Block `/api/`, `/admin/`, `/private/` paths
- Allow all important content paths

### XML Sitemap
- Contains only canonical, indexable URLs (no noindex, no redirects)
- Updated on content changes
- Submitted to Google Search Console
- For large sites (50k+ URLs): use sitemap index with multiple sitemaps
- Include `lastmod` with actual modification dates (not auto-generated)

### Site Architecture
- Important pages within 3 clicks of homepage
- Logical hierarchy: Home > Category > Subcategory > Page
- Flat URL structure where possible
- No orphan pages (every page linked from at least one other)

### Crawl Budget (Large Sites)
- Control parameterized URLs (faceted navigation)
- Paginated content with rel=canonical to main page or self-referencing
- No session IDs in URLs
- No infinite scroll without pagination fallback for crawlers

### Indexation Diagnostics
- `site:domain.com` check for indexed count
- Search Console Coverage report for errors
- Watch for: noindex on important pages, canonicals pointing wrong direction, redirect chains/loops, soft 404s, duplicate content without canonicals

### Canonicalization Rules
- Every page needs a canonical tag (self-referencing on unique pages)
- HTTP → HTTPS canonical
- www vs non-www consistency
- Trailing slash consistency
- URL parameters: canonical to clean URL

---

## Core Web Vitals

### LCP (Largest Contentful Paint) — Target: < 2.5s

**Common causes of slow LCP:**
- Unoptimized hero images
- Render-blocking CSS/JS
- Slow server response (high TTFB)
- Client-side rendering of above-fold content

**Fixes:**
- Use `next/image` with `priority` for hero images
- Preload critical fonts: `<link rel="preload" href="/fonts/main.woff2" as="font" crossorigin>`
- Server-side render above-fold content (RSC in Next.js)
- Use CDN for static assets
- Optimize TTFB < 800ms

### INP (Interaction to Next Paint) — Target: < 200ms

**Common causes:**
- Heavy JavaScript execution on interaction
- Long main-thread blocking tasks
- Excessive re-renders

**Fixes:**
- Break long tasks with `requestIdleCallback` or `setTimeout`
- Defer non-critical JS: `<script defer>`
- Use React `useTransition` for non-urgent updates
- Minimize third-party script impact

### CLS (Cumulative Layout Shift) — Target: < 0.1

**Common causes:**
- Images without dimensions
- Dynamically injected content above viewport
- Web fonts causing FOUT/FOIT
- Ads/embeds without reserved space

**Fixes:**
- Always set `width` and `height` on images (or use `next/image`)
- Reserve space for ads and embeds with CSS `aspect-ratio` or min-height
- Use `font-display: swap` with size-adjust for web fonts
- Avoid inserting content above existing viewport content

---

## Site Speed Optimization

### Resource Loading Strategy

```html
<!-- Critical: preload -->
<link rel="preload" href="/fonts/main.woff2" as="font" crossorigin>
<link rel="preload" href="/hero.webp" as="image">

<!-- Non-critical CSS: async load -->
<link rel="preload" href="/non-critical.css" as="style" onload="this.onload=null;this.rel='stylesheet'">

<!-- JS: defer or async -->
<script src="/analytics.js" async></script>
<script src="/main.js" defer></script>
```

### Image Optimization
- WebP/AVIF format (30-50% smaller than JPEG)
- Responsive srcset with multiple sizes
- Lazy loading for below-fold images (`loading="lazy"`)
- Explicit dimensions to prevent CLS
- Use `next/image` for automatic optimization in Next.js

### Caching Strategy
- Static assets: `Cache-Control: public, max-age=31536000, immutable`
- HTML pages: `Cache-Control: public, max-age=0, must-revalidate` (with ISR/stale-while-revalidate)
- API responses: context-dependent (short TTL for dynamic data)

---

## Mobile-First

Google uses mobile version for indexing. Non-negotiable requirements:
- Responsive design (not separate m. subdomain)
- Viewport meta: `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Tap targets minimum 48x48px with 8px spacing
- Font size minimum 16px for body text
- No horizontal scrolling
- Same content as desktop (no hiding content on mobile)

---

## Page Experience Signals

Core Web Vitals(LCP/INP/CLS) 외 추가 Page Experience 신호:
- **HTTPS** — 필수 (아래 Security 섹션 참조)
- **No Intrusive Interstitials** — 전면 팝업/모달이 메인 콘텐츠를 가리면 페널티 가능
  - 뉴스레터 구독 팝업: 페이지 스크롤 후 표시하거나, 화면 30% 이하 크기로 제한
  - 법적 필수 팝업(쿠키 동의 등)은 예외
  - 모바일에서 특히 엄격 적용
- **Safe Browsing** — 악성 콘텐츠/소프트웨어 없음
- **Mobile-Friendly** — 위 Mobile-First 섹션 참조

---

## Security & HTTPS

- HTTPS across entire site (valid SSL certificate)
- No mixed content (HTTP resources on HTTPS pages)
- HTTP → HTTPS 301 redirects
- HSTS header recommended: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- Content Security Policy for XSS protection

---

## URL Architecture

### Best Practices
- Short, descriptive, keyword-rich
- Lowercase, hyphen-separated
- No unnecessary parameters or session IDs
- Consistent pattern per content type
- Subfolders over subdomains (inherit domain authority)

### Patterns
```
Good:
/blog/react-hooks-guide
/themes/ai-investment
/archive/2025/march

Bad:
/blog?p=12345
/page.php?id=abc&ref=xyz
/Blog/React-Hooks-Guide  (inconsistent case)
```

---

## Next.js Technical SEO Implementation

### Dynamic Sitemap with Data Fetching

```tsx
// app/sitemap.ts
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fetch all dynamic routes
  const posts = await fetchAllPosts()
  const themes = await fetchAllThemes()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: 'https://example.com', lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: 'https://example.com/about', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ]

  const postRoutes = posts.map((post) => ({
    url: `https://example.com/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  const themeRoutes = themes.map((theme) => ({
    url: `https://example.com/themes/${theme.slug}`,
    lastModified: new Date(theme.updatedAt),
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  return [...staticRoutes, ...postRoutes, ...themeRoutes]
}
```

### Robots with Multiple Rules

```tsx
// app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/', '/private/'] },
      { userAgent: 'Googlebot', allow: '/' },
    ],
    sitemap: 'https://example.com/sitemap.xml',
  }
}
```

### ISR for SEO-Critical Dynamic Pages

```tsx
// app/themes/[slug]/page.tsx

// Revalidate every 60 seconds for fresh data
export const revalidate = 60

// Pre-generate top pages at build time
export async function generateStaticParams() {
  const themes = await fetchTopThemes(100)
  return themes.map((t) => ({ slug: t.slug }))
}

// Dynamic pages generated on-demand, then cached
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const theme = await fetchTheme(slug)
  // ...render
}
```

### Metadata with Robots Directives

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}
```

## Naver SEO (한국 검색 시장)

한국 검색 점유율 ~60% (2025 기준). Google SEO만으로는 한국 시장 절반만 커버.

### 네이버 서치어드바이저 (Search Advisor)
- 사이트 등록: https://searchadvisor.naver.com
- 소유권 확인 (HTML 태그 또는 파일 업로드)
- sitemap.xml 제출
- robots.txt 검증
- 웹 페이지 수집 요청 (개별 URL 인덱싱 요청)

### 네이버 SEO 기술 요구사항
- **SSR/SSG 필수** — 네이버봇은 JavaScript 렌더링 능력이 Google보다 제한적. Next.js SSR/ISR 활용 필수
- **Open Graph 메타태그** — 네이버는 OG 태그를 적극 활용하여 검색 결과 스니펫 생성
- **네이버 전용 메타태그**:
  ```html
  <meta name="naver-site-verification" content="verification-code" />
  ```
- **robots.txt에 Yeti(네이버봇) 허용** 확인
- 사이트맵에 `lastmod` 정확히 포함 (네이버 크롤링 빈도에 영향)

### 네이버 콘텐츠 최적화
- 네이버 블로그/카페 콘텐츠가 네이버 검색 상위 노출에 유리 (자사 플랫폼 우대)
- 웹사이트 콘텐츠는 "VIEW" 탭에 노출 — 양질의 콘텐츠 + 정기 업데이트 필요
- 네이버 자동완성/연관검색어를 키워드 리서치에 활용
- 한국어 띄어쓰기·조사 처리에 유의 (검색어 변형 고려)

### Kakao/Daum 검색
- Daum(카카오 검색) — 국내 3위. 별도 최적화 불필요하나 Daum 웹마스터 도구에 sitemap 제출 권장
- Kakao 채널/카카오뷰 — 소셜 유입 채널로 활용 가능

---

### Verification Checklist

- [ ] `app/sitemap.ts` exists and returns all indexable URLs
- [ ] `app/robots.ts` exists with correct allow/disallow rules
- [ ] All pages have unique `<title>` and `<meta name="description">`
- [ ] Canonical tags set correctly on all pages
- [ ] No `noindex` on pages that should be indexed
- [ ] HTTPS enforced, no mixed content
- [ ] Core Web Vitals passing (LCP < 2.5s, INP < 200ms, CLS < 0.1)
- [ ] Mobile-friendly (responsive, tap targets, font sizes)
- [ ] No redirect chains longer than 2 hops
- [ ] 404 pages return actual 404 status code
- [ ] 네이버 서치어드바이저 등록 및 sitemap 제출 (한국 시장)
- [ ] SSR/SSG 적용 확인 (네이버봇 JS 렌더링 제한 대응)