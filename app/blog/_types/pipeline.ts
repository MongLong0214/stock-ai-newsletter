/** 콘텐츠 생성 파이프라인 설정/결과/진행 타입 */

import type { BlogPostCreateInput } from './blog-post';

export interface PipelineConfig {
  maxCompetitors: number;
  minWordCount: number;
  maxWordCount: number;
  /** 밀리초 */
  requestTimeout: number;
  retryAttempts: number;
  /** 밀리초 */
  retryDelay: number;
}

export interface PipelineMetrics {
  /** 밀리초 */
  totalTime: number;
  pagesScraped: number;
}

/** Discriminated union: success 필드로 분기 */
export type PipelineResult =
  | { success: true; blogPost: BlogPostCreateInput; metrics: PipelineMetrics }
  | { success: false; error: string; metrics: PipelineMetrics };

export type PipelineStage =
  | 'search'
  | 'scrape'
  | 'analyze'
  | 'generate'
  | 'validate'
  | 'save';

/** UI 진행 상태 표시용 */
export interface PipelineProgress {
  stage: PipelineStage;
  /** 0-100 */
  progress: number;
  message: string;
}
