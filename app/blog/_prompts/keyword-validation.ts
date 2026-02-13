// 키워드 메타데이터 검증 및 SEO 점수 계산

import type {
  KeywordMetadata,
  SearchIntent,
  KeywordDifficulty,
  ContentType,
} from '../_types/blog';
import { SEO_SCORING_WEIGHTS, MAX_SEARCH_VOLUME } from './keyword-prompt-constants';

/** 경쟁사 키워드 정보 */
export interface CompetitorKeyword {
  keyword: string;
  count: number;
  sources: string[];
}

/** 생성된 키워드 메타데이터 품질 검증 */
export function validateKeywordMetadata(keywords: KeywordMetadata[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  keywords.forEach((kw, index) => {
    // 검색량 범위 (MAX_SEARCH_VOLUME 상수 사용)
    if (kw.estimatedSearchVolume < 100 || kw.estimatedSearchVolume > MAX_SEARCH_VOLUME) {
      errors.push(`키워드 ${index + 1}: 검색량 ${kw.estimatedSearchVolume}이 유효 범위(100-${MAX_SEARCH_VOLUME}) 벗어남`);
    }

    // 최소 2단어
    const wordCount = kw.keyword.split(/\s+/).length;
    if (wordCount < 2) {
      errors.push(`키워드 ${index + 1}: "${kw.keyword}"는 단일 단어 키워드 (최소 2단어 필요)`);
    }

    // reasoning 길이
    if (kw.reasoning.length < 20) {
      errors.push(`키워드 ${index + 1}: reasoning이 너무 짧음 (${kw.reasoning.length}자 < 20자)`);
    }

    // enum 검증
    const validIntents: SearchIntent[] = ['informational', 'commercial', 'transactional', 'navigational'];
    if (!validIntents.includes(kw.searchIntent)) {
      errors.push(`키워드 ${index + 1}: 유효하지 않은 searchIntent "${kw.searchIntent}"`);
    }

    const validDifficulties: KeywordDifficulty[] = ['low', 'medium', 'high'];
    if (!validDifficulties.includes(kw.difficulty)) {
      errors.push(`키워드 ${index + 1}: 유효하지 않은 difficulty "${kw.difficulty}"`);
    }

    const validContentTypes: ContentType[] = ['comparison', 'guide', 'listicle', 'review'];
    if (!validContentTypes.includes(kw.contentType)) {
      errors.push(`키워드 ${index + 1}: 유효하지 않은 contentType "${kw.contentType}"`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/** 가중치 기반 SEO 점수 계산 (0-100) */
export function calculateSEOScore(keyword: KeywordMetadata): number {
  const intentWeight = SEO_SCORING_WEIGHTS.intent[keyword.searchIntent];
  const difficultyWeight = SEO_SCORING_WEIGHTS.difficulty[keyword.difficulty];

  let volumeWeight: number;
  const vol = keyword.estimatedSearchVolume;
  if (vol >= 500 && vol <= 1500) {
    volumeWeight = SEO_SCORING_WEIGHTS.volume.optimal.weight;
  } else if (vol >= 100 && vol < 500) {
    volumeWeight = SEO_SCORING_WEIGHTS.volume.good.weight;
  } else if (vol < 100) {
    volumeWeight = SEO_SCORING_WEIGHTS.volume.low.weight;
  } else {
    volumeWeight = SEO_SCORING_WEIGHTS.volume.high.weight;
  }

  // 테마 기반 키워드 시의성 부스트
  const themeBoost = keyword.topicArea === 'theme' ? 1.1 : 1.0;

  // relevanceScore(0-10) -> base(0-50) -> 가중치 적용
  const relevanceBase = keyword.relevanceScore * 5;
  const weightedScore = relevanceBase * intentWeight * difficultyWeight * volumeWeight * themeBoost;

  return Math.min(100, Math.round(weightedScore));
}
