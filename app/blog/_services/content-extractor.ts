/** HTML 콘텐츠 추출 + 가독성 점수 계산 */

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { ScrapedContent } from '../_types/blog';

// --- 상수 ---

const LIMITS = {
  MIN_PARAGRAPH: 30,
  MAX_PARAGRAPH: 2000,
  MIN_DIV: 50,
  MAX_HEADING: 200,
  MAX_PARAGRAPHS: 50,
  MIN_CONTENT_SCORE: 100,
} as const;

const REMOVE_SELECTORS = [
  'script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'iframe', 'form',
  'button', 'input', 'select', 'textarea', 'svg', 'canvas', 'video', 'audio',
  '.ad', '.ads', '.advertisement', '.sidebar', '.menu', '.comment', '.comments',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[aria-label*="광고"]',
];

// --- 인터페이스 ---

interface ContentBlock {
  element: cheerio.Cheerio<AnyNode>;
  text: string;
  score: number;
  wordCount: number;
}

// --- 유틸 ---

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function cleanHtml($: cheerio.CheerioAPI): void {
  $(REMOVE_SELECTORS.join(', ')).remove();
}

// --- 가독성 점수 ---

function calculateReadabilityScore($element: cheerio.Cheerio<AnyNode>): number {
  let score = 0;
  const text = $element.text();
  const wordCount = countWords(text);

  if (wordCount > 100) score += 25;
  if (wordCount > 200) score += 25;
  if (wordCount > 300) score += 25;

  const paragraphCount = $element.find('p').length;
  score += Math.min(paragraphCount * 3, 30);

  // 링크 밀도: 낮을수록 본문일 가능성 높음
  const linkText = $element.find('a').text().length;
  const linkDensity = text.length > 0 ? linkText / text.length : 0;
  if (linkDensity < 0.2) score += 15;
  else if (linkDensity < 0.4) score += 10;

  if ($element.find('p').length > 3) score += 10;
  if ($element.find('h2, h3').length > 0) score += 10;

  if ($element.attr('class')?.match(/comment|sidebar|nav|footer|header/i)) score -= 50;
  if ($element.attr('id')?.match(/comment|sidebar|nav|footer|header/i)) score -= 50;

  return score;
}

function findBestContentBlock($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> | null {
  const candidates: ContentBlock[] = [];

  $('article, main, [role="main"], .post-content, .entry-content, .article-content, .content, #content').each((_, el) => {
    const $el = $(el);
    const text = $el.text();
    const wordCount = countWords(text);

    if (wordCount > 50) {
      candidates.push({ element: $el, text, score: calculateReadabilityScore($el), wordCount });
    }
  });

  // 폴백: div 전체 탐색
  if (candidates.length === 0) {
    $('div').each((_, el) => {
      const $el = $(el);
      const text = $el.text();
      const wordCount = countWords(text);

      if (wordCount > 100) {
        candidates.push({ element: $el, text, score: calculateReadabilityScore($el), wordCount });
      }
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].score >= LIMITS.MIN_CONTENT_SCORE ? candidates[0].element : null;
}

// --- 메인 추출 ---

export function extractContent(
  $: cheerio.CheerioAPI,
  url: string,
  customContentSelector?: string,
): ScrapedContent {
  const title =
    $('h1').first().text().trim() ||
    $('title').text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    '';

  const description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    '';

  const headings = { h1: [] as string[], h2: [] as string[], h3: [] as string[] };

  ['h1', 'h2', 'h3'].forEach((tag) => {
    $(tag).each((_, el) => {
      const text = normalizeText($(el).text());
      if (text.length > 0 && text.length < LIMITS.MAX_HEADING) {
        headings[tag as keyof typeof headings].push(text);
      }
    });
  });

  let $mainContent: cheerio.Cheerio<AnyNode> | null = null;

  if (customContentSelector) {
    $mainContent = $(customContentSelector).first();
    if ($mainContent.length === 0) {
      $mainContent = null;
    }
  }

  if (!$mainContent) {
    $mainContent = findBestContentBlock($);
  }

  if (!$mainContent || $mainContent.length === 0) {
    $mainContent = $('body');
  }

  const paragraphs: string[] = [];
  const $content = cheerio.load($mainContent.html() || '');

  $content('p').each((_, el) => {
    const text = normalizeText($content(el).text());
    if (text.length >= LIMITS.MIN_PARAGRAPH && text.length <= LIMITS.MAX_PARAGRAPH) {
      paragraphs.push(text);
    }
  });

  // 단락이 부족하면 div에서 추출
  if (paragraphs.length < 3) {
    $content('div').each((_, el) => {
      const text = normalizeText($content(el).text());
      if (text.length >= LIMITS.MIN_DIV && text.length <= LIMITS.MAX_PARAGRAPH) {
        const isDuplicate = paragraphs.some((p) => p.includes(text) || text.includes(p));
        if (!isDuplicate) paragraphs.push(text);
      }
    });
  }

  const wordCount = countWords(paragraphs.join(' '));

  return {
    url,
    title: normalizeText(title),
    description: normalizeText(description),
    headings,
    paragraphs: paragraphs.slice(0, LIMITS.MAX_PARAGRAPHS),
    wordCount,
    scrapedAt: new Date().toISOString(),
  };
}
