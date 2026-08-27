#!/usr/bin/env tsx
/**
 * 발행 글 클러스터 분석 — 병합 대상을 찾는다 (읽기 전용)
 *
 *   npm run blog:clusters              # 요약
 *   npm run blog:clusters -- --json    # 전체 클러스터 JSON (병합 계획 입력)
 *
 * 파이프라인의 cluster-guard와 같은 판정 로직을 쓴다. 앞으로 막을 것과 이미
 * 쌓인 것을 같은 기준으로 봐야 병합 후 재발이 없다.
 */

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { isSameCluster, RELATED_STOCK_RE } from '@/app/blog/_services/cluster-guard';
import { isClickbait } from './clickbait-patterns';

interface Post {
  content: string | null;
  published_at: string | null;
  slug: string;
  target_keyword: string | null;
  title: string;
  view_count: number | null;
}

export interface Cluster {
  members: Post[];
  /** 클러스터를 대표하는 키워드 (최초 발견 멤버) */
  key: string;
}

/**
 * 클러스터링. 1,306편은 O(n²)이어도 즉시 끝난다(약 85만 비교).
 * ponytail: 인덱스·임베딩은 이 규모에서 사치다.
 */
export function clusterPosts(posts: readonly Post[]): Cluster[] {
  const clusters: Cluster[] = [];

  for (const post of posts) {
    const keyword = post.target_keyword?.trim();
    // 클러스터 가드는 관련주류에만 적용된다 — 분석도 같은 범위로 맞춘다
    if (!keyword || !RELATED_STOCK_RE.test(keyword)) continue;

    const hit = clusters.find((c) => isSameCluster(keyword, c.key));
    if (hit) hit.members.push(post);
    else clusters.push({ key: keyword, members: [post] });
  }

  return clusters.filter((c) => c.members.length > 1);
}

/**
 * 클러스터 안에서 살릴 글.
 *
 * 조회수는 기준으로 쓸 수 없다 — incrementViewCount가 정의만 되고 호출부가 없어
 * view_count는 실제 트래픽이 아니라 미측정을 뜻한다(1,000편 표본 중 4편, 총 7회).
 * 대신 낚시 제목이 아닌 것을 최우선으로 남긴다 — 병합의 목적이 '중복 제거'만이
 * 아니라 '남는 글의 품질'이기 때문이다.
 */
export function pickWinner(members: readonly Post[]): Post {
  return [...members].sort((a, b) => {
    const clickbait = Number(isClickbait(a.title)) - Number(isClickbait(b.title));
    if (clickbait !== 0) return clickbait; // 낚시 아닌 쪽(false=0)이 앞으로
    const len = (b.content?.length ?? 0) - (a.content?.length ?? 0);
    if (len !== 0) return len;
    return Date.parse(b.published_at ?? '') - Date.parse(a.published_at ?? '');
  })[0];
}

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json');
  const supabase = getServerSupabaseClient();

  const posts = await fetchAllRows<Post>((from, to) =>
    supabase
      .from('blog_posts')
      .select('slug, title, target_keyword, published_at, view_count, content')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .range(from, to),
  );

  const clusters = clusterPosts(posts).sort((a, b) => b.members.length - a.members.length);
  const dupTotal = clusters.reduce((sum, c) => sum + c.members.length, 0);
  const toRemove = dupTotal - clusters.length;

  if (asJson) {
    console.log(JSON.stringify(
      clusters.map((c) => {
        const winner = pickWinner(c.members);
        return {
          key: c.key,
          winner: { slug: winner.slug, title: winner.title, views: winner.view_count ?? 0 },
          losers: c.members
            .filter((m) => m.slug !== winner.slug)
            .map((m) => ({ slug: m.slug, title: m.title, views: m.view_count ?? 0 })),
        };
      }),
      null,
      2,
    ));
    return;
  }

  console.log(`발행글 ${posts.length}편 중 관련주류 클러스터 분석\n`);
  console.log(`중복 클러스터: ${clusters.length}개`);
  console.log(`관련 글:      ${dupTotal}편`);
  console.log(`병합 시 제거:  ${toRemove}편 (${((toRemove / posts.length) * 100).toFixed(1)}%)\n`);

  console.log('상위 15개 클러스터\n');
  for (const c of clusters.slice(0, 15)) {
    const winner = pickWinner(c.members);
    const views = c.members.reduce((s, m) => s + (m.view_count ?? 0), 0);
    console.log(`[${String(c.members.length).padStart(2)}편, 총 조회 ${views}] ${c.key}`);
    console.log(`   유지 → ${winner.title.slice(0, 60)}  (조회 ${winner.view_count ?? 0})`);
    for (const m of c.members.filter((m) => m.slug !== winner.slug).slice(0, 3)) {
      console.log(`   301  ← ${m.title.slice(0, 60)}  (조회 ${m.view_count ?? 0})`);
    }
    if (c.members.length > 4) console.log(`        … 외 ${c.members.length - 4}편`);
    console.log();
  }
}

if (process.argv[1]?.includes('analyze-clusters')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
