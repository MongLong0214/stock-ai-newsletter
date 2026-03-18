# SEO Audit Framework

## Table of Contents
1. [Audit Workflow](#audit-workflow)
2. [Priority-Ordered Audit Areas](#priority-ordered-audit-areas)
3. [Site-Type Specific Issues](#site-type-specific-issues)
4. [Report Structure](#report-structure)
5. [Tools](#tools)

---

## Audit Workflow

```
1. Understand scope (full site? specific pages? specific area?)
2. Gather context (site type, goals, known issues, recent changes)
3. Scan codebase for anti-patterns (Serena search_for_pattern first)
4. Audit in priority order: Crawlability → Technical → On-Page → Content → Authority
5. Classify findings by severity (P0-P3)
6. Generate prioritized action plan
7. Provide verification steps for each fix
```

### Initial Questions
1. What type of site? (SaaS, e-commerce, blog, newsletter, etc.)
2. Primary business goal for SEO?
3. Priority keywords/topics?
4. Any known issues or recent changes/migrations?
5. Current organic traffic baseline?
6. Full site audit or specific focus area?

---

## Priority-Ordered Audit Areas

### 1. Crawlability & Indexation (P0 if broken)

**Robots.txt**
- No unintentional blocks on important pages
- Sitemap URL referenced
- Check with: `app/robots.ts` or `public/robots.txt`

**XML Sitemap**
- Exists, accessible, valid format
- Contains only canonical, indexable URLs
- Updated with real `lastmod` dates
- Check with: `app/sitemap.ts` or `public/sitemap.xml`

**Index Status**
- Compare indexed count vs expected (site:domain.com)
- Search Console coverage report

**Canonicalization**
- Every page has canonical tag
- Self-referencing on unique pages
- HTTP/HTTPS, www/non-www, trailing slash consistency

**Redirect Health**
- No chains > 2 hops
- No loops
- HTTP → HTTPS redirects working

### 2. Technical Foundations (P1)

**Core Web Vitals**
- LCP < 2.5s
- INP < 200ms
- CLS < 0.1
- Check with PageSpeed Insights / Search Console CWV report

**Mobile-Friendliness**
- Responsive design
- Viewport configured
- Tap targets adequate (48x48px minimum)
- No horizontal scroll

**HTTPS**
- Valid SSL
- No mixed content
- HTTP → HTTPS redirects

**Page Speed**
- TTFB < 800ms
- Images optimized (WebP, lazy loading, dimensions set)
- Render-blocking resources minimized
- Caching headers appropriate

### 3. On-Page SEO (P1-P2)

**Title Tags** — Scan all pages for:
- Missing titles
- Duplicate titles
- Truncation (> 60 chars)
- Missing primary keyword
- Generic titles

**Meta Descriptions** — Scan for:
- Missing descriptions
- Duplicate descriptions
- Truncation (> 160 chars)

**Heading Structure** — Scan for:
- Missing H1
- Multiple H1s
- Skipped heading levels
- H1 missing primary keyword

**Image Optimization** — Scan for:
- Missing alt text
- Uncompressed images
- Missing width/height
- Non-WebP format

**Internal Linking** — Check for:
- Orphan pages
- Broken internal links
- Over-optimized anchor text
- Important pages with few incoming links

### 4. Content Quality (P2)

**E-E-A-T Assessment**
- Author information visible?
- Original data/insights present?
- Sources cited?
- Content accurate and up-to-date?

**Content Depth**
- Thin pages (< 200 words unique content)?
- Pages that don't answer search intent?
- Duplicate or near-duplicate content?

**Keyword Strategy**
- Each important page has clear primary keyword?
- No keyword cannibalization?
- Topic clusters implemented?

### 5. Authority & Off-Page SEO (P1-P2)

**Backlink Profile**
- Total referring domains count and trend
- Domain authority/rating of linking sites
- Toxic/spammy links that need disavow
- Anchor text distribution (natural vs over-optimized)

**Link Building Opportunities**
- Broken link building (find broken links on relevant sites → offer your content)
- Guest posting on industry-relevant sites
- Digital PR (data-driven stories, original research)
- Resource page link building
- Competitor backlink gap analysis (links they have, you don't)

**Brand Signals**
- Brand mentions without links (unlinked brand mentions → outreach for links)
- Social media presence and engagement
- Google Business Profile (if local)
- NAP consistency across directories

### 6. Structured Data (P2-P3)

**Schema Audit**
- Appropriate schema types used?
- Required properties present?
- Schema matches visible content?
- Valid JSON-LD?
- Rich Results Test passing?

---

## Site-Type Specific Issues

### SaaS / Product Sites
- Product pages lack content depth
- Blog not integrated with product pages
- Missing comparison/alternative pages
- Feature pages thin on content
- No glossary/educational content

### Content / Blog / Newsletter Sites
- Outdated content not refreshed
- Keyword cannibalization between posts
- No topical clustering
- Poor internal linking between related posts
- Missing author pages/bios
- No schema markup on articles

### E-commerce
- Thin category pages
- Duplicate product descriptions
- Missing Product schema
- Faceted navigation creating duplicates
- Out-of-stock pages mishandled (should 301 or show alternatives)

### Local Business
- Inconsistent NAP (Name, Address, Phone)
- Missing LocalBusiness schema
- No Google Business Profile optimization
- Missing location-specific content

### Korean Market Sites (한국 시장)
- 네이버 서치어드바이저 미등록
- 네이버봇(Yeti) robots.txt에서 차단
- SSR/SSG 미적용 (네이버봇 JS 렌더링 한계)
- Open Graph 메타태그 미설정 (네이버 스니펫 품질 저하)
- 네이버 VIEW 탭 미노출
- Daum 웹마스터 도구에 sitemap 미제출

---

## Report Structure

### Executive Summary
- Overall health score:
  - **Critical**: P0 1건 이상
  - **Needs Work**: P0 0건 + P1 3건 이상
  - **Good**: P0 0건 + P1 0-2건 + P2 any
  - **Excellent**: P0 0건 + P1 0건 + P2 3건 이하
- Top 3-5 priority issues
- Quick wins identified
- Estimated impact of fixes

### Findings Table

For each finding:
| Field | Description |
|-------|-------------|
| **Issue** | What's wrong |
| **Severity** | P0 / P1 / P2 / P3 |
| **Evidence** | File path, line number, or URL |
| **Impact** | SEO impact description |
| **Fix** | Specific code change or recommendation |
| **Verification** | How to confirm the fix |

### Prioritized Action Plan

1. **P0 Critical** — Blocking indexation or causing penalties. Fix immediately.
2. **P1 High** — Significant ranking impact. Fix this sprint.
3. **P2 Medium** — Improvement opportunities. Schedule.
4. **P3 Low** — Nice-to-have. Backlog.

Within each priority: order by effort (quick wins first).

### Codebase Scan Strategy

Use Serena `search_for_pattern` to scan for anti-patterns before deep-reading files:

```
Scan targets:
- Missing metadata exports in page/layout files
- Hardcoded strings where dynamic metadata should be
- Images without alt props
- Missing canonical/OG tags
- console.log in production code
- Inline styles affecting CLS
- Missing loading="lazy" on images
- Non-WebP image imports
```

Only Read files that have actual hits from the scan.

### Google Search Console 진단 워크플로우

```
1. Performance Report
   - 총 클릭/노출/CTR/평균 순위 트렌드 (28일 vs 이전 28일)
   - 상위 쿼리: CTR 낮은 고노출 키워드 → title/description 최적화 기회
   - 상위 페이지: 노출 높고 클릭 낮은 페이지 → snippet 개선 대상

2. URL Inspection Tool
   - 중요 페이지의 인덱싱 상태 확인
   - 모바일 사용 가능 여부
   - 리치 결과 적격성
   - 마지막 크롤 날짜 확인

3. Coverage (페이지 색인 생성)
   - "오류" 탭: 5xx, 리다이렉트 오류, soft 404
   - "제외됨" 탭: noindex, canonical 차이, 중복 등
   - "유효" vs "제외" 비율이 비정상적이면 크롤링 문제

4. Core Web Vitals Report
   - "불량" URL 그룹 → 우선 수정 대상
   - "개선 필요" → 다음 스프린트

5. Enhancements (개선 사항)
   - 구조화된 데이터 오류/경고
   - 모바일 사용 편의성 문제
   - 빵 부스러기(Breadcrumb) 오류
```

### 네이버 서치어드바이저 감사 항목

- 사이트 등록 여부 (searchadvisor.naver.com)
- sitemap.xml 제출 상태
- robots.txt에서 Yeti(네이버봇) 차단 여부
- 웹 페이지 수집 현황 (수집 성공/실패 비율)
- SSR/SSG 확인 (네이버봇 JS 렌더링 제한)
- Open Graph 메타태그 검증 (네이버 검색 스니펫에 활용)
- 네이버 VIEW 탭 노출 여부

---

## Tools

### Free (Essential)
- Google Search Console — performance, indexing, CWV
- Google PageSpeed Insights — CWV scores and recommendations
- Rich Results Test — structured data validation
- Mobile-Friendly Test — responsiveness check
- Schema Markup Validator — JSON-LD validation

### Paid (If Available)
- Screaming Frog — comprehensive crawl analysis
- Ahrefs / Semrush — keywords, backlinks, competition
- Sitebulb — technical audit visualization
- ContentKing — real-time monitoring