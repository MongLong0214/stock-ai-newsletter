import 'dotenv/config';
import { supabaseAdmin } from './supabase-admin';
import { collectNaverDatalab } from './collectors/naver-datalab';
import { collectBigKinds } from './collectors/bigkinds';
import { collectNaverFinanceStocks } from './collectors/naver-finance-themes';
import { calculateLifecycleScore } from '../../lib/tli/calculator';
import { determineStage } from '../../lib/tli/stage';
import { checkReigniting } from '../../lib/tli/reigniting';
import { normalizeTimeline, compareThemes } from '../../lib/tli/comparison';
import type { Theme, InterestMetric, NewsMetric, Stage } from '../../lib/tli/types';

interface ThemeWithKeywords extends Theme {
  keywords: string[];
  naverKeywords: string[];
}

async function loadActiveThemes(): Promise<ThemeWithKeywords[]> {
  console.log('📚 Loading active themes...');

  const { data: themes, error: themesError } = await supabaseAdmin
    .from('themes')
    .select('*')
    .eq('is_active', true);

  if (themesError) {
    throw new Error(`Failed to load themes: ${themesError.message}`);
  }

  if (!themes || themes.length === 0) {
    throw new Error('No active themes found');
  }

  console.log(`   ✅ Loaded ${themes.length} active themes\n`);

  // Load keywords for each theme
  const themesWithKeywords: ThemeWithKeywords[] = [];

  for (const theme of themes) {
    const { data: keywords, error: keywordsError } = await supabaseAdmin
      .from('theme_keywords')
      .select('keyword, source')
      .eq('theme_id', theme.id);

    if (keywordsError) {
      console.error(`   ⚠️ Failed to load keywords for theme ${theme.id}`);
      continue;
    }

    const allKeywords = keywords?.map(k => k.keyword) || [];
    const naverKeywords = keywords?.filter(k => k.source === 'naver').map(k => k.keyword) || [];

    themesWithKeywords.push({
      ...theme,
      keywords: allKeywords,
      naverKeywords,
    });
  }

  return themesWithKeywords;
}

async function upsertInterestMetrics(metrics: Array<{ themeId: string; date: string; rawValue: number; normalized: number }>) {
  console.log('\n💾 Upserting interest metrics...');

  for (const metric of metrics) {
    const { error } = await supabaseAdmin
      .from('interest_metrics')
      .upsert(
        {
          theme_id: metric.themeId,
          time: metric.date,
          source: 'naver_datalab',
          raw_value: metric.rawValue,
          normalized: metric.normalized,
        },
        { onConflict: 'theme_id,time,source' }
      );

    if (error) {
      console.error(`   ⚠️ Error upserting metric for theme ${metric.themeId}:`, error);
    }
  }

  console.log(`   ✅ Upserted ${metrics.length} interest metrics`);
}

async function upsertNewsMetrics(metrics: Array<{ themeId: string; date: string; articleCount: number }>) {
  console.log('\n💾 Upserting news metrics...');

  for (const metric of metrics) {
    const { error } = await supabaseAdmin
      .from('news_metrics')
      .upsert(
        {
          theme_id: metric.themeId,
          time: metric.date,
          article_count: metric.articleCount,
          growth_rate: null, // Will be calculated later if needed
        },
        { onConflict: 'theme_id,time' }
      );

    if (error) {
      console.error(`   ⚠️ Error upserting news metric for theme ${metric.themeId}:`, error);
    }
  }

  console.log(`   ✅ Upserted ${metrics.length} news metrics`);
}

async function upsertThemeStocks(stocks: Array<{ themeId: string; symbol: string; name: string; market: string }>) {
  console.log('\n💾 Upserting theme stocks...');

  for (const stock of stocks) {
    const { error } = await supabaseAdmin
      .from('theme_stocks')
      .upsert(
        {
          theme_id: stock.themeId,
          symbol: stock.symbol,
          name: stock.name,
          market: stock.market as 'KOSPI' | 'KOSDAQ',
          source: 'naver',
          is_curated: false,
          relevance: 1.0,
          is_active: true,
        },
        { onConflict: 'theme_id,symbol' }
      );

    if (error) {
      console.error(`   ⚠️ Error upserting stock ${stock.symbol}:`, error);
    }
  }

  console.log(`   ✅ Upserted ${stocks.length} theme stocks`);
}

async function calculateAndSaveScores(themes: ThemeWithKeywords[]) {
  console.log('\n🧮 Calculating lifecycle scores...');

  const today = new Date().toISOString().split('T')[0];

  for (const theme of themes) {
    try {
      console.log(`\n   Processing: ${theme.name}`);

      // Load last 30 days of interest metrics
      const { data: interestMetrics, error: interestError } = await supabaseAdmin
        .from('interest_metrics')
        .select('*')
        .eq('theme_id', theme.id)
        .order('time', { ascending: false })
        .limit(30);

      if (interestError || !interestMetrics || interestMetrics.length === 0) {
        console.log(`   ⚠️ No interest metrics found`);
        continue;
      }

      // Load last 14 days of news metrics
      const { data: newsMetrics, error: newsError } = await supabaseAdmin
        .from('news_metrics')
        .select('*')
        .eq('theme_id', theme.id)
        .order('time', { ascending: false })
        .limit(14);

      if (newsError || !newsMetrics || newsMetrics.length === 0) {
        console.log(`   ⚠️ No news metrics found`);
        continue;
      }

      // Calculate score
      const { score, components } = calculateLifecycleScore({
        interestMetrics: interestMetrics as InterestMetric[],
        newsMetrics: newsMetrics as NewsMetric[],
        firstSpikeDate: theme.first_spike_date,
        today,
      });

      // Determine stage
      const stage = determineStage(score, components);

      // Check if reigniting
      const isReigniting = checkReigniting(stage, interestMetrics.slice(0, 14) as InterestMetric[]);

      // Get previous stage
      const { data: prevScore } = await supabaseAdmin
        .from('lifecycle_scores')
        .select('stage')
        .eq('theme_id', theme.id)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();

      const prevStage = prevScore?.stage as Stage | null;
      const stageChanged = prevStage !== null && prevStage !== stage;

      // Upsert score (safe for re-runs on same day)
      const { error: scoreError } = await supabaseAdmin
        .from('lifecycle_scores')
        .upsert({
          theme_id: theme.id,
          calculated_at: today,
          score,
          stage,
          is_reigniting: isReigniting,
          stage_changed: stageChanged,
          prev_stage: prevStage,
          components,
        }, { onConflict: 'theme_id,calculated_at' });

      if (scoreError) {
        console.error(`   ❌ Error saving score:`, scoreError);
      } else {
        console.log(`   ✅ Score: ${score}, Stage: ${stage}${isReigniting ? ' (Reigniting!)' : ''}`);
      }
    } catch (error) {
      console.error(`   ❌ Error processing theme:`, error);
    }
  }

  console.log('\n   ✅ Lifecycle scoring completed');
}

async function calculateThemeComparisons(themes: ThemeWithKeywords[]) {
  console.log('\n🔍 Calculating theme comparisons...');

  for (const currentTheme of themes) {
    try {
      console.log(`\n   Comparing: ${currentTheme.name}`);

      if (!currentTheme.first_spike_date) {
        console.log(`   ⊘ No first spike date, skipping`);
        continue;
      }

      // Get current theme's lifecycle data
      const { data: currentMetrics, error: currentError } = await supabaseAdmin
        .from('interest_metrics')
        .select('time, normalized')
        .eq('theme_id', currentTheme.id)
        .gte('time', currentTheme.first_spike_date)
        .order('time', { ascending: true });

      if (currentError || !currentMetrics || currentMetrics.length < 7) {
        console.log(`   ⊘ Insufficient data`);
        continue;
      }

      const currentTimeline = normalizeTimeline(
        currentMetrics.map(m => ({ date: m.time, value: m.normalized })),
        currentTheme.first_spike_date
      );

      // Get past themes that have completed their lifecycle
      const { data: pastThemes, error: pastError } = await supabaseAdmin
        .from('themes')
        .select('id, name, first_spike_date')
        .neq('id', currentTheme.id)
        .not('first_spike_date', 'is', null);

      if (pastError || !pastThemes) {
        console.log(`   ⚠️ Could not load past themes`);
        continue;
      }

      let bestMatch: {
        pastThemeId: string;
        pastThemeName: string;
        similarity: number;
        currentDay: number;
        pastPeakDay: number;
        pastTotalDays: number;
        message: string;
      } | null = null;

      // Compare with each past theme
      for (const pastTheme of pastThemes) {
        if (!pastTheme.first_spike_date) continue;

        const { data: pastMetrics } = await supabaseAdmin
          .from('interest_metrics')
          .select('time, normalized')
          .eq('theme_id', pastTheme.id)
          .gte('time', pastTheme.first_spike_date)
          .order('time', { ascending: true });

        if (!pastMetrics || pastMetrics.length < 30) continue;

        const pastTimeline = normalizeTimeline(
          pastMetrics.map(m => ({ date: m.time, value: m.normalized })),
          pastTheme.first_spike_date
        );

        const comparison = compareThemes(currentTimeline, pastTimeline, pastTheme.name);

        if (!bestMatch || Math.abs(comparison.similarity) > Math.abs(bestMatch.similarity)) {
          bestMatch = {
            pastThemeId: pastTheme.id,
            pastThemeName: pastTheme.name,
            ...comparison,
          };
        }
      }

      // Save best comparison
      if (bestMatch && Math.abs(bestMatch.similarity) > 0.5) {
        const today = new Date().toISOString().split('T')[0];
        const { error: compError } = await supabaseAdmin
          .from('theme_comparisons')
          .upsert({
            current_theme_id: currentTheme.id,
            past_theme_id: bestMatch.pastThemeId,
            similarity_score: bestMatch.similarity,
            current_day: bestMatch.currentDay,
            past_peak_day: bestMatch.pastPeakDay,
            past_total_days: bestMatch.pastTotalDays,
            message: bestMatch.message,
            calculated_at: today,
          }, { onConflict: 'current_theme_id,past_theme_id,calculated_at' });

        if (compError) {
          console.error(`   ⚠️ Error saving comparison:`, compError);
        } else {
          console.log(`   ✅ Best match: ${bestMatch.pastThemeName} (${Math.round(Math.abs(bestMatch.similarity) * 100)}%)`);
        }
      } else {
        console.log(`   ⊘ No strong matches found`);
      }
    } catch (error) {
      console.error(`   ❌ Error comparing theme:`, error);
    }
  }

  console.log('\n   ✅ Theme comparison completed');
}

async function main() {
  console.log('🚀 TLI Data Collection and Scoring\n');
  console.log('━'.repeat(80));

  const startTime = Date.now();

  try {
    // Step 1: Load active themes
    const themes = await loadActiveThemes();

    // Step 2: Collect Naver DataLab data
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log('\n━'.repeat(80));
    console.log('📊 STEP 1: Naver DataLab Collection');
    console.log('━'.repeat(80));

    try {
      const interestMetrics = await collectNaverDatalab(
        themes.map(t => ({ id: t.id, name: t.name, naverKeywords: t.naverKeywords })),
        startDate,
        endDate
      );
      await upsertInterestMetrics(interestMetrics);
    } catch (error) {
      console.error('\n❌ Naver DataLab collection failed:', error);
    }

    // Step 3: Collect BigKinds news data
    console.log('\n━'.repeat(80));
    console.log('📰 STEP 2: BigKinds News Collection');
    console.log('━'.repeat(80));

    try {
      const newsStartDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const newsMetrics = await collectBigKinds(
        themes.map(t => ({ id: t.id, keywords: t.keywords })),
        newsStartDate,
        endDate
      );
      await upsertNewsMetrics(newsMetrics);
    } catch (error) {
      console.error('\n❌ BigKinds collection failed:', error);
    }

    // Step 4: Collect Naver Finance stocks (weekly - only on Mondays)
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 1) {
      console.log('\n━'.repeat(80));
      console.log('📈 STEP 3: Naver Finance Stock Collection (Weekly)');
      console.log('━'.repeat(80));

      try {
        const stocks = await collectNaverFinanceStocks(
          themes.map(t => ({ id: t.id, naverThemeId: t.naver_theme_id }))
        );
        await upsertThemeStocks(stocks);
      } catch (error) {
        console.error('\n❌ Stock collection failed:', error);
      }
    } else {
      console.log('\n⊘ Skipping stock collection (only runs on Mondays)');
    }

    // Step 5: Calculate lifecycle scores
    console.log('\n━'.repeat(80));
    console.log('🧮 STEP 4: Lifecycle Score Calculation');
    console.log('━'.repeat(80));

    try {
      await calculateAndSaveScores(themes);
    } catch (error) {
      console.error('\n❌ Score calculation failed:', error);
    }

    // Step 6: Calculate theme comparisons
    console.log('\n━'.repeat(80));
    console.log('🔍 STEP 5: Theme Comparison Analysis');
    console.log('━'.repeat(80));

    try {
      await calculateThemeComparisons(themes);
    } catch (error) {
      console.error('\n❌ Comparison calculation failed:', error);
    }

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n━'.repeat(80));
    console.log('✨ TLI Collection and Scoring Completed!');
    console.log('━'.repeat(80));
    console.log(`\n⏱️  Duration: ${duration}s`);
    console.log(`📊 Processed ${themes.length} themes\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n━'.repeat(80));
    console.error('❌ FATAL ERROR');
    console.error('━'.repeat(80));
    console.error(error);
    process.exit(1);
  }
}

main();
