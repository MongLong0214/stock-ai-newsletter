/** 경쟁사 콘텐츠 분석 + 키워드 추출 */

import { CONTENT_GAPS } from '../_config/pipeline-config';
import type { ScrapedContent, CompetitorAnalysis } from '../_types/blog';

// --- 정규식 상수 (루프 밖에서 한 번만 컴파일) ---

const SUFFIX_RE = /(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|까지|부터|라고|하는|한|된|되는|있는|없는|같은|대한|위한|통한)$/;
const STOP_RE = /있습니다|합니다|됩니다|입니다|그리고|하지만|그래서|따라서|이것|그것|우리|여기/;
const HANGUL_ALPHA_RE = /[가-힣a-zA-Z]/;
const NON_WORD_RE = /[^\w\s가-힣]/g;

// --- 유틸 ---

/** 텍스트에서 유효한 2-4어절 키워드 추출 */
function extractKeywords(text: string): string[] {
  const words = text.replace(NON_WORD_RE, ' ').split(/\s+/).filter(w => w.length >= 2);
  const results: string[] = [];

  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i <= words.length - n; i++) {
      const phrase = words.slice(i, i + n).join(' ').replace(SUFFIX_RE, '').trim();
      if (phrase.length >= 4 && phrase.length <= 25 && HANGUL_ALPHA_RE.test(phrase) && !STOP_RE.test(phrase)) {
        results.push(phrase);
      }
    }
  }

  return results;
}

// --- 메인 분석 ---

export function analyzeCompetitors(
  scrapedContents: ScrapedContent[],
  targetKeyword: string,
): CompetitorAnalysis {
  if (scrapedContents.length === 0) {
    return {
      totalCompetitors: 0,
      commonTopics: [],
      averageWordCount: 1500,
      keywordDensity: {},
      contentGaps: [...CONTENT_GAPS],
      scrapedContents: [],
      competitorKeywords: [],
    };
  }

  // 1. H2 헤딩 기반 공통 토픽
  const topicCounts = new Map<string, number>();
  scrapedContents.forEach((content) => {
    content.headings.h2.forEach((heading) => {
      const normalized = heading.toLowerCase();
      topicCounts.set(normalized, (topicCounts.get(normalized) || 0) + 1);
    });
  });

  const minOccurrence = scrapedContents.length >= 3 ? 2 : 1;
  const commonTopics = Array.from(topicCounts.entries())
    .filter(([, count]) => count >= minOccurrence)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic]) => topic);

  // 2. 평균 단어 수
  const validContents = scrapedContents.filter((c) => c.wordCount > 100);
  const totalWords = validContents.reduce((sum, c) => sum + c.wordCount, 0);
  const averageWordCount = validContents.length > 0
    ? Math.round(totalWords / validContents.length)
    : 1500;

  // 3. 타겟 키워드 밀도
  const keywordDensity: Record<string, number> = {};
  const relatedKeywords = targetKeyword.toLowerCase().split(' ').filter((k) => k.length >= 2);
  const regexCache = new Map<string, RegExp>();

  relatedKeywords.forEach((keyword) => {
    regexCache.set(keyword, new RegExp(keyword, 'gi'));
  });

  scrapedContents.forEach((content) => {
    const fullText = content.paragraphs.join(' ').toLowerCase();
    relatedKeywords.forEach((keyword) => {
      const regex = regexCache.get(keyword)!;
      regex.lastIndex = 0;
      const matches = fullText.match(regex);
      keywordDensity[keyword] = (keywordDensity[keyword] || 0) + (matches?.length || 0);
    });
  });

  // 4. 경쟁사 키워드 추출 (제목/헤딩만)
  const keywordMap = new Map<string, { count: number; sources: Set<string> }>();

  const addKeyword = (kw: string, url: string, weight: number) => {
    const entry = keywordMap.get(kw) || { count: 0, sources: new Set<string>() };
    entry.count += weight;
    entry.sources.add(url);
    keywordMap.set(kw, entry);
  };

  scrapedContents.forEach(({ url, title, headings }) => {
    extractKeywords(title).forEach(kw => addKeyword(kw, url, 3));
    [...headings.h1, ...headings.h2].forEach(h =>
      extractKeywords(h).forEach(kw => addKeyword(kw, url, 2)),
    );
  });

  const competitorKeywords = Array.from(keywordMap.entries())
    .map(([keyword, { count, sources }]) => ({ keyword, count, sources: Array.from(sources) }))
    .sort((a, b) => b.sources.length - a.sources.length || b.count - a.count)
    .slice(0, 20);

  return {
    totalCompetitors: scrapedContents.length,
    commonTopics,
    averageWordCount,
    keywordDensity,
    contentGaps: [...CONTENT_GAPS],
    scrapedContents,
    competitorKeywords,
  };
}
