#!/usr/bin/env tsx
/**
 * 발행 글 제목 낚시성 감사 (읽기 전용)
 *
 * 패턴은 app/blog/_config/clickbait-patterns.ts 하나만 본다 — 발행 게이트와
 * 같은 기준이어야 "재작성 통과 → 감사 위반"이 생기지 않는다.
 */

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { ALL_PATTERNS, GATE_PATTERNS } from '@/app/blog/_config/clickbait-patterns';

async function main(): Promise<void> {
  const supabase = getServerSupabaseClient();
  const posts = await fetchAllRows<{ published_at: string | null; slug: string; title: string }>(
    (from, to) =>
      supabase
        .from('blog_posts')
        .select('slug, title, published_at')
        .eq('status', 'published')
        .range(from, to),
  );

  const hits = new Map<string, number>();
  let violating = 0;

  for (const post of posts) {
    const matched = ALL_PATTERNS.filter((re) => re.test(post.title));
    if (matched.length === 0) continue;
    violating += 1;
    for (const re of matched) hits.set(re.source, (hits.get(re.source) ?? 0) + 1);
  }

  const legacyGate = posts.filter((p) => GATE_PATTERNS.some((re) => re.test(p.title))).length;

  console.log(`발행글 ${posts.length}편 제목 감사\n`);
  console.log(`현행 발행 게이트(ALL_PATTERNS) 위반: ${violating}편 (${((violating / posts.length) * 100).toFixed(1)}%)`);
  console.log(`  그중 최초 게이트(2026-08-21) 기준:  ${legacyGate}편\n`);

  console.log('패턴별 적발 수\n');
  for (const [label, count] of [...hits.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${label}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
