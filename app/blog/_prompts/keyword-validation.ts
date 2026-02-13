// 키워드 메타데이터 검증 및 SEO 점수 계산

import type {
  KeywordMetadata,
  SearchIntent,
  KeywordDifficulty,
  ContentType,
  TopicArea,
} from '../_types/blog';
import { SEO_SCORING_WEIGHTS, MAX_SEARCH_VOLUME } from './keyword-prompt-constants';

/** 경쟁사 키워드 정보 */
export interface CompetitorKeyword {
  keyword: string;
  count: number;
  sources: string[];
}

// Zod z.enum()이 1차 검증을 수행하므로, 여기서는 2차 방어선 역할
const VALID_INTENTS: SearchIntent[] = ['informational', 'commercial', 'transactional', 'navigational'];
const VALID_DIFFICULTIES: KeywordDifficulty[] = ['low', 'medium', 'high'];
const VALID_CONTENT_TYPES: ContentType[] = ['comparison', 'guide', 'listicle', 'review'];
const VALID_TOPIC_AREAS: TopicArea[] = ['technical', 'value', 'strategy', 'market', 'discovery', 'psychology', 'education', 'execution', 'theme'];

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

    // reasoning 길이 (프롬프트에서 50자 이상 요구)
    if (kw.reasoning.length < 50) {
      errors.push(`키워드 ${index + 1}: reasoning이 너무 짧음 (${kw.reasoning.length}자 < 50자)`);
    }

    // enum 2차 검증 (Zod 우회 경로 방어)
    if (!VALID_INTENTS.includes(kw.searchIntent)) {
      errors.push(`키워드 ${index + 1}: 유효하지 않은 searchIntent "${kw.searchIntent}"`);
    }
    if (!VALID_DIFFICULTIES.includes(kw.difficulty)) {
      errors.push(`키워드 ${index + 1}: 유효하지 않은 difficulty "${kw.difficulty}"`);
    }
    if (!VALID_CONTENT_TYPES.includes(kw.contentType)) {
      errors.push(`키워드 ${index + 1}: 유효하지 않은 contentType "${kw.contentType}"`);
    }
    if (!VALID_TOPIC_AREAS.includes(kw.topicArea)) {
      errors.push(`키워드 ${index + 1}: 유효하지 않은 topicArea "${kw.topicArea}"`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/** 가중치 기반 SEO 점수 계산 (0-100) */
export function calculateSEOScore(keyword: KeywordMetadata): number {
  const intentWeight = SEO_SCORING_WEIGHTS.intent[keyword.searchIntent] ?? 1.0;
  const difficultyWeight = SEO_SCORING_WEIGHTS.difficulty[keyword.difficulty] ?? 1.0;

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

  return Math.max(0, Math.min(100, Math.round(weightedScore)));
}
