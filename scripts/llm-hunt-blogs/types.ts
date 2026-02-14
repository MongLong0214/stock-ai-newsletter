/**
 * Multi-LLM 블로그 파이프라인 타입 정의
 */

import type {
  BlogPostCreateInput,
  CompetitorAnalysis,
  ContentType,
  GeneratedContent,
  KeywordMetadata,
} from '@/app/blog/_types/blog';
import type { PipelineResult, PipelineMetrics } from '@/app/blog/_types/pipeline';
import type { TLIContext } from '@/app/blog/_services/tli-context';

export type {
  BlogPostCreateInput,
  CompetitorAnalysis,
  ContentType,
  GeneratedContent,
  KeywordMetadata,
  PipelineResult,
  PipelineMetrics,
  TLIContext,
};

// --- Type Predicate ---

export function isSuccessResult(r: PipelineResult): r is Extract<PipelineResult, { success: true }> {
  return r.success;
}

// --- Working Keys (CTF Key Hunter) ---

export interface WorkingKeyEntry {
  key: string;
  repo: string;
  file: string;
  models?: number;
}

export interface WorkingKeys {
  openai?: WorkingKeyEntry[];
  google?: WorkingKeyEntry[];
  groq?: WorkingKeyEntry[];
}

// --- LLM Provider ---

export type ProviderName = 'openai' | 'google' | 'groq';

export interface Provider {
  name: ProviderName;
  call: (prompt: string) => Promise<string>;
}

// --- Pipeline ---

export interface DraftMetrics extends PipelineMetrics {
  qualityScore: number;
}

export interface KeywordGenerationResult {
  success: boolean;
  keywords: KeywordMetadata[];
  totalGenerated: number;
  totalFiltered: number;
  error?: string;
}

export interface UsedContent {
  keywords: string[];
  titles: string[];
}

