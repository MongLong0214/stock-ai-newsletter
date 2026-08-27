/**
 * 테마별 실제 검색 수요 리포트
 *
 *   npm run naver:demand              # 상위 40개 출력
 *   npm run naver:demand -- --all     # 전체 CSV
 *
 * 왜 필요한가: TLI 점수는 "이 테마가 지금 뜨고 있나"를 말하지만 "사람들이 이 말을
 * 검색창에 얼마나 치나"는 말하지 않는다. 점수가 높아도 아무도 검색하지 않는 테마에
 * 랜딩을 만들면 헛일이고, 점수가 낮아도 검색량이 큰 테마는 기회다.
 * 이 스크립트는 그 두 축을 붙여서 다음에 만들 페이지를 고르게 해준다.
 */

import { readFileSync } from 'node:fs';
import {
  fetchKeywordVolumes,
  HINT_KEYWORD_LIMIT,
  type KeywordVolume,
  type SearchAdCredentials,
} from '@/lib/naver-searchad';

const THEMES_API = 'https://stockmatrix.co.kr/api/tli/themes';
/** 네이버 검색광고 API 호출 간격. 초당 다발 호출 시 429가 난다. */
const THROTTLE_MS = 350;

interface Theme {
  id: string;
  name: string;
  score: number;
  stageKo: string;
  stockCount: number;
}

function readCredentials(): SearchAdCredentials {
  const env = readFileSync('.env.local', 'utf-8');
  const get = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
  const customerId = get('NAVER_AD_CUSTOMER_ID');
  const apiKey = get('NAVER_AD_API_KEY');
  const secretKey = get('NAVER_AD_SECRET_KEY');
  if (!customerId || !apiKey || !secretKey) {
    throw new Error('.env.local에 NAVER_AD_CUSTOMER_ID / NAVER_AD_API_KEY / NAVER_AD_SECRET_KEY가 필요합니다');
  }
  return { apiKey, customerId, secretKey };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 힌트 키워드는 공백이 무시되므로 조회 결과와 테마명을 맞출 때도 같은 정규화를 쓴다. */
export const normalize = (s: string) => s.replace(/\s+/g, '');

/** 조회 결과에서 테마명과 "<테마>관련주" 두 축의 검색량을 뽑는다. */
export function pickVolumes(theme: string, rows: readonly KeywordVolume[]) {
  const key = normalize(theme);
  const exact = rows.find((r) => normalize(r.keyword) === key);
  const related = rows.find((r) => normalize(r.keyword) === `${key}관련주`);
  return { exact: exact?.total ?? 0, related: related?.total ?? 0 };
}

async function main(): Promise<void> {
  const showAll = process.argv.includes('--all');
  const creds = readCredentials();

  const res = await fetch(THEMES_API);
  const themes: Theme[] = (await res.json()).data;
  console.error(`테마 ${themes.length}개 조회 중... (배치 ${HINT_KEYWORD_LIMIT}개, ${THROTTLE_MS}ms 간격)`);

  const rows: (Theme & { exact: number; related: number })[] = [];
  const batches = chunk(themes, HINT_KEYWORD_LIMIT);

  for (const [i, batch] of batches.entries()) {
    try {
      const volumes = await fetchKeywordVolumes(creds, batch.map((t) => t.name));
      for (const theme of batch) rows.push({ ...theme, ...pickVolumes(theme.name, volumes) });
    } catch (error) {
      // 한 배치가 실패해도 전체를 버리지 않는다. 실패분은 0으로 남고 stderr에 남긴다.
      console.error(`  배치 ${i + 1} 실패: ${(error as Error).message}`);
      for (const theme of batch) rows.push({ ...theme, exact: 0, related: 0 });
    }
    if (i % 10 === 9) console.error(`  ${i + 1}/${batches.length}`);
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  rows.sort((a, b) => b.exact + b.related - (a.exact + a.related));

  if (showAll) {
    console.log('theme,score,stage,stocks,exact_volume,related_volume,url');
    for (const r of rows) {
      console.log(`"${r.name}",${r.score},${r.stageKo},${r.stockCount},${r.exact},${r.related},https://stockmatrix.co.kr/themes/${r.id}`);
    }
    return;
  }

  console.log('\n검색 수요 상위 40 (월간, PC+모바일)\n');
  console.log('테마명'.padEnd(26) + '검색량'.padStart(9) + '관련주'.padStart(9) + '  TLI점수  단계');
  console.log('─'.repeat(66));
  for (const r of rows.slice(0, 40)) {
    console.log(
      r.name.slice(0, 24).padEnd(26) +
        String(r.exact).padStart(9) +
        String(r.related).padStart(9) +
        String(r.score).padStart(9) +
        '  ' + r.stageKo,
    );
  }

  const noDemand = rows.filter((r) => r.exact + r.related === 0).length;
  console.log(`\n검색량 0인 테마: ${noDemand}/${rows.length} — 이 테마들은 랜딩을 만들어도 유입이 없다.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
