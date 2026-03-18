---
name: seo-enterprise
description: "All-in-one SEO (Google + Naver): (1) Audit - technical SEO, crawlability, indexation, CWV, 'why not ranking', 'SEO health check' (2) On-Page - metadata, titles, descriptions, keyword research, E-E-A-T, AI content, internal linking (3) Schema - JSON-LD, Article/FAQ/HowTo/Product/BreadcrumbList/Organization/VideoObject/NewsArticle (4) Programmatic SEO - pages at scale, templates, directory/location/comparison pages (5) Technical - Next.js generateMetadata, sitemap.ts, robots.ts, ISR, OG images, hreflang. Triggers: 'SEO audit/optimize', 'meta tags', 'structured data', 'JSON-LD', 'keyword analysis', 'ranking', 'Core Web Vitals', 'link building', 'off-page', '네이버 SEO', '메타태그', '사이트맵', '크롤링', '색인', 'SEO 최적화/감사', '검색엔진 최적화', '구조화된 데이터', 'schema markup', 'programmatic SEO'."
---

# SEO Enterprise All-in-One

Unified SEO skill: audit, optimize, implement structured data, and scale pages — all through a single entry point with mode-based routing.

## Mode Selection

Detect the user's intent and route to the appropriate mode:

| Mode | Trigger Signals | Reference |
|------|----------------|-----------|
| **audit** | "audit", "health check", "why not ranking", "SEO issues", "diagnose" | [audit-framework.md](references/audit-framework.md) |
| **optimize** | "optimize", "improve", "meta tags", "title", "keyword", "content" | [on-page-seo.md](references/on-page-seo.md) |
| **schema** | "structured data", "JSON-LD", "rich snippets", "schema markup" | [schema-markup.md](references/schema-markup.md) |
| **programmatic** | "pages at scale", "template pages", "directory", "location pages" | [programmatic-seo.md](references/programmatic-seo.md) |
| **technical** | "sitemap", "robots", "generateMetadata", "canonical", "CWV" | [technical-seo.md](references/technical-seo.md) |

If ambiguous, ask the user which mode. Multiple modes can combine (e.g., audit + optimize).

## Workflow

```
1. Detect mode from user intent
2. Read relevant reference file(s)
3. Assess current state (read existing code/config)
4. Execute mode-specific workflow
5. Verify with checklist
6. Report findings/changes with evidence
```

## Shared Principles (All Modes)

### Google Search Essentials (2025)

1. **People-first content (Helpful Content System)** — Create content for users, not search engines. Google's Helpful Content System (2024년 Core ranking에 통합) rewards genuine helpfulness.
2. **E-E-A-T** — Experience, Expertise, Authoritativeness, Trustworthiness. Demonstrate all four.
3. **Core Web Vitals** — LCP < 2.5s, INP < 200ms, CLS < 0.1. Non-negotiable performance targets.
4. **Mobile-first indexing** — Google crawls mobile version first. Responsive design mandatory.
5. **Structured data** — Help Google understand content type. Use JSON-LD, validate with Rich Results Test.
6. **Crawlability** — Ensure Googlebot can discover and index all important pages.

### Next.js App Router SEO Stack

| Feature | Implementation |
|---------|---------------|
| Static metadata | `export const metadata: Metadata = { ... }` in layout/page |
| Dynamic metadata | `export async function generateMetadata({ params })` |
| Sitemap | `app/sitemap.ts` returning `MetadataRoute.Sitemap` |
| Robots | `app/robots.ts` returning `MetadataRoute.Robots` |
| JSON-LD | `<script type="application/ld+json">` with `dangerouslySetInnerHTML` |
| OG Images | `app/opengraph-image.tsx` or metadata.openGraph.images |
| Canonical | `metadata.alternates.canonical` |
| ISR | `export const revalidate = N` for fresh content with caching |

### Severity Classification (Audit Findings)

| Severity | Criteria | Action |
|----------|----------|--------|
| **P0** | Blocks indexation or causes penalties | Fix immediately |
| **P1** | Significant ranking impact | Fix within sprint |
| **P2** | Moderate improvement opportunity | Schedule |
| **P3** | Nice-to-have optimization | Backlog |

### Anti-Patterns to Flag

- `noindex` on important pages
- Missing or duplicate title tags
- Keyword cannibalization (multiple pages targeting same keyword)
- Orphan pages (no internal links)
- Soft 404s (200 status with error content)
- Mixed content (HTTP resources on HTTPS page)
- Redirect chains (3+ hops)
- Hardcoded metadata instead of dynamic generation
- Missing `alt` text on images
- No `canonical` on paginated or filtered URLs

### Output Standards

All SEO work produces:
1. **Evidence** — What was found, with file paths and line numbers
2. **Impact** — Why it matters (traffic/ranking/UX effect)
3. **Action** — Specific code change or recommendation
4. **Verification** — How to confirm the fix works

## Quick Reference: JSON-LD in Next.js

```tsx
// app/[slug]/page.tsx
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getData(slug)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: data.title,
    description: data.description,
    datePublished: data.publishedAt,
    dateModified: data.updatedAt,
    author: { '@type': 'Organization', name: 'Site Name' },
  }

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\u003c'),
        }}
      />
      {/* content */}
    </article>
  )
}
```

## Quick Reference: Dynamic Metadata

```tsx
// app/[slug]/page.tsx
import type { Metadata } from 'next'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const data = await getData(slug)

  return {
    title: data.title,
    description: data.description,
    openGraph: {
      title: data.title,
      description: data.description,
      type: 'article',
      url: `https://example.com/${slug}`,
      images: [{ url: data.ogImage, width: 1200, height: 630 }],
    },
    alternates: { canonical: `https://example.com/${slug}` },
  }
}
```

## Quick Reference: Sitemap & Robots

```tsx
// app/sitemap.ts
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await getAllPages()
  return pages.map((page) => ({
    url: `https://example.com${page.path}`,
    lastModified: page.updatedAt,
    changeFrequency: 'weekly',
    priority: page.priority,
  }))
}

// app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/'] },
    sitemap: 'https://example.com/sitemap.xml',
  }
}
```