/**
 * 블로그 시스템 타입 정의
 *
 * [이 파일의 역할]
 * - 블로그 시스템 전체에서 사용되는 TypeScript 타입 정의
 * - 타입 안전성(Type Safety) 보장
 * - 코드 자동 완성 및 문서화
 *
 * [타입이 왜 중요한가?]
 * - 컴파일 시점에 오류 발견 가능
 * - IDE에서 자동 완성 지원
 * - 코드 문서화 효과
 *
 * [타입 구조]
 * 1. Database Types: Supabase 테이블과 1:1 매핑
 * 2. SerpApi Types: 구글 검색 API 응답 타입
 * 3. Web Scraping Types: 스크래핑 결과 타입
 * 4. Content Generation Types: AI 생성 콘텐츠 타입
 * 5. Pipeline Types: 파이프라인 실행 관련 타입
 */

// ============================================================================
// Database Types
// Supabase blog_posts 테이블과 매핑되는 타입들
// ============================================================================

/**
 * 블로그 포스트 상태
 */
export type BlogPostStatus = 'draft' | 'published' | 'archived';

/**
 * 키워드 검색 의도
 */
export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

/**
 * 키워드 난이도
 */
export type KeywordDifficulty = 'low' | 'medium' | 'high';

/**
 * 콘텐츠 타입
 */
export type ContentType = 'comparison' | 'guide' | 'listicle' | 'review';

/**
 * FAQ 아이템 (자주 묻는 질문)
 *
 * [Schema.org 연동]
 * - Google 검색 결과에 FAQ 리치 스니펫으로 표시 가능
 * - 각 포스트당 3-5개 권장
 */
export interface FAQItem {
  /** 질문 (예: "Stock Matrix는 무료인가요?") */
  question: string;
  /** 답변 (예: "네, Stock Matrix는 완전 무료입니다.") */
  answer: string;
}

/**
 * Schema.org 구조화 데이터
 *
 * [용도]
 * - 검색엔진이 페이지 내용을 이해하도록 도움
 * - Google 검색 결과에 리치 스니펫 표시
 *
 * [포함 정보]
 * - 글 제목, 설명
 * - 작성자, 발행처
 * - 발행일, 수정일
 * - 키워드
 */
export interface SchemaData {
  /** Schema.org 컨텍스트 URL (항상 'https://schema.org') */
  '@context': 'https://schema.org';
  /** 콘텐츠 타입 (Article 또는 BlogPosting) */
  '@type': 'Article' | 'BlogPosting';
  /** 글 제목 */
  headline: string;
  /** 글 설명 */
  description: string;
  /** 작성자 정보 */
  author: {
    '@type': 'Organization';
    name: string;
    url: string;
  };
  /** 발행처 정보 (로고 포함) */
  publisher: {
    '@type': 'Organization';
    name: string;
    logo: {
      '@type': 'ImageObject';
      url: string;
    };
  };
  /** 최초 발행일 (ISO 형식) */
  datePublished: string;
  /** 마지막 수정일 (ISO 형식) */
  dateModified: string;
  /** 페이지 URL 정보 */
  mainEntityOfPage: {
    '@type': 'WebPage';
    '@id': string;
  };
  /** 대표 이미지 URL (선택) */
  image?: string;
  /** 키워드 (쉼표로 구분) */
  keywords?: string;
}

/**
 * 블로그 포스트 전체 데이터 (DB 스키마)
 *
 * [Supabase 테이블]
 * - 테이블명: blog_posts
 * - 모든 필드가 DB 컬럼과 1:1 매핑
 *
 * [주요 필드 설명]
 * - slug: URL에 사용되는 고유 식별자 (예: 'best-stock-newsletter')
 * - target_keyword: SEO 타겟 키워드 (예: '주식 뉴스레터 추천')
 * - schema_data: JSON 형식의 Schema.org 데이터
 * - faq_items: JSON 형식의 FAQ 배열
 */
export interface BlogPost {
  /** 고유 ID (UUID) */
  id: string;
  /** URL 슬러그 (예: 'best-stock-newsletter-2024') */
  slug: string;
  /** 글 제목 */
  title: string;
  /** 글 설명 (meta description과 동일) */
  description: string;
  /** 본문 내용 (Markdown 형식) */
  content: string;
  /** SEO 메타 제목 (60자 이내 권장) */
  meta_title: string | null;
  /** SEO 메타 설명 (155자 이내 권장) */
  meta_description: string | null;
  /** 정규 URL (중복 콘텐츠 방지) */
  canonical_url: string | null;
  /** SEO 타겟 키워드 */
  target_keyword: string;
  /** 보조 키워드 배열 */
  secondary_keywords: string[] | null;
  /** 카테고리 (예: '주식 뉴스레터', '기술적 분석') */
  category: string;
  /** 태그 배열 */
  tags: string[] | null;
  /** 분석에 사용된 경쟁사 URL 배열 */
  competitor_urls: string[] | null;
  /** 분석한 경쟁사 수 */
  competitor_count: number;
  /** AI 콘텐츠 생성에 사용된 프롬프트 */
  generation_prompt: string | null;
  /** 포스트 상태 (draft/published/archived) */
  status: BlogPostStatus;
  /** 발행일 (ISO 형식) */
  published_at: string | null;
  /** 조회수 */
  view_count: number;
  /** Schema.org 구조화 데이터 */
  schema_data: SchemaData | null;
  /** FAQ 아이템 배열 */
  faq_items: FAQItem[] | null;
  /** 관련 포스트 slug 배열 */
  related_posts: string[] | null;
  /** 생성일 (ISO 형식) */
  created_at: string;
  /** 수정일 (ISO 형식) */
  updated_at: string;
}

/**
 * 블로그 포스트 생성 입력 타입
 *
 * [BlogPost와의 차이]
 * - id, created_at, updated_at 등 자동 생성 필드 제외
 * - 선택적 필드는 ?로 표시
 *
 * [사용 위치]
 * - saveBlogPost() 함수의 파라미터
 * - 콘텐츠 파이프라인에서 새 포스트 생성 시
 */
export interface BlogPostCreateInput {
  /** URL 슬러그 (필수) */
  slug: string;
  /** 글 제목 (필수) */
  title: string;
  /** 글 설명 (필수) */
  description: string;
  /** 본문 내용 (필수) */
  content: string;
  /** SEO 메타 제목 (선택) */
  meta_title?: string;
  /** SEO 메타 설명 (선택) */
  meta_description?: string;
  /** SEO 타겟 키워드 (필수) */
  target_keyword: string;
  /** 보조 키워드 배열 (선택) */
  secondary_keywords?: string[];
  /** 카테고리 (선택, 기본값 사용 가능) */
  category?: string;
  /** 태그 배열 (선택) */
  tags?: string[];
  /** 경쟁사 URL 배열 (선택) */
  competitor_urls?: string[];
  /** 경쟁사 수 (선택) */
  competitor_count?: number;
  /** 생성 프롬프트 (선택) */
  generation_prompt?: string;
  /** 상태 (선택, 기본값: draft) */
  status?: BlogPostStatus;
  /** 발행일 (선택, status가 published일 때 자동 설정됨) */
  published_at?: string;
  /** Schema.org 데이터 (선택) */
  schema_data?: SchemaData;
  /** FAQ 아이템 배열 (선택) */
  faq_items?: FAQItem[];
}

/**
 * 블로그 포스트 목록 아이템 (경량 버전)
 *
 * [왜 별도 타입이 필요한가?]
 * - 목록 페이지에서는 전체 content가 필요 없음
 * - 불필요한 데이터 전송 방지 (성능 최적화)
 * - Supabase select()에서 필요한 필드만 조회
 *
 * [사용 위치]
 * - /blog 목록 페이지
 * - BlogCard 컴포넌트
 */
export interface BlogPostListItem {
  /** URL 슬러그 */
  slug: string;
  /** 글 제목 */
  title: string;
  /** 글 설명 */
  description: string;
  /** SEO 타겟 키워드 */
  target_keyword: string;
  /** 카테고리 */
  category: string;
  /** 태그 배열 */
  tags: string[] | null;
  /** 발행일 */
  published_at: string | null;
  /** 조회수 */
  view_count: number;
}

// ============================================================================
// SerpApi Types
// 구글 검색 결과 API 응답 타입
// ============================================================================

/**
 * SerpApi 검색 결과 아이템
 *
 * [포함 정보]
 * - position: 검색 순위 (1부터 시작)
 * - title: 페이지 제목
 * - link: 페이지 URL
 * - snippet: 검색 결과에 표시되는 설명
 */
export interface SerpSearchResult {
  /** 검색 순위 (1 = 1위) */
  position: number;
  /** 페이지 제목 */
  title: string;
  /** 페이지 URL */
  link: string;
  /** 검색 결과 설명 (snippet) */
  snippet: string;
  /** 표시되는 URL (단축 형태) */
  displayed_link: string;
}

/**
 * SerpApi API 응답 전체 구조
 *
 * [주요 필드]
 * - search_metadata: 검색 메타 정보 (ID, 상태, 소요 시간)
 * - search_parameters: 검색 파라미터 (쿼리, 도메인, 언어)
 * - organic_results: 실제 검색 결과 배열
 */
export interface SerpApiResponse {
  /** 검색 메타 정보 */
  search_metadata: {
    /** 검색 ID */
    id: string;
    /** 상태 (Success 등) */
    status: string;
    /** 소요 시간 (초) */
    total_time_taken: number;
  };
  /** 검색 파라미터 */
  search_parameters: {
    /** 검색 쿼리 */
    q: string;
    /** 구글 도메인 (google.co.kr 등) */
    google_domain: string;
    /** 언어 코드 (ko 등) */
    hl: string;
  };
  /** 자연 검색 결과 배열 */
  organic_results: SerpSearchResult[];
}

// ============================================================================
// Web Scraping Types
// 웹 스크래핑 결과 타입
// ============================================================================

/**
 * 스크래핑된 페이지 콘텐츠
 *
 * [수집 데이터]
 * - 제목 (H1, title, og:title)
 * - 설명 (meta description, og:description)
 * - 헤딩 구조 (H1, H2, H3)
 * - 본문 단락 (p 태그)
 * - 단어 수
 */
export interface ScrapedContent {
  /** 스크래핑한 URL */
  url: string;
  /** 페이지 제목 */
  title: string;
  /** 페이지 설명 (meta description) */
  description: string;
  /** 헤딩 구조 */
  headings: {
    /** H1 헤딩 배열 */
    h1: string[];
    /** H2 헤딩 배열 (섹션 제목) */
    h2: string[];
    /** H3 헤딩 배열 (서브섹션 제목) */
    h3: string[];
  };
  /** 본문 단락 배열 */
  paragraphs: string[];
  /** 총 단어 수 */
  wordCount: number;
  /** 스크래핑 시점 (ISO 형식) */
  scrapedAt: string;
}

/**
 * 경쟁사 콘텐츠 분석 결과
 *
 * [분석 항목]
 * - 공통 토픽: 2개 이상의 경쟁사가 다루는 주제
 * - 평균 단어 수: 콘텐츠 길이 목표 설정에 활용
 * - 키워드 밀도: 키워드 출현 빈도
 * - 콘텐츠 갭: 경쟁사가 다루지 않는 우리만의 차별점
 */
export interface CompetitorAnalysis {
  /** 분석한 경쟁사 수 */
  totalCompetitors: number;
  /** 공통 토픽 (2개 이상 경쟁사가 다루는 H2 헤딩) */
  commonTopics: string[];
  /** 평균 단어 수 */
  averageWordCount: number;
  /** 키워드별 출현 빈도 */
  keywordDensity: Record<string, number>;
  /** 콘텐츠 갭 (우리만의 차별점) */
  contentGaps: string[];
  /** 원본 스크래핑 데이터 */
  scrapedContents: ScrapedContent[];
}

// ============================================================================
// Keyword Generation Types
// AI 키워드 생성 관련 타입
// ============================================================================

/**
 * 키워드 메타데이터
 */
export interface KeywordMetadata {
  keyword: string;
  searchIntent: SearchIntent;
  difficulty: KeywordDifficulty;
  estimatedSearchVolume: number;
  relevanceScore: number;
  contentType: ContentType;
  reasoning: string;
}

// ============================================================================
// Content Generation Types
// AI 콘텐츠 생성 결과 타입
// ============================================================================

/**
 * AI가 생성한 콘텐츠
 *
 * [Gemini API 응답 형식]
 * - JSON 형태로 반환되도록 프롬프트에서 요청
 * - content-generator.ts의 parseJsonResponse()로 파싱
 *
 * [포함 정보]
 * - 제목, 설명 (SEO용)
 * - 메타 제목/설명 (검색 결과 표시용)
 * - 본문 (Markdown 형식)
 * - FAQ 아이템 (Schema.org용)
 * - 추천 태그
 */
export interface GeneratedContent {
  /** 글 제목 (H1) */
  title: string;
  /** 글 설명 (200자 이내) */
  description: string;
  /** SEO 메타 제목 (60자 이내) */
  metaTitle: string;
  /** SEO 메타 설명 (155자 이내) */
  metaDescription: string;
  /** 본문 내용 (Markdown 형식) */
  content: string;
  /** H2 헤딩 목록 */
  headings: string[];
  /** FAQ 아이템 배열 */
  faqItems: FAQItem[];
  /** 추천 태그 배열 */
  suggestedTags: string[];
}

// ============================================================================
// Pipeline Types
// 콘텐츠 생성 파이프라인 관련 타입
// ============================================================================

/**
 * 파이프라인 설정
 *
 * [용도]
 * - 콘텐츠 생성 파이프라인의 동작 제어
 * - 타임아웃, 재시도, 콘텐츠 길이 등 설정
 */
export interface PipelineConfig {
  /** 최대 경쟁사 분석 수 */
  maxCompetitors: number;
  /** 최소 콘텐츠 단어 수 */
  minWordCount: number;
  /** 최대 콘텐츠 단어 수 */
  maxWordCount: number;
  /** API 요청 타임아웃 (밀리초) */
  requestTimeout: number;
  /** 최대 재시도 횟수 */
  retryAttempts: number;
  /** 재시도 간격 (밀리초) */
  retryDelay: number;
}

/**
 * 파이프라인 실행 결과
 *
 * [성공 시]
 * - success: true
 * - blogPost: 생성된 포스트 데이터
 * - metrics: 실행 통계
 *
 * [실패 시]
 * - success: false
 * - error: 에러 메시지
 */
export interface PipelineResult {
  /** 성공 여부 */
  success: boolean;
  /** 생성된 블로그 포스트 (성공 시) */
  blogPost?: BlogPostCreateInput;
  /** 에러 메시지 (실패 시) */
  error?: string;
  /** 실행 통계 */
  metrics: {
    /** 총 소요 시간 (밀리초) */
    totalTime: number;
    /** SerpApi 호출 횟수 */
    serpApiCalls: number;
    /** 스크래핑한 페이지 수 */
    pagesScraped: number;
    /** 사용한 토큰 수 (Gemini) */
    tokensUsed: number;
  };
}

/**
 * 파이프라인 단계
 *
 * [실행 순서]
 * 1. search: 구글 검색 (SerpApi)
 * 2. scrape: 웹 스크래핑 (Cheerio)
 * 3. analyze: 경쟁사 분석
 * 4. generate: 콘텐츠 생성 (Gemini)
 * 5. validate: 콘텐츠 검증
 * 6. save: DB 저장 (Supabase)
 */
export type PipelineStage =
  | 'search'
  | 'scrape'
  | 'analyze'
  | 'generate'
  | 'validate'
  | 'save';

/**
 * 파이프라인 진행 상태
 *
 * [용도]
 * - UI에서 진행 상황 표시
 * - 실시간 피드백 제공
 */
export interface PipelineProgress {
  /** 현재 단계 */
  stage: PipelineStage;
  /** 진행률 (0-100) */
  progress: number;
  /** 상태 메시지 (예: "경쟁사 콘텐츠 분석 중...") */
  message: string;
}