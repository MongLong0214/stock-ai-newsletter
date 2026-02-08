import { supabaseAdmin } from './supabase-admin';
import {
  normalizeTimeline,
  findPeakDay,
  extractFeatures,
  compositeCompare,
  classifySector,
  type TimeSeriesPoint,
  type ThemeFeatures,
  type FeaturePopulationStats,
} from '../../lib/tli/comparison';
import { getKSTDate } from './utils';
import type { ThemeWithKeywords } from './data-ops';

// ─── Batch helpers ───────────────────────────────────────────────────────────

/** 300-item chunk helper for Supabase `.in()` limit (simple version, no extra filters) */
async function batchInSimple<T>(
  tableName: string,
  selectCols: string,
  themeIds: string[],
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < themeIds.length; i += 300) {
    const chunk = themeIds.slice(i, i + 300);
    const { data } = await supabaseAdmin
      .from(tableName)
      .select(selectCols)
      .in('theme_id', chunk);
    if (data) results.push(...(data as T[]));
  }
  return results;
}

/** 300-item chunk loader for lifecycle_scores (with date filter + ordering) */
async function batchLoadScores(
  themeIds: string[],
  sinceDate: string,
): Promise<Array<{ theme_id: string; score: number; calculated_at: string }>> {
  const results: Array<{ theme_id: string; score: number; calculated_at: string }> = [];
  for (let i = 0; i < themeIds.length; i += 300) {
    const chunk = themeIds.slice(i, i + 300);
    const { data } = await supabaseAdmin
      .from('lifecycle_scores')
      .select('theme_id, score, calculated_at')
      .in('theme_id', chunk)
      .gte('calculated_at', sinceDate)
      .order('calculated_at', { ascending: false });
    if (data) results.push(...data);
  }
  return results;
}

/** 300-item chunk loader for news_metrics (with date filter) */
async function batchLoadNews(
  themeIds: string[],
  sinceDate: string,
): Promise<Array<{ theme_id: string; article_count: number }>> {
  const results: Array<{ theme_id: string; article_count: number }> = [];
  for (let i = 0; i < themeIds.length; i += 300) {
    const chunk = themeIds.slice(i, i + 300);
    const { data } = await supabaseAdmin
      .from('news_metrics')
      .select('theme_id, article_count')
      .in('theme_id', chunk)
      .gte('time', sinceDate);
    if (data) results.push(...data);
  }
  return results;
}

/** 300-item chunk loader for interest_metrics (with date filter) */
async function batchLoadInterest(
  themeIds: string[],
  sinceDate: string,
): Promise<Array<{ theme_id: string; time: string; normalized: number }>> {
  const results: Array<{ theme_id: string; time: string; normalized: number }> = [];
  for (let i = 0; i < themeIds.length; i += 300) {
    const chunk = themeIds.slice(i, i + 300);
    const { data } = await supabaseAdmin
      .from('interest_metrics')
      .select('theme_id, time, normalized')
      .in('theme_id', chunk)
      .gte('time', sinceDate);
    if (data) results.push(...data);
  }
  return results;
}

/** Group array items by theme_id */
function groupByTheme<T extends { theme_id: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const arr = map.get(item.theme_id) || [];
    arr.push(item);
    map.set(item.theme_id, arr);
  }
  return map;
}

// ─── Enriched theme type ─────────────────────────────────────────────────────

interface EnrichedTheme {
  id: string;
  name: string;
  firstSpikeDate: string;
  isActive: boolean;
  features: ThemeFeatures;
  curve: TimeSeriesPoint[];
  keywords: string[];
  peakDay: number;
  totalDays: number;
  activeDays: number;
  sector: string;
}

// ─── Main pipeline ───────────────────────────────────────────────────────────

/** 테마 비교 분석 계산 및 저장 (다중 시그널) */
export async function calculateThemeComparisons(themes: ThemeWithKeywords[]) {
  console.log('\n🔍 테마 비교 분석 중 (다중 시그널)...');

  // ═══ Phase 1: Batch data loading (ALL upfront, zero N+1) ═══

  const { data: allThemes, error: allThemesError } = await supabaseAdmin
    .from('themes')
    .select('id, name, first_spike_date, created_at, is_active');

  if (allThemesError || !allThemes?.length) {
    console.log('   ⚠️ 테마 로딩 실패');
    return;
  }

  const allThemeIds = allThemes.map(t => t.id);

  // KST date boundaries
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(kstNow.getTime() - 90 * 86400000)
    .toISOString()
    .split('T')[0];
  const oneEightyDaysAgo = new Date(kstNow.getTime() - 180 * 86400000)
    .toISOString()
    .split('T')[0];
  const thirtyDaysAgo = new Date(kstNow.getTime() - 30 * 86400000)
    .toISOString()
    .split('T')[0];

  // Parallel batch loading — 4 tables at once
  const [interestAll, scoresAll, newsAll, keywordsAll] = await Promise.all([
    batchLoadInterest(allThemeIds, oneEightyDaysAgo),
    batchLoadScores(allThemeIds, ninetyDaysAgo),
    batchLoadNews(allThemeIds, thirtyDaysAgo),
    batchInSimple<{ theme_id: string; keyword: string }>(
      'theme_keywords',
      'theme_id, keyword',
      allThemeIds,
    ),
  ]);

  console.log(
    `   데이터 로딩: 테마 ${allThemes.length}개, 관심도 ${interestAll.length}건, 점수 ${scoresAll.length}건, 뉴스 ${newsAll.length}건, 키워드 ${keywordsAll.length}건`,
  );

  // Group by theme_id
  const interestByTheme = groupByTheme(interestAll);
  const scoresByTheme = groupByTheme(scoresAll);
  const newsByTheme = groupByTheme(newsAll);
  const keywordsByTheme = groupByTheme(keywordsAll);

  // ═══ Phase 2: Auto-infer first_spike_date + build enriched theme map ═══

  const enrichedThemes: EnrichedTheme[] = [];
  let inferredCount = 0;

  for (const theme of allThemes) {
    // Auto-infer first_spike_date when missing
    let firstSpikeDate = theme.first_spike_date as string | null;
    if (!firstSpikeDate) {
      const interest = interestByTheme.get(theme.id);
      if (interest && interest.length > 0) {
        const sorted = [...interest].sort((a, b) => a.time.localeCompare(b.time));
        firstSpikeDate = sorted[0].time;
        inferredCount++;
      } else if (theme.created_at) {
        firstSpikeDate = new Date(theme.created_at as string).toISOString().split('T')[0];
        inferredCount++;
      } else {
        // Truly no data — skip
        continue;
      }
    }

    // Gather per-theme data
    const interest = interestByTheme.get(theme.id) || [];
    const scores = scoresByTheme.get(theme.id) || [];
    const news = newsByTheme.get(theme.id) || [];
    const keywords = (keywordsByTheme.get(theme.id) || []).map((k) => k.keyword);

    // Interest curve from first_spike_date onward
    const interestAfterSpike = interest
      .filter((m) => m.time >= firstSpikeDate!)
      .sort((a, b) => a.time.localeCompare(b.time));

    const curve = normalizeTimeline(
      interestAfterSpike.map((m) => ({ date: m.time, value: m.normalized })),
      firstSpikeDate,
    );

    // Active days since first spike
    const activeDays = Math.max(
      0,
      Math.floor((kstNow.getTime() - new Date(firstSpikeDate).getTime()) / 86400000),
    );

    // Total news count (last 30 days)
    const totalNewsCount = news.reduce((sum, n) => sum + n.article_count, 0);

    // Extract multi-signal features
    const features = extractFeatures({
      scores: scores.map((s) => ({ score: s.score })), // already desc order from query
      interestValues: interestAfterSpike.map((m) => m.normalized),
      totalNewsCount,
      activeDays,
    });

    // Peak day and total days
    const peakDay = curve.length > 0 ? findPeakDay(curve) : 0;
    const totalDays = curve.length > 0 ? curve[curve.length - 1].day : activeDays;

    // Sector classification
    const sector = classifySector(keywords);

    enrichedThemes.push({
      id: theme.id,
      name: theme.name as string,
      firstSpikeDate,
      isActive: theme.is_active as boolean,
      features,
      curve,
      keywords,
      peakDay,
      totalDays,
      activeDays,
      sector,
    });
  }

  console.log(
    `   테마 보강 완료: ${enrichedThemes.length}개 (first_spike_date 추론: ${inferredCount}개)`,
  );

  // ═══ Phase 2.5: Compute population feature statistics for z-score ═══
  const allFeatureVecs = enrichedThemes.map(t => Object.values(t.features));
  const numDims = allFeatureVecs[0]?.length ?? 0;
  const featureMeans: number[] = [];
  const featureStddevs: number[] = [];
  for (let d = 0; d < numDims; d++) {
    const vals = allFeatureVecs.map(v => v[d]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    featureMeans.push(mean);
    featureStddevs.push(Math.sqrt(variance));
  }
  const populationStats: FeaturePopulationStats = { means: featureMeans, stddevs: featureStddevs };
  console.log(`   Feature population stats computed: ${numDims} dimensions, ${allFeatureVecs.length} themes`);

  // Build lookup map
  const enrichedMap = new Map(enrichedThemes.map((t) => [t.id, t]));

  // ═══ Phase 3: Compare each active theme ═══

  const SIMILARITY_THRESHOLD = 0.40;
  let totalMatches = 0;
  let themesWithMatches = 0;

  for (const currentTheme of themes) {
    try {
      const current = enrichedMap.get(currentTheme.id);
      if (!current) {
        console.log(`   ⊘ ${currentTheme.name}: 보강 데이터 없음`);
        continue;
      }

      const topMatches: Array<{
        pastThemeId: string;
        pastThemeName: string;
        similarity: number;
        currentDay: number;
        pastPeakDay: number;
        pastTotalDays: number;
        message: string;
        featureSim: number;
        curveSim: number;
        keywordSim: number;
      }> = [];

      // Compare against all other enriched themes
      for (const past of enrichedThemes) {
        if (past.id === currentTheme.id) continue;
        // 최소 14일 곡선 데이터 필요 (lifecycle이 충분히 진행된 테마만 비교)
        if (past.curve.length < 14) continue;

        const result = compositeCompare({
          current: {
            features: current.features,
            curve: current.curve,
            keywords: current.keywords,
            activeDays: current.activeDays,
            sector: current.sector,
          },
          past: {
            features: past.features,
            curve: past.curve,
            keywords: past.keywords,
            peakDay: past.peakDay,
            totalDays: past.totalDays,
            name: past.name,
            sector: past.sector,
          },
          populationStats,
        });

        if (result.similarity >= SIMILARITY_THRESHOLD) {
          topMatches.push({
            pastThemeId: past.id,
            pastThemeName: past.name,
            ...result,
          });
        }
      }

      // Sort by similarity desc, keep top 3
      topMatches.sort((a, b) => b.similarity - a.similarity);
      const finalMatches = topMatches.slice(0, 3);

      if (finalMatches.length > 0) {
        themesWithMatches++;
        totalMatches += finalMatches.length;

        const today = getKSTDate();

        // Upsert matches with pillar scores and outcome data
        for (const match of finalMatches) {
          // Compute outcome context for past theme
          const pastScores = scoresByTheme.get(match.pastThemeId) || [];
          const pastPeakScore = pastScores.length > 0
            ? Math.max(...pastScores.map(s => s.score))
            : null;
          const pastThemeData = enrichedMap.get(match.pastThemeId);
          const pastFinalStage = pastThemeData && !pastThemeData.isActive ? 'Dormant' : null;
          const pastDeclineDays = pastPeakScore !== null && pastThemeData
            ? Math.max(0, pastThemeData.totalDays - pastThemeData.peakDay)
            : null;

          const { error: compError } = await supabaseAdmin
            .from('theme_comparisons')
            .upsert(
              {
                current_theme_id: currentTheme.id,
                past_theme_id: match.pastThemeId,
                similarity_score: match.similarity,
                current_day: match.currentDay,
                past_peak_day: match.pastPeakDay,
                past_total_days: match.pastTotalDays,
                message: match.message,
                calculated_at: today,
                feature_sim: match.featureSim,
                curve_sim: match.curveSim,
                keyword_sim: match.keywordSim,
                past_peak_score: pastPeakScore,
                past_final_stage: pastFinalStage,
                past_decline_days: pastDeclineDays,
              },
              { onConflict: 'current_theme_id,past_theme_id,calculated_at' },
            );

          if (compError) {
            console.error(`   ⚠️ 저장 실패:`, compError.message);
          }
        }

        // Delete stale entries for today that are not in the final matches
        const currentMatchIds = finalMatches.map((m) => m.pastThemeId);
        await supabaseAdmin
          .from('theme_comparisons')
          .delete()
          .eq('current_theme_id', currentTheme.id)
          .eq('calculated_at', today)
          .not('past_theme_id', 'in', `(${currentMatchIds.join(',')})`);

        console.log(
          `   ✅ ${currentTheme.name}: ${finalMatches.length}개 매칭 (최고: ${finalMatches[0].pastThemeName} ${Math.round(finalMatches[0].similarity * 100)}%)`,
        );
      } else {
        console.log(
          `   ⊘ ${currentTheme.name}: 유사 매칭 없음 (임계값 ${Math.round(SIMILARITY_THRESHOLD * 100)}%)`,
        );
      }
    } catch (error: unknown) {
      console.error(
        `   ❌ ${currentTheme.name} 비교 실패:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  // Stale 비교 결과 정리 (7일 이전)
  const sevenDaysAgoStr = new Date(kstNow.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const { data: deletedRows } = await supabaseAdmin
    .from('theme_comparisons')
    .delete()
    .lt('calculated_at', sevenDaysAgoStr)
    .select();
  if (deletedRows && deletedRows.length > 0) {
    console.log(`   🗑️ 오래된 비교 결과 ${deletedRows.length}건 정리됨`);
  }

  console.log(
    `\n   ✅ 비교 분석 완료: ${themes.length}개 테마 중 ${themesWithMatches}개에서 총 ${totalMatches}개 매칭 발견`,
  );
}
