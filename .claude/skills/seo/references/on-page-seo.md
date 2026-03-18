# On-Page SEO Reference

## Table of Contents
1. [Title Tags](#title-tags)
2. [Meta Descriptions](#meta-descriptions)
3. [Heading Structure](#heading-structure)
4. [Content Optimization](#content-optimization)
5. [Image Optimization](#image-optimization)
6. [Internal Linking](#internal-linking)
7. [E-E-A-T Signals](#e-e-a-t-signals)
8. [Keyword Strategy](#keyword-strategy)
9. [Featured Snippet Optimization](#featured-snippet-optimization)
10. [Content Checklist](#content-checklist)

---

## Title Tags

### Rules
- Unique for every page
- Primary keyword near the beginning
- 50-60 characters for English (visible in SERP without truncation)
- **한국어: 25-30자** (CJK 문자는 영문 대비 ~2배 pixel 너비, 50자면 truncation 발생)
- Compelling and click-worthy
- Brand name at end if space permits: `Primary Keyword - Brand`

### Common Issues (P1)
- Duplicate titles across pages
- Truncated (> 60 chars)
- Too short (< 30 chars, wasted opportunity)
- Keyword stuffing
- Missing entirely
- Generic ("Home", "Page 1")

### Next.js Implementation

```tsx
// Static title
export const metadata: Metadata = {
  title: 'AI 투자 테마 분석 - StockNewsletter',
}
```

```tsx
// Template title (layout.tsx에서 사용 — child page의 title이 %s에 삽입됨)
export const metadata: Metadata = {
  title: { default: 'StockNewsletter', template: '%s | StockNewsletter' },
}
```

```tsx
// Dynamic title
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const theme = await getTheme((await params).slug)
  return { title: `${theme.name} 투자 테마 분석` }
}
```

---

## Meta Descriptions

### Rules
- Unique per page
- 150-160 characters for English / **한국어: 75-80자** (CJK 2배 pixel 너비)
- Include primary keyword naturally
- Clear value proposition — why click this result?
- Call-to-action when appropriate
- No quotation marks (Google truncates at quotes)

### Common Issues (P1)
- Duplicate descriptions
- Auto-generated garbage
- Too long (> 160) or too short (< 70)
- No compelling reason to click
- Missing entirely (Google auto-generates, often poorly)

### Next.js Implementation

```tsx
export const metadata: Metadata = {
  description: 'AI가 분석한 오늘의 핵심 투자 테마. 관심도, 뉴스 모멘텀, 변동성을 종합한 실시간 스코어링.',
}
```

---

## Heading Structure

### Rules
- One H1 per page containing primary keyword
- Logical hierarchy: H1 → H2 → H3 (no skipping levels)
- Headings describe content section, not for styling
- Use semantic meaning, not visual size

### Correct Structure
```
H1: 2025년 AI 반도체 투자 테마 분석
  H2: 테마 개요
  H2: 핵심 관련 종목
    H3: 삼성전자
    H3: SK하이닉스
  H2: 최근 뉴스 분석
  H2: 투자 시사점
```

### Common Issues (P2)
- Multiple H1s (often from component composition)
- Skipped levels (H1 → H3)
- Headings used purely for styling
- No H1 at all

---

## Content Optimization

### Primary Content
- Primary keyword in first 100 words
- Related keywords (LSI) used naturally throughout
- Sufficient depth for the topic (not thin content)
- Answers the actual search intent completely
- Better than top-ranking competitors

### Content Depth Guidelines
| Page Type | Minimum Words | Target |
|-----------|-------------|--------|
| Blog/Article | 1,500 | 2,000-3,000 |
| Product/Feature | 300 | 500-800 |
| Category/Landing | 500 | 800-1,200 |
| Homepage | 500 | 800+ |
| FAQ | 100 per Q | 150-300 per Q |

### Thin Content Flags (P1)
- Pages with < 200 words of unique content
- Tag/category pages with just links
- Doorway pages targeting slight keyword variations
- Duplicate or near-duplicate across pages

---

## Image Optimization

### Rules
- Descriptive file names: `ai-investment-theme-chart.webp` (not `IMG_0123.jpg`)
- Alt text on every image describing what's in the image
- Compressed: WebP format preferred (30-50% smaller)
- Explicit width/height to prevent CLS
- Lazy loading for below-fold images
- Responsive with srcset for multiple sizes

### Next.js Implementation

```tsx
import Image from 'next/image'

<Image
  src="/images/theme-analysis.webp"
  alt="AI 반도체 테마 TLI 점수 추이 차트"
  width={800}
  height={450}
  priority  // for above-fold hero images
/>
```

### Common Issues
- Missing alt text (P1 — accessibility + SEO)
- Uncompressed images (P2 — speed impact)
- No dimensions specified (P2 — CLS impact)
- Generic alt text like "image" or "photo" (P2)

---

## Internal Linking

### Strategy
- 3-5 internal links per 1,000 words
- Descriptive anchor text (not "click here" or "read more")
- Link to contextually relevant pages
- Important pages should have many internal links pointing to them
- Update old content with links to new content
- Hub-and-spoke: category pages link to all child pages, child pages link back

### Common Issues
- Orphan pages — no internal links pointing to them (P1)
- Over-optimized anchor text — same exact keyword every time (P2)
- Excessive footer/sidebar links diluting value (P3)
- Broken internal links (P1)

### Breadcrumbs
Implement breadcrumbs for navigation + SEO:
```
Home > 테마 분석 > AI 반도체
```
Add BreadcrumbList schema markup (see schema-markup.md).

---

## E-E-A-T Signals

### Experience
- First-hand experience demonstrated in content
- Original data, analysis, or insights
- Real case studies and examples
- Screenshots, charts, or original visuals

### Expertise
- Author credentials visible (byline + bio)
- Accurate, detailed, up-to-date information
- Properly sourced claims with citations
- Depth that demonstrates subject mastery

### Authoritativeness
- Recognized in the niche
- Cited by other authoritative sources
- Industry credentials or partnerships
- Consistent publishing in the domain

### Trustworthiness
- Accurate, verifiable information
- Transparent about business and methodology
- Contact information accessible
- Privacy policy and terms present
- HTTPS enforced
- No deceptive practices

### AI-Generated Content Guidelines
Google's stance (2025): "Content is useful regardless of how it's produced." However:
- AI 콘텐츠도 E-E-A-T 기준 동일 적용
- AI 생성 사실 자체는 페널티 아님 — 품질이 핵심
- 반드시 사람이 검토·편집 (human oversight)
- AI로 대량 생성 + 검토 없이 발행 → spam policy 위반 가능
- 저자 정보(byline) 명시 권장
- "AI-assisted" 등 투명한 공개 권장 (의무는 아님)

---

## Keyword Strategy

### Search Intent Types
| Intent | Signal | Content Type |
|--------|--------|-------------|
| Informational | "what is", "how to", "guide" | Blog, tutorial, guide |
| Navigational | brand name, specific product | Homepage, product page |
| Transactional | "buy", "price", "subscribe" | Product page, pricing |
| Commercial | "best", "vs", "review", "top" | Comparison, review |

### Keyword Research Process
1. Identify seed keywords from business objectives
2. Expand with related terms, questions, long-tail variations
3. Analyze search volume and keyword difficulty
4. Group by topic clusters
5. Map keywords to pages (one primary keyword per page)
6. Prioritize by potential ROI

### Keyword Cannibalization (P1)
Multiple pages competing for the same keyword. Fix by:
- Consolidating into one comprehensive page
- Differentiating target keywords
- Using canonical tags if pages must coexist
- 301 redirecting the weaker page to the stronger one

### Topic Clusters
```
Pillar Page: "AI 투자 테마 완벽 가이드"
  ├── Cluster: "AI 반도체 테마 분석"
  ├── Cluster: "AI 헬스케어 투자 전망"
  ├── Cluster: "AI SaaS 관련 종목"
  └── Cluster: "테마 투자 vs 개별 종목 투자"
```
All cluster pages link to pillar, pillar links to all clusters.

---

## Featured Snippet Optimization

### Paragraph Snippet
Answer the question directly in 40-60 words right after the heading:
```markdown
## AI 테마 투자란?

AI 테마 투자는 인공지능 기술의 성장과 확산으로 수혜가
예상되는 기업들에 집중 투자하는 전략입니다. 반도체, 클라우드,
소프트웨어 등 AI 밸류체인 전반의 종목을 포함합니다.
```

### List Snippet
Use ordered or unordered lists with clear headings:
```markdown
## AI 테마 투자 시 주의사항

1. 테마 과열 여부 확인 (TLI 점수 활용)
2. 개별 종목의 펀더멘털 검증
3. 분산 투자로 리스크 관리
4. 장기 성장성 vs 단기 모멘텀 구분
5. 뉴스 과민반응 경계
```

### Table Snippet
Use markdown tables for comparison data.

---

## International SEO (hreflang)

### When to Use
Multi-language or multi-region content. Prevents duplicate content issues across locales.

### Next.js Implementation

```tsx
export const metadata: Metadata = {
  alternates: {
    canonical: 'https://example.com/themes/ai',
    languages: {
      'ko-KR': 'https://example.com/ko/themes/ai',
      'en-US': 'https://example.com/en/themes/ai',
      'x-default': 'https://example.com/themes/ai',
    },
  },
}
```

### Rules
- Every language version must reference all other versions (including itself)
- Include `x-default` for language/region selection pages
- Use ISO 639-1 language codes + optional ISO 3166-1 region: `ko-KR`, `en-US`, `ja-JP`
- Canonical and hreflang must not conflict
- All hreflang URLs must return 200 (not redirect)

---

## Content Checklist

### Before Publishing
- [ ] Primary keyword in title tag (under 60 chars)
- [ ] Unique meta description (150-160 chars, compelling)
- [ ] H1 tag with primary keyword
- [ ] URL slug optimized and readable
- [ ] Keyword in first 100 words
- [ ] Images compressed with descriptive alt text
- [ ] 3-5 internal links to relevant content
- [ ] External links to authoritative sources (where appropriate)
- [ ] Content depth appropriate for topic
- [ ] Schema markup implemented (see schema-markup.md)
- [ ] Mobile-friendly and responsive
- [ ] Canonical tag set correctly
- [ ] Open Graph meta tags for social sharing
- [ ] No broken links
- [ ] No duplicate content