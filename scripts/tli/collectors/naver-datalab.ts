import 'dotenv/config';

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

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || '';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';

if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
  throw new Error('Missing NAVER_CLIENT_ID or NAVER_CLIENT_SECRET');
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callNaverDatalab(
  request: NaverDatalabRequest,
  retries = 3
): Promise<NaverDatalabResponse> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch('https://openapi.naver.com/v1/datalab/search', {
        method: 'POST',
        headers: {
          'X-Naver-Client-Id': NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Naver API error (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`   ⚠️ Attempt ${attempt}/${retries} failed:`, error);
      if (attempt === retries) {
        throw error;
      }
      // Exponential backoff
      await sleep(1000 * Math.pow(2, attempt - 1));
    }
  }

  throw new Error('All retry attempts failed');
}

export async function collectNaverDatalab(
  themes: Theme[],
  startDate: string,
  endDate: string
): Promise<InterestMetric[]> {
  console.log('📊 Collecting Naver DataLab data...');
  console.log(`   Date range: ${startDate} to ${endDate}`);
  console.log(`   Themes: ${themes.length}`);

  const metrics: InterestMetric[] = [];

  // Process themes in batches of 5 (API limit)
  for (let i = 0; i < themes.length; i += 5) {
    const batch = themes.slice(i, i + 5);
    console.log(`\n   Processing batch ${Math.floor(i / 5) + 1}/${Math.ceil(themes.length / 5)}`);

    const keywordGroups = batch
      .filter(theme => theme.naverKeywords.length > 0)
      .map(theme => ({
        groupName: theme.name,
        keywords: theme.naverKeywords,
      }));

    if (keywordGroups.length === 0) {
      console.log('   ⚠️ No themes with Naver keywords in this batch');
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

      // Process results
      for (const result of response.results) {
        const theme = batch.find(t => t.name === result.title);
        if (!theme) {
          console.warn(`   ⚠️ No theme found for group: ${result.title}`);
          continue;
        }

        console.log(`   ✓ ${theme.name}: ${result.data.length} data points`);

        for (const dataPoint of result.data) {
          metrics.push({
            themeId: theme.id,
            date: dataPoint.period,
            rawValue: dataPoint.ratio,
            normalized: dataPoint.ratio, // Will be normalized later if needed
          });
        }
      }

      // Rate limiting: wait between batches
      if (i + 5 < themes.length) {
        await sleep(1000);
      }
    } catch (error) {
      console.error(`   ❌ Error processing batch:`, error);
      // Continue with next batch
    }
  }

  console.log(`\n   ✅ Collected ${metrics.length} interest metrics`);
  return metrics;
}
