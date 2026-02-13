/** 콘텐츠 생성, 키워드, 검색, 스크래핑 타입 */

import type { ContentType, FAQItem } from './blog-post';

export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

export type KeywordDifficulty = 'low' | 'medium' | 'high';

export type TopicArea =
  | 'technical' | 'value' | 'strategy' | 'market'
  | 'discovery' | 'psychology' | 'education' | 'execution'
  | 'theme';

export interface KeywordMetadata {
  keyword: string;
  searchIntent: SearchIntent;
  difficulty: KeywordDifficulty;
  estimatedSearchVolume: number;
  relevanceScore: number;
  contentType: ContentType;
  topicArea: TopicArea;
  reasoning: string;
}

/** AI가 생성한 콘텐츠 (Gemini API JSON 응답) */
export interface GeneratedContent {
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  /** Markdown 형식 */
  content: string;
  /** H2 헤딩 목록 */
  headings: string[];
  faqItems: FAQItem[];
  suggestedTags: string[];
}

export interface SerpSearchResult {
  /** 검색 순위 (1부터 시작) */
  position: number;
  title: string;
  link: string;
  snippet: string;
  /** 표시용 단축 URL */
  displayed_link: string;
}

export interface SerpApiResponse {
  search_metadata: {
    id: string;
    status: string;
    total_time_taken: number;
  };
  search_parameters: {
    q: string;
    /** google.co.kr 등 */
    google_domain: string;
    /** 언어 코드 (ko 등) */
    hl: string;
  };
  organic_results: SerpSearchResult[];
}

export interface ScrapedContent {
  url: string;
  title: string;
  /** meta description */
  description: string;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  paragraphs: string[];
  wordCount: number;
  /** ISO 형식 */
  scrapedAt: string;
}

export interface CompetitorAnalysis {
  totalCompetitors: number;
  /** 2개 이상 경쟁사가 다루는 H2 헤딩 */
  commonTopics: string[];
  averageWordCount: number;
  /** 키워드별 출현 빈도 */
  keywordDensity: Record<string, number>;
  /** 경쟁사가 다루지 않는 차별점 */
  contentGaps: string[];
  scrapedContents: ScrapedContent[];
  /** 출현 빈도순 */
  competitorKeywords: Array<{ keyword: string; count: number; sources: string[] }>;
}
