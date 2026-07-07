import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import { sleep, withRetry } from '../shared/utils';
import {
  ANCHOR_CV_WARNING_THRESHOLD,
  ANCHOR_KEYWORD,
  computeAnchorScaleFactor,
  computeCoefficientOfVariation,
} from './datalab-anchor'

export {
  ANCHOR_CANDIDATES,
  ANCHOR_CV_WARNING_THRESHOLD,
  ANCHOR_EPSILON,
  ANCHOR_KEYWORD,
  computeAnchorScaleFactor,
  computeCoefficientOfVariation,
} from './datalab-anchor'

interface NaverDatalabRequest {
  startDate: string;
  endDate: string;
  timeUnit: string;
  keywordGroups: Array<{
    groupName: string;
    keywords: string[];
  }>;
}

interface NaverDatalabResponse {
  results: Array<{
    title: string;
    keywords: string[];
    data: Array<{
      period: string;
      ratio: number;
    }>;
  }>;
}

interface Theme {
  id: string;
  name: string;
  naverKeywords: string[];
}

interface InterestMetric {
  themeId: string;
  date: string;
  rawValue: number;
  normalized: number;
  anchorScaledValue?: number | null;
}

const ANCHOR_GROUP_NAME = '__tli_anchor__'
const ANCHOR_BATCH_THEME_SIZE = 4
const LEGACY_BATCH_THEME_SIZE = 5

function getNaverCredentials() {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 누락되었습니다')
  }
  return { clientId, clientSecret }
}

function preprocessKeywords(keywords: string[]): string[] {
  const processed = new Set<string>();

  for (const kw of keywords) {
    processed.add(kw);

    const withoutParens = kw.replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (withoutParens && withoutParens !== kw) {
      processed.add(withoutParens);
    }

    const koreanOnly = kw.replace(/[^가-힣\s]/g, '').trim();
    if (koreanOnly && koreanOnly.length >= 2 && koreanOnly !== kw) {
      processed.add(koreanOnly);
    }
  }

  return Array.from(processed).slice(0, 5);
}

export function isDatalabAnchorEnabled(envValue = process.env.TLI_ANCHOR_ENABLED): boolean {
  return envValue !== 'false' && envValue !== '0'
}

export function splitDatalabThemeBatches<T>(themes: readonly T[], anchorEnabled: boolean): T[][] {
  const batchSize = anchorEnabled ? ANCHOR_BATCH_THEME_SIZE : LEGACY_BATCH_THEME_SIZE
  const batches: T[][] = []
  for (let index = 0; index < themes.length; index += batchSize) {
    batches.push(themes.slice(index, index + batchSize))
  }
  return batches
}

async function callNaverDatalab(request: NaverDatalabRequest): Promise<NaverDatalabResponse> {
  const { clientId, clientSecret } = getNaverCredentials()
  return withRetry(
    async () => {
      const response = await fetch('https://openapi.naver.com/v1/datalab/search', {
        method: 'POST',
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`네이버 API 오류 (${response.status}): ${errorText}`);
      }

      return await response.json();
    },
    3,
    '네이버 DataLab API 호출'
  );
}

export async function collectNaverDatalab(
  themes: Theme[],
  startDate: string,
  endDate: string
): Promise<InterestMetric[]> {
  console.log('📊 네이버 DataLab 데이터 수집 중...');
  console.log(`   기간: ${startDate} ~ ${endDate}`);
  console.log(`   테마 수: ${themes.length}`);

  const metrics: InterestMetric[] = [];
  const anchorEnabled = isDatalabAnchorEnabled()
  const batches = splitDatalabThemeBatches(themes, anchorEnabled)

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n   배치 처리 ${i + 1}/${batches.length}${anchorEnabled ? ` (앵커: ${ANCHOR_KEYWORD})` : ''}`);

    const themeKeywordGroups = batch
      .filter(theme => theme.naverKeywords.length > 0)
      .map(theme => ({
        groupName: theme.name,
        keywords: preprocessKeywords(theme.naverKeywords),
      }));
    const keywordGroups = anchorEnabled
      ? [{ groupName: ANCHOR_GROUP_NAME, keywords: [ANCHOR_KEYWORD] }, ...themeKeywordGroups]
      : themeKeywordGroups

    if (keywordGroups.length === 0) {
      console.log('   ⚠️ 네이버 키워드가 있는 테마가 없음');
      continue;
    }

    try {
      const request: NaverDatalabRequest = {
        startDate,
        endDate,
        timeUnit: 'date',
        keywordGroups,
      };

      const response = await callNaverDatalab(request);
      const anchorResult = anchorEnabled
        ? response.results.find(result => result.title === ANCHOR_GROUP_NAME)
        : undefined
      const anchorRatios = anchorResult?.data.map(dataPoint => dataPoint.ratio) ?? []
      const anchorScaleFactor = anchorEnabled ? computeAnchorScaleFactor(anchorRatios) : null
      const anchorCv = anchorEnabled ? computeCoefficientOfVariation(anchorRatios.slice(-14)) : null
      if (anchorCv !== null && anchorCv > ANCHOR_CV_WARNING_THRESHOLD) {
        console.warn(`   ⚠️ DataLab 앵커 변동성 경고: CV=${anchorCv.toFixed(3)} > ${ANCHOR_CV_WARNING_THRESHOLD}`)
      }
      if (anchorEnabled && anchorScaleFactor === null) {
        console.warn('   ⚠️ DataLab 앵커 응답 누락 — anchor_scaled_value를 null로 적재')
      }

      for (const result of response.results) {
        if (result.title === ANCHOR_GROUP_NAME) continue
        const theme = batch.find(t => t.name === result.title);
        if (!theme) {
          console.warn(`   ⚠️ 그룹에 해당하는 테마 없음: ${result.title}`);
          continue;
        }

        const themeMax = Math.max(...result.data.map(d => d.ratio), 0);

        console.log(`   ✓ ${theme.name}: ${result.data.length}개 데이터 포인트 (max: ${themeMax})`);

        for (const dataPoint of result.data) {
          metrics.push({
            themeId: theme.id,
            date: dataPoint.period,
            rawValue: dataPoint.ratio,
            normalized: themeMax > 0 ? (dataPoint.ratio / themeMax) * 100 : 0,
            anchorScaledValue: anchorScaleFactor === null ? null : dataPoint.ratio * anchorScaleFactor,
          });
        }
      }

      const respondedNames = new Set(response.results.map(r => r.title));
      const missingThemes = themeKeywordGroups.filter(g => !respondedNames.has(g.groupName));
      if (missingThemes.length > 0) {
        console.warn(`   ⚠️ DataLab 응답 누락 (${missingThemes.length}개): ${missingThemes.map(t => t.groupName).join(', ')}`);
      }

      if (i + 1 < batches.length) {
        await sleep(1000);
      }
    } catch (error: unknown) {
      console.error(`   ❌ 배치 처리 실패:`, error instanceof Error ? error.message : String(error));
    }
  }

  const themesWithData = new Set(metrics.map(m => m.themeId));
  const themesWithoutData = themes.filter(t => !themesWithData.has(t.id));
  if (themesWithoutData.length > 0) {
    console.warn(`\n   ⚠️ DataLab 데이터 없는 테마 ${themesWithoutData.length}개:`);
    for (const t of themesWithoutData.slice(0, 10)) {
      console.warn(`      - ${t.name} (키워드: ${t.naverKeywords.join(', ')})`);
    }
    if (themesWithoutData.length > 10) {
      console.warn(`      ... 외 ${themesWithoutData.length - 10}개`);
    }
  }

  console.log(`\n   ✅ ${metrics.length}개 관심도 메트릭 수집 완료`);
  return metrics;
}
