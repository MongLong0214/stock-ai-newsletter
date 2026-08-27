#!/usr/bin/env tsx
/**
 * 발행 글 제목 낚시성 감사 (읽기 전용)
 *
 * BANNED_TITLE_PATTERNS는 2026-08-21에 추가됐다. 그 이전 발행분은 게이트를
 * 통과한 적이 없으므로 지금 기준으로는 전부 위반일 수 있다. 몇 편인지 센다.
 */

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { fetchAllRows } from '@/lib/supabase/paginate';

/** content-generator.ts의 BANNED_TITLE_PATTERNS와 동일 (게이트가 적용되기 전 발행분 감사용) */
const BANNED: [string, RegExp][] = [
  ['모르면', /모르면/],
  ['고점에 물', /고점에\s*물/],
  ['확률 N%', /확률\s*\d+\s*%/],
  ['아직도~하시나요', /아직도.*(하시나요|보시나요|계신가요)/],
  ['나만 손해', /나만\s*손해/],
  ['안 보면', /안\s*보면/],
  ['지금 아니면', /지금\s*아니면/],
  ['충격', /충격/],
  ['썰', /(?:^|\s)썰(?:\s|$|\.)/],
  ['후회', /후회/],
];

/** 게이트에는 없지만 실측 제목에서 반복되는 낚시 패턴 */
const EXTRA: [string, RegExp][] = [
  ['남들 다', /남들\s*다/],
  ['날렸습니다/잃었', /(날렸|잃었)습니다/],
  ['물립니다/물리', /물(립니다|리지|힙니다)/],
  ['놓치면', /놓치면/],
  ['소외/구경만', /(소외됩니다|구경만)/],
  ['수익 0원', /수익\s*0원/],
  ['비밀/진짜 이유', /(의 비밀|진짜 이유)/],
];

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

  const all = [...BANNED, ...EXTRA];
  const hits = new Map<string, number>();
  let violating = 0;

  for (const post of posts) {
    const matched = all.filter(([, re]) => re.test(post.title));
    if (matched.length === 0) continue;
    violating += 1;
    for (const [label] of matched) hits.set(label, (hits.get(label) ?? 0) + 1);
  }

  const gateOnly = posts.filter((p) => BANNED.some(([, re]) => re.test(p.title))).length;

  console.log(`발행글 ${posts.length}편 제목 감사\n`);
  console.log(`현행 게이트(BANNED_TITLE_PATTERNS) 위반: ${gateOnly}편 (${((gateOnly / posts.length) * 100).toFixed(1)}%)`);
  console.log(`확장 패턴 포함 위반:                  ${violating}편 (${((violating / posts.length) * 100).toFixed(1)}%)\n`);

  console.log('패턴별 적발 수\n');
  for (const [label, count] of [...hits.entries()].sort((a, b) => b[1] - a[1])) {
    const inGate = BANNED.some(([l]) => l === label);
    console.log(`  ${String(count).padStart(4)}  ${label}${inGate ? '' : '  (게이트 미포함)'}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
