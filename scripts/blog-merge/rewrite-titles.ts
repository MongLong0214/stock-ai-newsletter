#!/usr/bin/env tsx
/**
 * 낚시 제목 재작성 (기존 발행글)
 *
 *   npm run blog:rewrite-titles -- --sample 10   # 샘플만 출력, 쓰기 없음
 *   npm run blog:rewrite-titles -- --limit 50    # 50편 실제 갱신
 *   npm run blog:rewrite-titles                  # 전량 갱신
 *
 * BANNED_TITLE_PATTERNS는 2026-08-21에 추가됐고 1,306편 대부분은 그 이전
 * 발행분이라 게이트를 통과한 적이 없다(실측 566편 위반). 본문·slug는 건드리지
 * 않으므로 301도 필요 없다 — 제목과 meta_title만 교체한다.
 *
 * 안전장치: 재작성 결과가 게이트를 다시 통과하지 못하면 그 글은 건너뛴다.
 * 원문 제목은 항상 로그에 남겨 되돌릴 수 있게 한다.
 */

import { config } from 'dotenv';
import { existsSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS; // 로컬은 gcloud ADC로 폴백
}

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { generateText } from '@/lib/llm/gemini-client';
import { ALL_PATTERNS, isClickbait } from '@/app/blog/_config/clickbait-patterns';

/** 되돌리기용 원본 기록 */
const BACKUP_LOG = 'scripts/blog-merge/title-rewrite-backup.jsonl';

interface Post {
  meta_title: string | null;
  slug: string;
  target_keyword: string | null;
  title: string;
}

export function buildPrompt(post: Post, retryReason?: string): string {
  return `당신은 한국 주식 정보 사이트의 에디터다. 아래 블로그 글 제목이 낚시성이라 사실형으로 다시 쓴다.

## 원본 제목
${post.title}

## 타겟 키워드
${post.target_keyword ?? '(없음)'}
${retryReason ? `\n## 직전 시도가 반려된 이유\n${retryReason}\n이 문제를 반드시 피해서 다시 써라.\n` : ''}
## 규칙
- 원본이 다루는 종목·테마·시점을 그대로 유지한다. 새 사실을 지어내지 않는다.
- 타겟 키워드를 제목 앞부분에 자연스럽게 포함한다.
- 금지 표현(활용형 포함): 모르면 / 고점에 물 / 후회 / 남들 다 / 나만 손해 / 안 보면 /
  지금 아니면 / 충격 / 놓치면·놓치는·놓치실 / 소외됩니다 / 구경만 / ~의 비밀 / 진짜 이유 /
  확률 N% / 날렸습니다 / 아직도 ~하시나요·~건가요 / 물립니다 / 큰일 납니다 /
  ~했다간 / 진짜는 따로 / 반드시 확인 / 꼭 확인 / 급등 직전 / 폭락 전
- 공포·조급함·과장을 쓰지 않는다. 독자가 무엇을 얻는지만 말한다.
- 45자 이내. 대괄호 레이블 금지. 이모지 금지. 따옴표·물음표 금지.
- 좋은 예: "카카오뱅크 관련주 7종목 — 지분 구조와 IT 파트너십 정리 (2026.08)"
- 좋은 예: "2차전지 관련주 전망 — 생명주기 점수와 관련주 현황"

제목 한 줄만 출력한다. 설명·따옴표·접두어 없이.`;
}

/** 모델이 붙이는 따옴표·접두어를 걷어낸다 */
export function cleanTitle(raw: string): string {
  const first = raw
    .trim()
    .split('\n')[0]
    .replace(/^["'`\s]+|["'`\s]+$/g, '')
    .replace(/^(제목|title)\s*[:：]\s*/i, '')
    .trim();

  // 여는 따옴표만 벗겨내면 `이미 늦었나?"` 처럼 짝 잃은 따옴표가 남는다
  const quotes = (first.match(/["'“”]/g) ?? []).length;
  return (quotes % 2 === 1 ? first.replace(/["'“”]/g, '') : first).trim();
}

/** 재작성 결과 수용 여부. 게이트를 다시 통과해야 하고, 실질적으로 달라져야 한다. */
export function isAcceptable(original: string, rewritten: string): string | null {
  if (!rewritten) return '빈 응답';
  if (rewritten.length < 10) return `너무 짧음 (${rewritten.length}자)`;
  if (rewritten.length > 60) return `너무 김 (${rewritten.length}자)`;
  if (isClickbait(rewritten)) {
    const hit = ALL_PATTERNS.find((re) => re.test(rewritten));
    return `여전히 낚시 패턴 (${hit?.source})`;
  }
  if (rewritten === original) return '변경 없음';
  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sampleIdx = args.indexOf('--sample');
  const limitIdx = args.indexOf('--limit');
  const sampleSize = sampleIdx >= 0 ? Number(args[sampleIdx + 1]) : 0;
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  const dryRun = sampleSize > 0;

  const supabase = getServerSupabaseClient();
  const posts = await fetchAllRows<Post>((from, to) =>
    supabase
      .from('blog_posts')
      .select('slug, title, meta_title, target_keyword')
      .eq('status', 'published')
      .range(from, to),
  );

  const targets = posts.filter((p) => isClickbait(p.title));
  console.log(`발행글 ${posts.length}편 중 낚시 제목 ${targets.length}편`);
  console.log(dryRun ? `샘플 ${sampleSize}편 (쓰기 없음)\n` : `대상 ${Math.min(targets.length, limit)}편 갱신\n`);

  const work = dryRun ? targets.slice(0, sampleSize) : targets.slice(0, limit);
  let ok = 0;
  let skipped = 0;

  for (const [i, post] of work.entries()) {
    let rewritten = '';
    let reason: string | null = '시도 없음';

    // 게이트를 통과할 때까지 최대 3회. 반려 사유를 되먹여야 같은 실수를 반복하지 않는다
    // (사유 없이 재시도했더니 "놓치는"을 그대로 유지한 결과가 반복됐다).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const prompt = buildPrompt(post, attempt === 0 ? undefined : reason ?? undefined);
        rewritten = cleanTitle(await generateText({ prompt, config: { temperature: attempt === 0 ? 0.4 : 0.7 } }));
        reason = isAcceptable(post.title, rewritten);
        if (!reason) break;
      } catch (e) {
        reason = e instanceof Error ? e.message : String(e);
      }
    }

    if (reason) {
      skipped += 1;
      console.log(`SKIP [${reason}]\n  원본: ${post.title}\n  결과: ${rewritten}\n`);
      continue;
    }

    console.log(`${dryRun ? 'DRY ' : 'OK  '}[${i + 1}/${work.length}]`);
    console.log(`  전: ${post.title}`);
    console.log(`  후: ${rewritten}\n`);

    if (!dryRun) {
      // 되돌릴 수 있게 원본을 먼저 기록한다
      appendFileSync(BACKUP_LOG, `${JSON.stringify({ slug: post.slug, title: post.title, meta_title: post.meta_title, at: new Date().toISOString() })}\n`);
      const { error } = await supabase
        .from('blog_posts')
        .update({ title: rewritten, meta_title: rewritten })
        .eq('slug', post.slug);
      if (error) {
        console.error(`  DB 갱신 실패: ${error.message}`);
        skipped += 1;
        continue;
      }
    }
    ok += 1;
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n완료: ${ok}편 ${dryRun ? '(샘플)' : '갱신'} / ${skipped}편 건너뜀`);
  if (!dryRun && ok > 0) console.log(`원본 백업: ${BACKUP_LOG}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
