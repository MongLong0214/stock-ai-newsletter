import { config } from 'dotenv'
config({ path: '.env.local' })
import { sleep, withRetry } from '@/scripts/tli/shared/utils';

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
}

function getNaverCredentials() {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 누락되었습니다')
  }
  return { clientId, clientSecret }
}

/** 네이버 DataLab 검색에 최적화된 키워드 전처리 */
function preprocessKeywords(keywords: string[]): string[] {
  const processed = new Set<string>();

  for (const kw of keywords) {
    // 원본 추가
    processed.add(kw);

    // 괄호 안 내용 제거: "스페이스X(SpaceX)" → "스페이스X"
    const withoutParens = kw.replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (withoutParens && withoutParens !== kw) {
      processed.add(withoutParens);
    }

    // 한글만 추출: "AI반도체" → "반도체"
    const koreanOnly = kw.replace(/[^가-힣\s]/g, '').trim();
    if (koreanOnly && koreanOnly.length >= 2 && koreanOnly !== kw) {
      processed.add(koreanOnly);
    }
  }

  // DataLab API는 키워드 5개 제한
  return Array.from(processed).slice(0, 5);
}

/** 네이버 DataLab API 호출 (재시도 포함) */
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

/** 네이버 DataLab 관심도 데이터 수집 */
export async function collectNaverDatalab(
  themes: Theme[],
  startDate: string,
  endDate: string
): Promise<InterestMetric[]> {
  console.log('📊 네이버 DataLab 데이터 수집 중...');
  console.log(`   기간: ${startDate} ~ ${endDate}`);
  console.log(`   테마 수: ${themes.length}`);

  const metrics: InterestMetric[] = [];

  // 배치 처리 (API 제한: 최대 5개)
  for (let i = 0; i < themes.length; i += 5) {
    const batch = themes.slice(i, i + 5);
    console.log(`\n   배치 처리 ${Math.floor(i / 5) + 1}/${Math.ceil(themes.length / 5)}`);

    const keywordGroups = batch
      .filter(theme => theme.naverKeywords.length > 0)
      .map(theme => ({
        groupName: theme.name,
        keywords: preprocessKeywords(theme.naverKeywords),
      }));

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

      // 결과 처리: 테마별 자기 최댓값 기준 정규화
      for (const result of response.results) {
        const theme = batch.find(t => t.name === result.title);
        if (!theme) {
          console.warn(`   ⚠️ 그룹에 해당하는 테마 없음: ${result.title}`);
          continue;
        }

        // 테마 자체 최댓값 기준 정규화 (배치 구성 변경에 영향 없음)
        const themeMax = Math.max(...result.data.map(d => d.ratio), 0);

        console.log(`   ✓ ${theme.name}: ${result.data.length}개 데이터 포인트 (max: ${themeMax})`);

        for (const dataPoint of result.data) {
          metrics.push({
            themeId: theme.id,
            date: dataPoint.period,
            rawValue: dataPoint.ratio,
            normalized: themeMax > 0 ? (dataPoint.ratio / themeMax) * 100 : 0,
          });
        }
      }

      // 배치 응답에서 누락된 테마 감지
      const respondedNames = new Set(response.results.map(r => r.title));
      const missingThemes = keywordGroups.filter(g => !respondedNames.has(g.groupName));
      if (missingThemes.length > 0) {
        console.warn(`   ⚠️ DataLab 응답 누락 (${missingThemes.length}개): ${missingThemes.map(t => t.groupName).join(', ')}`);
      }

      // API 호출 간 간격 제한
      if (i + 5 < themes.length) {
        await sleep(1000);
      }
    } catch (error: unknown) {
      console.error(`   ❌ 배치 처리 실패:`, error instanceof Error ? error.message : String(error));
      // 다음 배치 계속 처리
    }
  }

  // 수집 성공률 요약
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
