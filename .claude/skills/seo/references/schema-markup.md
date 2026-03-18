# Schema Markup & Structured Data Reference

## Table of Contents
1. [Implementation Pattern](#implementation-pattern)
2. [Schema Types Catalog](#schema-types-catalog)
3. [Next.js JSON-LD Patterns](#nextjs-json-ld-patterns)
4. [Multiple Schemas Per Page](#multiple-schemas-per-page)
5. [Validation & Testing](#validation--testing)
6. [Common Mistakes](#common-mistakes)

---

## Implementation Pattern

Always use JSON-LD format (Google's recommended format). Place in `<script type="application/ld+json">` tag.

### Next.js Base Pattern

```tsx
// Reusable JSON-LD component
function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\u003c'),
      }}
    />
  )
}
```

The `.replace(/</g, '\u003c')` prevents XSS via script injection in JSON-LD content.

---

## Schema Types Catalog

### Article (Blog Posts, News)

Organization author:
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "2025년 AI 반도체 투자 테마 분석",
  "description": "AI 반도체 관련 핵심 종목과 투자 시사점을 분석합니다.",
  "image": "https://example.com/images/ai-semiconductor.webp",
  "datePublished": "2025-03-15T09:00:00+09:00",
  "dateModified": "2025-03-18T14:30:00+09:00",
  "author": {
    "@type": "Organization",
    "name": "StockNewsletter",
    "url": "https://example.com"
  },
  "publisher": {
    "@type": "Organization",
    "name": "StockNewsletter",
    "logo": { "@type": "ImageObject", "url": "https://example.com/logo.png" }
  },
  "mainEntityOfPage": { "@type": "WebPage", "@id": "https://example.com/themes/ai-semiconductor" }
}
```

Person author (E-E-A-T에 더 강한 신뢰 신호):
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "AI 반도체 투자 전략 가이드",
  "author": {
    "@type": "Person",
    "name": "홍길동",
    "url": "https://example.com/authors/hong",
    "sameAs": ["https://linkedin.com/in/hong", "https://twitter.com/hong"]
  }
}
```

### NewsArticle (뉴스 콘텐츠 — Article 하위 타입)

금융 뉴스, 시장 속보 등에 적합. Google News 노출에 유리.
```json
{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "삼성전자, AI 반도체 투자 확대 발표",
  "datePublished": "2025-03-18T09:00:00+09:00",
  "dateModified": "2025-03-18T14:30:00+09:00",
  "author": { "@type": "Organization", "name": "StockNewsletter" },
  "publisher": {
    "@type": "Organization",
    "name": "StockNewsletter",
    "logo": { "@type": "ImageObject", "url": "https://example.com/logo.png" }
  }
}
```

### VideoObject (동영상 콘텐츠)

```json
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "이번 주 AI 투자 테마 분석 영상",
  "description": "AI 반도체, 클라우드, SaaS 테마의 주간 동향을 분석합니다.",
  "thumbnailUrl": "https://example.com/thumbnails/weekly-review.jpg",
  "uploadDate": "2025-03-15T09:00:00+09:00",
  "duration": "PT10M30S",
  "contentUrl": "https://example.com/videos/weekly-review.mp4",
  "embedUrl": "https://www.youtube.com/embed/abc123"
}
```

### Event (웨비나, IR 행사)

```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "AI 투자 전략 웨비나",
  "startDate": "2025-04-01T19:00:00+09:00",
  "endDate": "2025-04-01T20:30:00+09:00",
  "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
  "eventStatus": "https://schema.org/EventScheduled",
  "location": { "@type": "VirtualLocation", "url": "https://example.com/webinar" },
  "organizer": { "@type": "Organization", "name": "StockNewsletter" }
}
```

### FAQ

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "AI 테마 투자란 무엇인가요?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "AI 테마 투자는 인공지능 기술 성장의 수혜가 예상되는 기업들에 집중 투자하는 전략입니다."
      }
    },
    {
      "@type": "Question",
      "name": "TLI 점수는 어떻게 계산되나요?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "TLI 점수는 관심도, 뉴스 모멘텀, 변동성, 활동성 4가지 지표를 가중 평균하여 산출합니다."
      }
    }
  ]
}
```

### HowTo

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "AI 투자 테마 분석하는 방법",
  "description": "AI 기반 투자 테마를 체계적으로 분석하는 단계별 가이드입니다.",
  "step": [
    {
      "@type": "HowToStep",
      "name": "테마 발견",
      "text": "뉴스와 시장 데이터에서 떠오르는 AI 관련 테마를 식별합니다."
    },
    {
      "@type": "HowToStep",
      "name": "TLI 점수 확인",
      "text": "테마의 TLI 점수와 라이프사이클 단계를 확인합니다."
    },
    {
      "@type": "HowToStep",
      "name": "관련 종목 분석",
      "text": "테마와 연관된 핵심 종목의 펀더멘털을 분석합니다."
    }
  ]
}
```

### BreadcrumbList

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "홈",
      "item": "https://example.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "테마 분석",
      "item": "https://example.com/themes"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "AI 반도체"
    }
  ]
}
```

### Organization

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "StockNewsletter",
  "url": "https://example.com",
  "logo": "https://example.com/logo.png",
  "description": "AI 기반 투자 테마 분석 뉴스레터",
  "sameAs": [
    "https://twitter.com/stocknewsletter",
    "https://www.linkedin.com/company/stocknewsletter"
  ]
}
```

### WebSite (사이트 검색 지원 — 검색 기능이 있는 경우에만 구현)

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "StockNewsletter",
  "url": "https://example.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://example.com/search?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

### Product (with Review/AggregateRating)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "StockNewsletter Pro",
  "description": "AI 투자 테마 분석 프리미엄 구독",
  "brand": { "@type": "Brand", "name": "StockNewsletter" },
  "offers": {
    "@type": "Offer",
    "price": "29900",
    "priceCurrency": "KRW",
    "availability": "https://schema.org/InStock",
    "url": "https://example.com/pricing"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 4.8,
    "reviewCount": 156
  }
}
```

### LocalBusiness

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Business Name",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "서울시 강남구 테헤란로 123",
    "addressLocality": "서울",
    "addressRegion": "서울특별시",
    "postalCode": "06133",
    "addressCountry": "KR"
  },
  "telephone": "+82-2-1234-5678",
  "openingHours": "Mo-Fr 09:00-18:00"
}
```

---

## Next.js JSON-LD Patterns

### Page-Level Schema (Recommended)

```tsx
// app/themes/[slug]/page.tsx
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const theme = await getTheme(slug)

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: theme.title,
    description: theme.description,
    datePublished: theme.createdAt,
    dateModified: theme.updatedAt,
    author: { '@type': 'Organization', name: 'StockNewsletter' },
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: 'https://example.com' },
      { '@type': 'ListItem', position: 2, name: '테마', item: 'https://example.com/themes' },
      { '@type': 'ListItem', position: 3, name: theme.title },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([articleSchema, breadcrumbSchema]).replace(/</g, '\u003c'),
        }}
      />
      {/* page content */}
    </>
  )
}
```

### Layout-Level Schema (Site-Wide)

```tsx
// app/layout.tsx
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'StockNewsletter',
  url: 'https://example.com',
  logo: 'https://example.com/logo.png',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema).replace(/</g, '\u003c'),
          }}
        />
        {children}
      </body>
    </html>
  )
}
```

---

## Multiple Schemas Per Page

Combine as JSON array:

```tsx
const schemas = [articleSchema, breadcrumbSchema, faqSchema]

<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify(schemas).replace(/</g, '\u003c'),
  }}
/>
```

Or use separate `<script>` tags — both are valid. Google recommends using `@id` to link related schemas.

---

## Validation & Testing

### Tools
- **Rich Results Test**: https://search.google.com/test/rich-results (primary)
- **Schema Markup Validator**: https://validator.schema.org
- **Search Console**: Enhancement reports for deployed pages

### Validation Checklist
- [ ] JSON-LD is valid JSON (no trailing commas, correct escaping)
- [ ] `@context` is `https://schema.org`
- [ ] `@type` matches the content type
- [ ] Required properties present for the schema type
- [ ] URLs are absolute (not relative)
- [ ] Dates in ISO 8601 format
- [ ] No XSS-vulnerable content (use `.replace(/</g, '\u003c')`)
- [ ] Rich Results Test passes without errors
- [ ] Schema matches visible page content (no hidden/misleading data)

---

## Common Mistakes

| Mistake | Severity | Fix |
|---------|----------|-----|
| Schema data doesn't match visible content | P0 | Ensure schema reflects what users see |
| Missing required properties | P1 | Check schema.org docs for required fields |
| Relative URLs in schema | P1 | Use absolute URLs everywhere |
| Invalid date format | P2 | Use ISO 8601: `2025-03-18T09:00:00+09:00` |
| Hardcoded schema (not dynamic) | P2 | Generate from data source |
| Missing `.replace(/</g, '\u003c')` | P1 | Always sanitize to prevent XSS |
| `@context` typo or wrong URL | P0 | Must be `https://schema.org` exactly |
| Schema on wrong page type | P2 | Article schema only on articles, etc. |