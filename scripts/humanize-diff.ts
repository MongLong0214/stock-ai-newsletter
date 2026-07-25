/**
 * 윤문 전후 비교 도구
 *
 * 실제 파이프라인이 쓰는 `evaluateHumanization()`을 그대로 태워
 * 변경률·채택 여부·문장 단위 diff를 출력한다. LLM 호출은 하지 않는다.
 *
 * 사용법:
 *   npx tsx scripts/humanize-diff.ts <before.md> <after.md> "<타겟 키워드>"
 */

import { readFileSync } from 'node:fs';
import { evaluateHumanization } from '../app/blog/_services/humanizer';
import { changeRate } from '../app/blog/_utils/change-rate';

const [beforePath, afterPath, keyword = ''] = process.argv.slice(2);

if (!beforePath || !afterPath) {
  console.error('사용법: npx tsx scripts/humanize-diff.ts <before.md> <after.md> "<키워드>"');
  process.exit(1);
}

const before = readFileSync(beforePath, 'utf-8');
const after = readFileSync(afterPath, 'utf-8');

/** 문장 단위로 쪼개 짝을 맞춘다 (헤딩은 한 줄로 유지) */
function toSentences(text: string): string[] {
  return text
    .split('\n')
    .flatMap((line) =>
      line.startsWith('#') ? [line] : line.split(/(?<=[.!?])\s+/)
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

const beforeSentences = toSentences(before);
const afterSentences = toSentences(after);

console.log('='.repeat(72));
console.log('문장 단위 변경 내역');
console.log('='.repeat(72));

// 위치가 밀려도 짝이 맞도록 가장 유사한 문장을 찾아 대응시킨다
const used = new Set<number>();
let changed = 0;

for (const src of beforeSentences) {
  let bestIdx = -1;
  let bestRate = 1;

  for (let i = 0; i < afterSentences.length; i++) {
    if (used.has(i)) continue;
    const rate = changeRate(src, afterSentences[i]);
    if (rate < bestRate) {
      bestRate = rate;
      bestIdx = i;
    }
  }

  if (bestIdx === -1) continue;
  used.add(bestIdx);

  if (bestRate > 0.001) {
    changed++;
    console.log(`\n[${(bestRate * 100).toFixed(0)}% 변경]`);
    console.log(`  전: ${src}`);
    console.log(`  후: ${afterSentences[bestIdx]}`);
  }
}

const verdict = evaluateHumanization(before, after, keyword);

console.log('\n' + '='.repeat(72));
console.log('판정 (실제 파이프라인 가드)');
console.log('='.repeat(72));
console.log(`원문 길이       : ${before.length}자 / ${beforeSentences.length}문장`);
console.log(`윤문본 길이     : ${after.length}자 / ${afterSentences.length}문장`);
console.log(`수정된 문장     : ${changed}개`);
console.log(`전체 변경률     : ${(verdict.changeRate * 100).toFixed(1)}%`);
console.log(`채택 여부       : ${verdict.accepted ? '채택' : '반려 (원문 유지)'}`);
console.log(`사유            : ${verdict.reason ?? '없음'}`);
