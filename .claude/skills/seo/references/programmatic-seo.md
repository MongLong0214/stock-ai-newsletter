# Programmatic SEO Reference

## Table of Contents
1. [Core Principles](#core-principles)
2. [The 12 Playbooks](#the-12-playbooks)
3. [Choosing Your Playbook](#choosing-your-playbook)
4. [Implementation Framework](#implementation-framework)
5. [Internal Linking Architecture](#internal-linking-architecture)
6. [Indexation Strategy](#indexation-strategy)
7. [Quality Checks](#quality-checks)
8. [Common Mistakes](#common-mistakes)

---

## Core Principles

### 1. Unique Value Per Page
Every page must provide value specific to that page — not just swapped variables in a template. Maximize unique content. Avoid thin content penalties.

### 2. Proprietary Data Wins
Defensibility hierarchy:
1. **Proprietary** — data you created/generated
2. **Product-derived** — insights from your product usage
3. **User-generated** — reviews, comments, submissions
4. **Licensed** — exclusive access
5. **Public** — anyone can use (weakest)

### 3. Subfolders Over Subdomains
`yoursite.com/templates/resume/` (good) — inherits domain authority.
`templates.yoursite.com/resume/` (bad) — treated as separate site.

### 4. Genuine Search Intent Match
Pages must actually answer what people search for. Don't over-optimize keywords at expense of usefulness.

### 5. Scalable Quality > Quantity
100 great pages > 10,000 thin pages. Build quality checks into the process.

### 6. No Google Penalties
No doorway pages, no keyword stuffing, no duplicate content, genuine user utility.

---

## The 12 Playbooks

### 1. Templates
**Pattern**: "[type] template" / "free [type] template"
**URL**: `/templates/[type]/`
**Requirements**: Actually usable, multiple variations, quality comparable to paid options

### 2. Curation
**Pattern**: "best [category]" / "top [N] [things]"
**URL**: `/best/[category]/`
**Requirements**: Genuine evaluation criteria, real testing, regular updates

### 3. Conversions
**Pattern**: "[X] to [Y]" / "[amount] [unit] in [unit]"
**URL**: `/convert/[from]-to-[to]/`
**Requirements**: Accurate real-time data, fast functional tool, mobile-friendly

### 4. Comparisons
**Pattern**: "[X] vs [Y]" / "[X] alternative"
**URL**: `/compare/[x]-vs-[y]/`
**Requirements**: Honest balanced analysis, actual feature data, updated when products change

### 5. Examples
**Pattern**: "[type] examples" / "[category] inspiration"
**URL**: `/examples/[type]/`
**Requirements**: Real high-quality examples, screenshots, categorization, analysis

### 6. Locations
**Pattern**: "[service] in [location]"
**URL**: `/[service]/[city]/`
**Requirements**: Actual local data (not just city name swapped), local providers, location-specific insights

### 7. Personas
**Pattern**: "[product] for [audience]" / "[solution] for [industry]"
**URL**: `/for/[persona]/`
**Requirements**: Genuine persona-specific content, relevant testimonials, segment-specific use cases

### 8. Integrations
**Pattern**: "[your product] [other product] integration"
**URL**: `/integrations/[product]/`
**Requirements**: Real integration details, setup instructions, use cases, working integration

### 9. Glossary
**Pattern**: "what is [term]" / "[term] definition"
**URL**: `/glossary/[term]/`
**Requirements**: Clear definitions, examples/context, related terms linked, more depth than dictionary

### 10. Translations
**Pattern**: Same content in multiple languages
**URL**: `/[lang]/[page]/`
**Requirements**: Quality translation (not machine-only), cultural localization, hreflang tags, native review

### 11. Directory
**Pattern**: "[category] tools" / "[type] software"
**URL**: `/directory/[category]/`
**Requirements**: Comprehensive coverage, useful filtering, details per listing, regular updates

### 12. Profiles
**Pattern**: "[person/company name]" / "[entity] + [attribute]"
**URL**: `/people/[name]/` or `/companies/[name]/`
**Requirements**: Accurate sourced information, regularly updated, unique insights

---

## Choosing Your Playbook

| If you have... | Consider... |
|----------------|-------------|
| Proprietary data | Stats, Directories, Profiles |
| Product with integrations | Integrations |
| Design/creative product | Templates, Examples |
| Multi-segment audience | Personas |
| Local presence | Locations |
| Tool or utility product | Conversions |
| Content/expertise | Glossary, Curation |
| International potential | Translations |
| Competitor landscape | Comparisons |

### Combine Playbooks
- Locations + Personas: "Marketing agencies for startups in Austin"
- Curation + Locations: "Best coworking spaces in San Diego"
- Glossary + Translations: Multi-language educational content

---

## Implementation Framework

### 1. Keyword Pattern Research
- Identify the repeating structure and variables
- Validate aggregate search volume for the pattern
- Assess volume distribution (head vs long tail)
- Check competition: who ranks, what quality, can you compete?

### 2. Data Requirements
Define data schema for each page type:
```
For "[Theme] 투자 분석" pages:

theme:
  - name, slug, description
  - tli_score, lifecycle_stage
  - related_keywords

stocks:
  - name, ticker, price
  - relevance_score

news:
  - title, source, date
  - momentum_score
```

### 3. Template Design
- Header with target keyword in H1
- Unique intro (not just variable substitution)
- Data-driven sections with conditional content
- Related pages / internal links
- CTAs appropriate to search intent
- FAQ section with schema markup

### 4. Uniqueness Strategy
Each page needs differentiated content:
- Conditional sections based on data availability
- Dynamic insights from data analysis
- Cross-referencing with related entities
- Time-based freshness (last updated dates)

---

## Internal Linking Architecture

### Hub and Spoke Model
- **Hub**: Main category page (e.g., `/themes/`)
- **Spokes**: Individual pages (e.g., `/themes/ai-semiconductor/`)
- **Cross-links**: Related spokes link to each other

### Requirements
- Every page reachable from main site
- Logical category structure
- Breadcrumbs with BreadcrumbList schema
- XML sitemap includes all pages
- No orphan pages

---

## Indexation Strategy

### Priority-Based
- Index high-volume patterns first
- Noindex very thin variations
- Monitor indexation rate in Search Console

### Crawl Budget
- Paginate large lists thoughtfully
- Avoid infinite crawl traps (parameter loops)
- Separate sitemaps by page type
- Use `robots.txt` to block crawl of low-value filtered/sorted pages

---

## Quality Checks

### Pre-Launch
- [ ] Each page provides unique value beyond variable substitution
- [ ] Content answers genuine search intent
- [ ] Unique titles and meta descriptions per page
- [ ] Schema markup implemented and validated
- [ ] Canonical tags correct
- [ ] Connected to site architecture (not orphaned)
- [ ] In XML sitemap
- [ ] Page speed acceptable
- [ ] Mobile-friendly

### Post-Launch Monitoring
- Indexation rate (Search Console)
- Rankings by page pattern
- Traffic by page pattern
- Engagement metrics (bounce rate, time on page)
- Thin content warnings in Search Console
- Manual actions

---

## Common Mistakes

| Mistake | Severity | Impact |
|---------|----------|--------|
| Identical content with only city/name swapped | P0 | Thin content penalty |
| Multiple pages targeting same keyword | P1 | Keyword cannibalization |
| Pages with no search demand | P2 | Wasted crawl budget |
| Outdated or incorrect data | P1 | Trust erosion, poor UX |
| No conversion path on pages | P2 | Traffic with no business value |
| Generating thousands of pages at once | P1 | Crawl budget overwhelm, quality drop |
| No internal linking between pages | P1 | Orphan pages, poor crawlability |