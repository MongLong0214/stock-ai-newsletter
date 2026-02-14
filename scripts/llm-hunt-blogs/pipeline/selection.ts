/**
 * AI 선별 — 기존 블로그 대비 중복 검증 + 품질 기반 상위 N개 선택
 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import type { Provider, PipelineResult } from '../types';
import { TIMEOUTS, EXISTING_POSTS_LIMIT } from '../constants';
import { err, withTimeout } from '../utils';
import { callLLMWithFallback } from '../providers/router';

export async function selectTopPosts(
  providers: Provider[],
  drafts: PipelineResult[],
  count: number,
): Promise<PipelineResult[]> {
  if (drafts.length === 0) return [];

  // 기존 블로그 목록 조회 (중복 검증용)
  console.log('[Selection] 기존 블로그 목록 조회...');
  const supabase = getServerSupabaseClient();
  const { data: existingPosts, error: dbError } = await supabase
    .from('blog_posts')
    .select('title, target_keyword')
    .order('created_at', { ascending: false })
    .limit(EXISTING_POSTS_LIMIT);

  if (dbError) console.warn('[Selection] DB 조회 실패:', dbError.message);

  const existingList = (existingPosts || []).map((p) => ({ title: p.title, keyword: p.target_keyword }));
  console.log(`[Selection] 기존 블로그: ${existingList.length}개 로드`);

  const summaries = drafts.map((d, i) => ({
    index: i,
    title: d.blogPost?.title,
    keyword: d.blogPost?.target_keyword,
    metaTitle: d.blogPost?.meta_title,
    metaDescription: d.blogPost?.meta_description,
    faqCount: d.blogPost?.faq_items?.length || 0,
    contentLength: d.blogPost?.content?.length || 0,
    qualityScore: (d.metrics as { qualityScore?: number }).qualityScore || 0,
    contentPreview: d.blogPost?.content?.substring(0, 400),
  }));

  const prompt = `당신은 시니어 SEO 콘텐츠 에디터입니다.

## 임무
다음 ${drafts.length}개의 블로그 초안 중에서 최종 발행할 ${count}개를 선별해주세요.

## 절대 규칙 — 중복 제거 (최우선)
아래 "기존 발행된 블로그" 목록과 주제/키워드/관점이 겹치는 초안은 반드시 탈락시키세요.
- 같은 키워드를 다른 표현으로 쓴 것도 중복입니다 (예: "주식 초보 가이드" ↔ "주식 입문자 안내")
- 같은 주제를 다른 각도로 쓴 것도 중복입니다 (예: "ETF 추천 2026" ↔ "올해 ETF 투자 전략")
- 초안끼리 주제가 겹치는 경우, 품질이 더 높은 1개만 남기세요

## 기존 발행된 블로그 (최근 ${existingList.length}개)
${JSON.stringify(existingList.map((p) => `${p.keyword} — ${p.title}`).slice(0, 100), null, 2)}

## 선별 기준 (중복 아닌 것들 중에서)
1. SEO 최적화 (키워드 적절성, 메타 태그 품질)
2. 콘텐츠 깊이 (길이, 구조, FAQ)
3. 주제 다양성 (선별된 ${count}개 내에서도 주제가 최대한 다양)
4. 독자 가치 (실용적 정보, 차별화된 관점)

## 초안 목록
${JSON.stringify(summaries, null, 2)}

## 응답 형식
반드시 아래 JSON 형식으로만 응답하세요. 설명 없이 JSON만:
{"selected": [0, 3, 5, 7, ...], "rejected_duplicates": [1, 4]}`;

  try {
    const response = await withTimeout(callLLMWithFallback(providers, prompt), TIMEOUTS.evaluate, 'Selection');
    const cleaned = response.replace(/```json?\s*/gi, '').replace(/```/gi, '').trim();
    const parsed: unknown = JSON.parse(cleaned);
    const obj = parsed as { selected?: number[]; rejected_duplicates?: number[] };
    const indices: number[] = Array.isArray(obj.selected)
      ? obj.selected
      : (Array.isArray(parsed) ? parsed as number[] : []);

    // 중복 탈락 로그
    const rejected = obj.rejected_duplicates || [];
    if (rejected.length > 0) {
      console.log(`[Selection] 중복 탈락: ${rejected.length}개`);
      rejected.forEach((i) => {
        if (i >= 0 && i < drafts.length) {
          console.log(`  ✗ "${drafts[i].blogPost?.title}" (${drafts[i].blogPost?.target_keyword})`);
        }
      });
    }

    const selected = indices
      .filter((i) => typeof i === 'number' && i >= 0 && i < drafts.length)
      .slice(0, count)
      .map((i) => drafts[i]);

    if (selected.length > 0) return selected;
    throw new Error('AI가 유효한 인덱스를 반환하지 않음');
  } catch (e) {
    console.warn(`[Selection] AI 선별 실패: ${err(e)} — 품질 점수 기준으로 폴백`);
    return [...drafts]
      .sort((a, b) => {
        const sa = (a.metrics as { qualityScore?: number }).qualityScore || 0;
        const sb = (b.metrics as { qualityScore?: number }).qualityScore || 0;
        return sb - sa;
      })
      .slice(0, count);
  }
}
