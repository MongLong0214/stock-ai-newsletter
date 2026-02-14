/**
 * 선별된 포스트 저장 & 발행 + Google Indexing 알림
 */

import { saveBlogPost, publishBlogPost } from '@/app/blog/_services/blog-repository';
import { notifyGoogleIndexingBatch } from '@/lib/google-indexing';
import type { PipelineResult } from '../types';
import { TIMEOUTS } from '../constants';
import { err, withTimeout } from '../utils';

export async function saveAndPublishPosts(posts: PipelineResult[]): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];

  for (const draft of posts) {
    if (!draft.blogPost) continue;

    try {
      draft.blogPost.status = 'published';
      const saved = await withTimeout(saveBlogPost(draft.blogPost), TIMEOUTS.save, 'DB');
      await publishBlogPost(saved.slug).catch((e) => console.warn('[Pipeline] publish 실패:', err(e)));
      notifyGoogleIndexingBatch([
        `https://stockmatrix.co.kr/blog/${saved.slug}`,
        'https://stockmatrix.co.kr/sitemap.xml',
      ]).catch((e) => console.warn('[Pipeline] 인덱싱 알림 실패:', err(e)));

      console.log(`[Pipeline] 발행: ${saved.slug}`);
      results.push({ ...draft, success: true });
    } catch (e) {
      console.error(`[Pipeline] 저장 실패 "${draft.blogPost.title}": ${err(e)}`);
      results.push({ ...draft, success: false, error: err(e) });
    }
  }

  return results;
}
