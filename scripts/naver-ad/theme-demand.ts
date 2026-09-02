/**
 * 테마별 실제 검색 수요 리포트
 *
 *   npm run naver:demand              # 상위 40개 출력
 *   npm run naver:demand -- --all     # 전체 CSV
 *   npm run naver:demand -- --with-brand # 테마명 자체 검색량도 별도 배치로 조회
 *
 * 왜 필요한가: TLI 점수는 "이 테마가 지금 뜨고 있나"를 말하지만 "사람들이 이 말을
 * 검색창에 얼마나 치나"는 말하지 않는다. 점수가 높아도 아무도 검색하지 않는 테마에
 * 랜딩을 만들면 헛일이고, 점수가 낮아도 검색량이 큰 테마는 기회다.
 * 이 스크립트는 그 두 축을 붙여서 다음에 만들 페이지를 고르게 해준다.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  fetchKeywordVolumes,
  HINT_KEYWORD_LIMIT,
  type KeywordVolume,
  type SearchAdCredentials,
} from '@/lib/naver-searchad';

/** 네이버 검색광고 API 호출 간격. 초당 다발 호출 시 429가 난다. */
const THROTTLE_MS = 350;

interface Theme {
  id: string;
  name: string;
}

interface ScriptCredentials {
  searchAd: SearchAdCredentials;
  serviceRoleKey: string;
  supabaseUrl: string;
}

interface ThemeDemandRow extends Theme {
  brand?: number;
  related: number;
  themeStock: number;
}

function readCredentials(): ScriptCredentials {
  const env = readFileSync('.env.local', 'utf-8');
  const get = (k: string) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
  const customerId = get('NAVER_AD_CUSTOMER_ID');
  const apiKey = get('NAVER_AD_API_KEY');
  const secretKey = get('NAVER_AD_SECRET_KEY');
  const supabaseUrl = get('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = get('SUPABASE_SERVICE_ROLE_KEY');
  if (!customerId || !apiKey || !secretKey) {
    throw new Error('.env.local에 NAVER_AD_CUSTOMER_ID / NAVER_AD_API_KEY / NAVER_AD_SECRET_KEY가 필요합니다');
  }
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('.env.local에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다');
  }
  return {
    searchAd: { apiKey, customerId, secretKey },
    serviceRoleKey,
    supabaseUrl,
  };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 힌트 키워드는 공백이 무시되고 ASCII는 대문자로 돌아온다 — 같은 정규화로 맞춘다. */
export const normalize = (s: string) => s.replace(/\s+/g, '').toUpperCase();

export function demandKeywords(theme: string) {
  return {
    brand: theme,
    related: `${theme} 관련주`,
    themeStock: `${theme} 테마주`,
  };
}

/** 직접 힌트로 보낸 "관련주"와 "테마주" 두 축의 검색량을 뽑는다. */
export function pickVolumes(theme: string, rows: readonly KeywordVolume[], withBrand = false) {
  const keywords = demandKeywords(theme);
  const findTotal = (keyword: string) => rows.find((row) => normalize(row.keyword) === normalize(keyword))?.total ?? 0;
  const volumes = {
    related: findTotal(keywords.related),
    themeStock: findTotal(keywords.themeStock),
  };

  return withBrand ? { ...volumes, brand: findTotal(keywords.brand) } : volumes;
}

async function fetchActiveThemes(supabaseUrl: string, serviceRoleKey: string): Promise<Theme[]> {
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  // 검색 수요 축에 필요 없는 점수·단계·종목 수는 시점이 다른 테이블의 추가 조회를 피하려고 제외한다.
  const { data, error } = await supabase
    .from('themes')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(`활성 테마 조회 실패: ${error.message}`);
  return data ?? [];
}

async function fetchAxisVolumes(
  credentials: SearchAdCredentials,
  label: string,
  keywords: readonly string[],
): Promise<KeywordVolume[]> {
  const rows: KeywordVolume[] = [];
  const batches = chunk(keywords, HINT_KEYWORD_LIMIT);

  console.error(`${label} ${keywords.length}개 조회 중... (배치 ${HINT_KEYWORD_LIMIT}개, ${THROTTLE_MS}ms 간격)`);
  for (const [index, batch] of batches.entries()) {
    try {
      const volumes = await fetchKeywordVolumes(credentials, batch);
      const requested = new Set(batch.map(normalize));
      rows.push(...volumes.filter((row) => requested.has(normalize(row.keyword))));
    } catch (error) {
      // 한 배치가 실패해도 전체를 버리지 않는다. 누락된 키워드는 pickVolumes에서 0이 된다.
      console.error(`  ${label} 배치 ${index + 1} 실패: ${(error as Error).message}`);
    }
    if (index % 10 === 9) console.error(`  ${index + 1}/${batches.length}`);
    await new Promise((done) => setTimeout(done, THROTTLE_MS));
  }

  return rows;
}

async function main(): Promise<void> {
  const showAll = process.argv.includes('--all');
  const withBrand = process.argv.includes('--with-brand');
  const credentials = readCredentials();
  const themes = await fetchActiveThemes(credentials.supabaseUrl, credentials.serviceRoleKey);
  console.error(`활성 테마 ${themes.length}개 조회 완료`);

  const keywordSets = themes.map((theme) => demandKeywords(theme.name));
  const relatedRows = await fetchAxisVolumes(
    credentials.searchAd,
    '관련주',
    keywordSets.map((keywords) => keywords.related),
  );
  const themeStockRows = await fetchAxisVolumes(
    credentials.searchAd,
    '테마주',
    keywordSets.map((keywords) => keywords.themeStock),
  );
  const brandRows = withBrand
    ? await fetchAxisVolumes(credentials.searchAd, '테마명', keywordSets.map((keywords) => keywords.brand))
    : [];
  const volumes = [...relatedRows, ...themeStockRows, ...brandRows];
  const rows: ThemeDemandRow[] = themes.map((theme) => ({
    ...theme,
    ...pickVolumes(theme.name, volumes, withBrand),
  }));

  rows.sort((a, b) => b.related + b.themeStock - (a.related + a.themeStock));

  if (showAll) {
    console.log(`theme,related_volume,theme_stock_volume${withBrand ? ',brand_volume' : ''},url`);
    for (const r of rows) {
      console.log(`"${r.name}",${r.related},${r.themeStock}${withBrand ? `,${r.brand ?? 0}` : ''},https://stockmatrix.co.kr/themes/${r.id}`);
    }
    return;
  }

  console.log('\n검색 수요 상위 40 (월간, PC+모바일)\n');
  console.log(
    '테마명'.padEnd(26) +
      '관련주'.padStart(9) +
      '테마주'.padStart(9) +
      (withBrand ? '테마명'.padStart(9) : ''),
  );
  console.log('─'.repeat(withBrand ? 53 : 44));
  for (const r of rows.slice(0, 40)) {
    console.log(
      r.name.slice(0, 24).padEnd(26) +
        String(r.related).padStart(9) +
        String(r.themeStock).padStart(9) +
        (withBrand ? String(r.brand ?? 0).padStart(9) : ''),
    );
  }

  const noDemand = rows.filter((r) => r.related + r.themeStock === 0).length;
  console.log(`\n검색량 0인 테마: ${noDemand}/${rows.length} — 이 테마들은 랜딩을 만들어도 유입이 없다.`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
