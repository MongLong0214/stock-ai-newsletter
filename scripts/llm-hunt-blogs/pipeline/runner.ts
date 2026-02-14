/**
 * 메인 파이프라인 오케스트레이터
 *
 * Phase 1: 키워드 생성 (프로바이더 수 × 5개)
 * Phase 2: 초안 생성 (프로바이더별 할당, 저장 없음)
 * Phase 3: AI 선별 + 중복 검증 (상위 10개)
 * Phase 4: 저장 & 발행
 */

import { closeBrowser } from '@/app/blog/_services/web-scraper';
import type { Provider, PipelineResult, KeywordGenerationResult } from '../types';
import { isSuccessResult } from '../types';
import { PER_PROVIDER, SELECT_COUNT, BATCH_DELAY_MS, TIMEOUTS } from '../constants';
import { err, withTimeoutFallback } from '../utils';
import { generateKeywords } from './keywords';
import { generateBlogPost } from './draft';
import { selectTopPosts } from './selection';
import { saveAndPublishPosts } from './publish';

export async function runPipeline(providers: Provider[]): Promise<PipelineResult[]> {
  const totalKeywords = PER_PROVIDER * providers.length;

  console.log(`\n${'#'.repeat(60)}`);
  console.log(`[Pipeline] Phase 1: ${providers.length}개 프로바이더 × ${PER_PROVIDER}개 = ${totalKeywords}개 키워드 생성`);
  console.log(`${'#'.repeat(60)}`);

  try {
    // Phase 1: 키워드 생성
    const result = await withTimeoutFallback(
      generateKeywords(providers, totalKeywords),
      TIMEOUTS.keyword,
      { success: false, keywords: [], totalGenerated: 0, totalFiltered: 0, error: 'timeout' } as KeywordGenerationResult,
      'Keyword',
    );

    if (!result.success || !result.keywords.length) {
      console.error(`[Pipeline] 키워드 생성 실패: ${result.error || '키워드 없음'}`);
      return [];
    }
    console.log(`[Pipeline] ${result.keywords.length}개 키워드 생성 완료`);

    // Phase 2: 초안 생성 (저장 없이)
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`[Pipeline] Phase 2: ${result.keywords.length}개 초안 생성 (프로바이더별 할당)`);
    console.log(`${'#'.repeat(60)}`);

    const drafts: PipelineResult[] = [];
    for (let i = 0; i < result.keywords.length; i++) {
      const kw = result.keywords[i];
      const primaryProvider = providers[i % providers.length];
      const orderedProviders = [primaryProvider, ...providers.filter((p) => p !== primaryProvider)];

      console.log(`\n[${i + 1}/${result.keywords.length}] "${kw.keyword}" → ${primaryProvider.name}`);
      const draft = await generateBlogPost(orderedProviders, kw.keyword, kw.contentType);
      drafts.push(draft);

      if (i < result.keywords.length - 1) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }

    await closeBrowser().catch(() => {});

    const successfulDrafts = drafts.filter(isSuccessResult);
    console.log(`\n[Pipeline] 초안 결과: ${successfulDrafts.length}/${drafts.length} 성공`);
    successfulDrafts.forEach((d, i) => {
      const qs = (d.metrics as { qualityScore?: number }).qualityScore || 0;
      console.log(`  ${i + 1}. "${d.blogPost.title}" (Q=${qs})`);
    });

    if (successfulDrafts.length === 0) return [];

    // Phase 3: AI 선별 + 중복 검증
    const selectCount = Math.min(SELECT_COUNT, successfulDrafts.length);
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`[Pipeline] Phase 3: AI 선별 + 중복 검증 — ${successfulDrafts.length}개 → 최대 ${selectCount}개`);
    console.log(`${'#'.repeat(60)}`);

    const selected = await selectTopPosts(providers, successfulDrafts, selectCount);
    console.log(`\n[Pipeline] 선별 완료: ${selected.length}개`);
    selected.forEach((d, i) => {
      const qs = (d.metrics as { qualityScore?: number }).qualityScore || 0;
      console.log(`  ${i + 1}. "${d.blogPost?.title}" (Q=${qs})`);
    });

    // Phase 4: 저장 & 발행
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`[Pipeline] Phase 4: ${selected.length}개 저장 & 발행`);
    console.log(`${'#'.repeat(60)}`);

    const published = await saveAndPublishPosts(selected);
    const ok = published.filter((r) => r.success).length;

    console.log(`\n${'#'.repeat(60)}`);
    console.log(`[Pipeline] 최종: ${ok}개 발행 / ${published.length - ok}개 실패`);
    console.log(`${'#'.repeat(60)}`);

    return published;
  } catch (e) {
    console.error(`[Pipeline] ${err(e)}`);
    await closeBrowser().catch(() => {});
    return [];
  }
}
