#!/usr/bin/env tsx
/**
 * 관련주 클러스터 병합 — 승자 1편만 남기고 나머지는 301 리다이렉트
 *
 *   npm run blog:merge -- --dry-run   # 계획만 출력 (기본)
 *   npm run blog:merge -- --apply     # 실제 적용
 *
 * 하는 일:
 *   1. 클러스터별 승자 선정 (낚시 제목 아닌 것 > 본문 긴 것 > 최신)
 *   2. 패자를 status='archived'로 전환 → sitemap·목록에서 자동 제외
 *   3. 패자 slug → 승자 slug 리다이렉트 맵을 소스 파일로 생성
 *
 * 되돌리기: merge-backup.jsonl에 원래 status를 기록한다.
 *
 * 본문 병합은 하지 않는다. 패자들은 같은 테마를 다른 각도로 쓴 AI 생성 변주라
 * 고유 정보가 거의 없고, 합치면 승자가 비대해질 뿐이다. 301이 보존하는 링크 가치가
 * 이 작업의 실질 이득이다.
 */

import { config } from 'dotenv';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (process.env.VITEST !== 'true' && existsSync(envPath)) config({ path: envPath });

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { clusterPosts, pickWinner } from './analyze-clusters';

const BACKUP_LOG = 'scripts/blog-merge/merge-backup.jsonl';
const REDIRECT_FILE = 'app/blog/_config/merged-redirects.ts';

interface Post {
  content: string | null;
  published_at: string | null;
  slug: string;
  target_keyword: string | null;
  title: string;
  view_count: number | null;
}

export interface Redirect {
  from: string;
  to: string;
}

/** 리다이렉트 맵을 소스 파일로 낸다 — next.config.ts가 정적으로 읽는다(런타임 DB 조회 없음). */
export function renderRedirectFile(redirects: readonly Redirect[]): string {
  const entries = redirects
    .map((r) => `  { from: '${r.from}', to: '${r.to}' },`)
    .join('\n');

  return `/**
 * 병합된 블로그 글의 301 리다이렉트 맵 (자동 생성 — scripts/blog-merge/merge-clusters.ts)
 *
 * 같은 관련주 클러스터에 중복 발행된 글을 한 편으로 합치면서, 사라지는 URL이
 * 404가 되지 않도록 승자 글로 영구 이동시킨다. next.config.ts가 빌드 시 읽으므로
 * 런타임 비용이 없다.
 *
 * 생성 시각: ${new Date().toISOString()}
 * 항목 수: ${redirects.length}
 */

export const MERGED_BLOG_REDIRECTS: readonly { from: string; to: string }[] = [
${entries}
];
`;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
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
  const redirects: Redirect[] = [];
  const losers: Post[] = [];

  for (const cluster of clusters) {
    const winner = pickWinner(cluster.members);
    for (const member of cluster.members) {
      if (member.slug === winner.slug) continue;
      losers.push(member);
      redirects.push({ from: `/blog/${member.slug}`, to: `/blog/${winner.slug}` });
    }
  }

  console.log(`발행글 ${posts.length}편 / 클러스터 ${clusters.length}개 / 병합 대상 ${losers.length}편\n`);

  for (const cluster of clusters.slice(0, 10)) {
    const winner = pickWinner(cluster.members);
    console.log(`[${cluster.members.length}편] ${cluster.key}`);
    console.log(`  유지 → ${winner.title.slice(0, 62)}`);
    for (const m of cluster.members.filter((m) => m.slug !== winner.slug)) {
      console.log(`  301  ← ${m.title.slice(0, 62)}`);
    }
    console.log();
  }
  if (clusters.length > 10) console.log(`… 외 ${clusters.length - 10}개 클러스터\n`);

  if (!apply) {
    console.log('dry-run입니다. 실제 적용하려면 --apply를 붙이세요.');
    console.log(`적용 시: ${losers.length}편 archived + ${redirects.length}건 301 생성`);
    return;
  }

  // 리다이렉트 파일을 먼저 쓴다 — DB만 바뀌고 리다이렉트가 없으면 그 사이 404가 난다
  writeFileSync(REDIRECT_FILE, renderRedirectFile(redirects), 'utf-8');
  console.log(`리다이렉트 맵 생성: ${REDIRECT_FILE} (${redirects.length}건)`);

  let archived = 0;
  for (const loser of losers) {
    appendFileSync(
      BACKUP_LOG,
      `${JSON.stringify({ slug: loser.slug, title: loser.title, status: 'published', at: new Date().toISOString() })}\n`,
    );
    const { error } = await supabase
      .from('blog_posts')
      .update({ status: 'archived' })
      .eq('slug', loser.slug);
    if (error) {
      console.error(`  archived 실패 ${loser.slug}: ${error.message}`);
      continue;
    }
    archived += 1;
  }

  console.log(`\n완료: ${archived}편 archived / ${redirects.length}건 리다이렉트`);
  console.log(`원본 상태 백업: ${BACKUP_LOG}`);
  console.log('\n다음: next.config.ts가 이 맵을 읽도록 배선하고 배포해야 301이 실제로 동작합니다.');
}

const isDirectRun = /merge-clusters\.(?:ts|js)$/.test(process.argv[1] ?? '');
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
