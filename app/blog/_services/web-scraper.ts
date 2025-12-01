/**
 * 웹 스크래핑 서비스
 * Cheerio를 사용하여 경쟁사 페이지 콘텐츠 추출
 */

import * as cheerio from 'cheerio';
import { PIPELINE_CONFIG, CONTENT_GAPS } from '../_config/pipeline-config';
import { fetchWithTimeout } from '../_utils/fetch-helpers';
import type { ScrapedContent, CompetitorAnalysis, SerpSearchResult } from '../_types/blog';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

const REMOVE_SELECTORS = 'script, style, nav, header, footer, aside, iframe, noscript, svg, form, button, input, select, textarea, .ad, .ads, .advertisement, .sidebar, .menu, .nav, .navigation, .comment, .comments, [role="navigation"], [role="banner"], [role="contentinfo"]';

function cleanHtml($: cheerio.CheerioAPI): void {
  $(REMOVE_SELECTORS).remove();
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** 단일 URL 스크래핑 */
export async function scrapeUrl(url: string): Promise<ScrapedContent | null> {
  try {
    const response = await fetchWithTimeout(
      url,
      { headers: BROWSER_HEADERS },
      PIPELINE_CONFIG.requestTimeout
    );

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      console.warn(`   ⚠️ HTML이 아님: ${contentType}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 불필요한 요소 제거
    cleanHtml($);

    // 제목 추출
    const title =
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      '';

    // 설명 추출
    const description =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    // 헤딩 추출
    const h1: string[] = [];
    const h2: string[] = [];
    const h3: string[] = [];

    $('h1').each((_, el) => {
      const text = normalizeText($(el).text());
      if (text.length > 0 && text.length < 200) h1.push(text);
    });

    $('h2').each((_, el) => {
      const text = normalizeText($(el).text());
      if (text.length > 0 && text.length < 200) h2.push(text);
    });

    $('h3').each((_, el) => {
      const text = normalizeText($(el).text());
      if (text.length > 0 && text.length < 200) h3.push(text);
    });

    // 본문 단락 추출 (메인 콘텐츠 영역 우선)
    const paragraphs: string[] = [];
    const mainContent =
      $('article, main, [role="main"], .content, .post-content, .entry-content')
        .first()
        .html() || $('body').html() || '';

    const $main = cheerio.load(mainContent);
    $main('p').each((_, el) => {
      const text = normalizeText($main(el).text());
      // 너무 짧거나 긴 단락 제외
      if (text.length >= 30 && text.length <= 2000) {
        paragraphs.push(text);
      }
    });

    // 단어 수 계산
    const fullText = paragraphs.join(' ');
    const wordCount = countWords(fullText);

    const scrapedContent: ScrapedContent = {
      url,
      title: normalizeText(title),
      description: normalizeText(description),
      headings: { h1, h2, h3 },
      paragraphs: paragraphs.slice(0, 50), // 최대 50개 단락
      wordCount,
      scrapedAt: new Date().toISOString(),
    };

    return scrapedContent;
  } catch (error) {
    console.warn(`   ⚠️ 스크래핑 실패 (${url}):`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

const SCRAPE_DELAY = 500;

/** 여러 검색 결과 스크래핑 */
export async function scrapeSearchResults(
  searchResults: SerpSearchResult[]
): Promise<ScrapedContent[]> {
  const scrapedContents: ScrapedContent[] = [];

  for (const result of searchResults) {
    const content = await scrapeUrl(result.link);
    if (content) scrapedContents.push(content);
    await new Promise((resolve) => setTimeout(resolve, SCRAPE_DELAY));
  }

  return scrapedContents;
}

/** 경쟁사 콘텐츠 분석 */
export function analyzeCompetitors(
  scrapedContents: ScrapedContent[],
  targetKeyword: string
): CompetitorAnalysis {
  const topicCounts = new Map<string, number>();
  scrapedContents.forEach((content) => {
    content.headings.h2.forEach((heading) => {
      const normalized = heading.toLowerCase();
      topicCounts.set(normalized, (topicCounts.get(normalized) || 0) + 1);
    });
  });

  const commonTopics = Array.from(topicCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic]) => topic);

  const totalWords = scrapedContents.reduce((sum, c) => sum + c.wordCount, 0);
  const averageWordCount = Math.round(totalWords / scrapedContents.length) || 0;

  const keywordDensity: Record<string, number> = {};
  const relatedKeywords = targetKeyword.toLowerCase().split(' ');

  scrapedContents.forEach((content) => {
    const fullText = content.paragraphs.join(' ').toLowerCase();
    relatedKeywords.forEach((keyword) => {
      if (keyword.length >= 2) {
        const matches = fullText.match(new RegExp(keyword, 'gi'));
        keywordDensity[keyword] = (keywordDensity[keyword] || 0) + (matches?.length || 0);
      }
    });
  });

  return {
    totalCompetitors: scrapedContents.length,
    commonTopics,
    averageWordCount,
    keywordDensity,
    contentGaps: [...CONTENT_GAPS],
    scrapedContents,
  };
}