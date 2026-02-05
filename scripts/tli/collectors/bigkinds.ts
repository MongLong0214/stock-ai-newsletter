import 'dotenv/config';

interface BigKindsRequest {
  access_key: string;
  argument: {
    query: string;
    published_at: {
      from: string;
      until: string;
    };
    return_from: number;
    return_size: number;
    sort: {
      date: string;
    };
  };
}

interface BigKindsResponse {
  return_object: {
    total_hits: number;
  };
}

interface Theme {
  id: string;
  keywords: string[];
}

interface NewsMetric {
  themeId: string;
  date: string;
  articleCount: number;
}

const BIGKINDS_API_KEY = process.env.BIGKINDS_API_KEY || '';

if (!BIGKINDS_API_KEY) {
  throw new Error('Missing BIGKINDS_API_KEY');
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callBigKinds(
  query: string,
  startDate: string,
  endDate: string,
  retries = 3
): Promise<number> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const request: BigKindsRequest = {
        access_key: BIGKINDS_API_KEY,
        argument: {
          query,
          published_at: {
            from: startDate,
            until: endDate,
          },
          return_from: 0,
          return_size: 0, // We only need count
          sort: {
            date: 'desc',
          },
        },
      };

      const response = await fetch('https://tools.kinds.or.kr/search/news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`BigKinds API error (${response.status}): ${errorText}`);
      }

      const data: BigKindsResponse = await response.json();
      return data.return_object.total_hits;
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

function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  return dates;
}

export async function collectBigKinds(
  themes: Theme[],
  startDate: string,
  endDate: string
): Promise<NewsMetric[]> {
  console.log('📰 Collecting BigKinds news data...');
  console.log(`   Date range: ${startDate} to ${endDate}`);
  console.log(`   Themes: ${themes.length}`);

  const metrics: NewsMetric[] = [];
  const dates = generateDateRange(startDate, endDate);

  for (const theme of themes) {
    console.log(`\n   Processing theme: ${theme.id}`);

    if (theme.keywords.length === 0) {
      console.log('   ⚠️ No keywords for this theme');
      continue;
    }

    // Build query: keyword1 OR keyword2 OR keyword3
    const query = theme.keywords.join(' OR ');

    try {
      // Collect by date to get daily counts
      for (const date of dates) {
        const count = await callBigKinds(query, date, date);

        metrics.push({
          themeId: theme.id,
          date,
          articleCount: count,
        });

        // Rate limiting between requests
        await sleep(500);
      }

      const totalArticles = metrics
        .filter(m => m.themeId === theme.id)
        .reduce((sum, m) => sum + m.articleCount, 0);

      console.log(`   ✓ Collected ${dates.length} days, ${totalArticles} total articles`);
    } catch (error) {
      console.error(`   ❌ Error processing theme:`, error);
      // Continue with next theme
    }
  }

  console.log(`\n   ✅ Collected ${metrics.length} news metrics`);
  return metrics;
}
