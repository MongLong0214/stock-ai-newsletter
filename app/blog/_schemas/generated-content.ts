/**
 * Strict Zod schema for AI-generated blog content.
 *
 * Validates the full GeneratedContent structure including nested FAQ items.
 * Used as the definitive validation gate before any generated content enters the pipeline.
 */

import { z } from 'zod';

const httpUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, '인용 URL은 HTTP(S)여야 합니다');

/** Schema for individual FAQ items — unknown child fields are rejected. */
export const faqItemSchema = z.object({
  question: z.string()
    .min(5, 'FAQ 질문이 너무 짧습니다 (최소 5자)')
    .max(200, 'FAQ 질문이 너무 깁니다 (최대 200자)'),
  answer: z.string()
    .min(10, 'FAQ 답변이 너무 짧습니다 (최소 10자)')
    .max(2000, 'FAQ 답변이 너무 깁니다 (최대 2000자)'),
}).strict();

export const generatedCitationSchema = z.object({
  sourceUrl: httpUrlSchema,
  sourceExcerpt: z.string().min(10).max(1000),
  claim: z.string().min(10).max(1000),
}).strict();

/** Full strict schema for GeneratedContent. */
export const generatedContentSchema = z.object({
  title: z.string()
    .min(10, '제목이 너무 짧습니다 (최소 10자)')
    .max(200, '제목이 200자를 초과합니다'),
  description: z.string()
    .min(10, '설명이 너무 짧습니다')
    .max(500, '설명이 500자를 초과합니다'),
  metaTitle: z.string()
    .min(10, '메타 제목이 너무 짧습니다')
    .max(70, '메타 제목이 70자를 초과합니다'),
  metaDescription: z.string()
    .min(10, '메타 설명이 너무 짧습니다')
    .max(160, '메타 설명이 160자를 초과합니다'),
  content: z.string()
    .min(500, '본문이 너무 짧습니다 (최소 500자)')
    .max(100_000, '본문이 너무 깁니다'),
  headings: z.array(z.string().min(1).max(300))
    .min(1, '헤딩이 최소 1개 필요합니다')
    .max(50, '헤딩이 너무 많습니다'),
  faqItems: z.array(faqItemSchema)
    .min(2, 'FAQ 항목이 부족합니다 (최소 2개)')
    .max(10, 'FAQ 항목이 너무 많습니다 (최대 10개)'),
  suggestedTags: z.array(z.string().min(1).max(50))
    .min(1, '태그가 최소 1개 필요합니다')
    .max(10, '태그가 10개를 초과합니다'),
  citations: z.array(generatedCitationSchema)
    .min(2, 'source-backed citation이 최소 2개 필요합니다')
    .max(20, 'citation이 너무 많습니다'),
  qualityScore: z.number().min(0).max(100).optional(),
}).strict();

export type ValidatedGeneratedContent = z.infer<typeof generatedContentSchema>;

/**
 * Validate generated content against the strict schema.
 * Throws a descriptive error on validation failure.
 */
export function validateGeneratedContent(data: unknown): ValidatedGeneratedContent {
  const result = generatedContentSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`GeneratedContent 스키마 검증 실패: ${issues}`);
  }
  return result.data;
}
