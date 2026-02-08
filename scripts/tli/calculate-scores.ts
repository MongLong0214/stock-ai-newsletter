import { supabaseAdmin } from './supabase-admin';
import { calculateLifecycleScore } from '../../lib/tli/calculator';
import { determineStage } from '../../lib/tli/stage';
import { checkReigniting } from '../../lib/tli/reigniting';
import { getKSTDate, daysAgo } from './utils';
import type { InterestMetric, NewsMetric, Stage } from '../../lib/tli/types';
import type { ThemeWithKeywords } from './data-ops';

/** 라이프사이클 점수 계산 및 저장 */
export async function calculateAndSaveScores(themes: ThemeWithKeywords[]) {
  console.log('\n🧮 라이프사이클 점수 계산 중...');
  const today = getKSTDate();

  // ─── Phase 1: Batch load interest metrics (eliminate N+1) ───
  const interestCache = new Map<string, InterestMetric[]>();
  const rawAvgMap = new Map<string, number>();

  const themeIds = themes.map(t => t.id);
  const allInterestMetrics: Array<InterestMetric & { theme_id: string }> = [];

  // Batch query in chunks of 300 (Supabase .in() limit)
  for (let i = 0; i < themeIds.length; i += 300) {
    const chunk = themeIds.slice(i, i + 300);
    const { data } = await supabaseAdmin
      .from('interest_metrics')
      .select('*')
      .in('theme_id', chunk)
      .order('time', { ascending: false });

    if (data) {
      allInterestMetrics.push(...(data as Array<InterestMetric & { theme_id: string }>));
    }
  }

  // Group by theme_id and take top 30 per theme
  const interestByTheme = new Map<string, Array<InterestMetric & { theme_id: string }>>();
  for (const metric of allInterestMetrics) {
    const arr = interestByTheme.get(metric.theme_id) || [];
    arr.push(metric);
    interestByTheme.set(metric.theme_id, arr);
  }

  for (const theme of themes) {
    const metrics = interestByTheme.get(theme.id) || [];
    if (metrics.length > 0) {
      // Sort by time desc and take top 30
      const sorted = metrics.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 30);
      interestCache.set(theme.id, sorted);
      const raw7d = sorted.slice(0, 7).map(m => m.raw_value);
      if (raw7d.length > 0) {
        rawAvgMap.set(theme.id, raw7d.reduce((s, v) => s + v, 0) / raw7d.length);
      }
    }
  }

  // Cross-theme percentile distribution
  const sortedRawAvgs = Array.from(rawAvgMap.values()).filter(v => v > 0).sort((a, b) => a - b);
  function computePercentile(value: number): number {
    if (sortedRawAvgs.length === 0 || value <= 0) return 0;
    const below = sortedRawAvgs.filter(v => v <= value).length;
    return below / sortedRawAvgs.length;
  }

  const medianRaw = sortedRawAvgs.length > 0 ? sortedRawAvgs[Math.floor(sortedRawAvgs.length / 2)] : 0;
  console.log(`   📊 Cross-theme percentile: ${sortedRawAvgs.length}개 테마, median rawAvg=${medianRaw.toFixed(1)}`);

  // ─── Phase 2: Batch load news metrics and sentiment scores (eliminate N+1) ───
  const newsCache = new Map<string, NewsMetric[]>();
  const sentimentCache = new Map<string, number[]>();
  const sevenDaysAgo = daysAgo(7);

  // Batch load news metrics
  const allNewsMetrics: Array<NewsMetric & { theme_id: string }> = [];
  for (let i = 0; i < themeIds.length; i += 300) {
    const chunk = themeIds.slice(i, i + 300);
    const { data } = await supabaseAdmin
      .from('news_metrics')
      .select('*')
      .in('theme_id', chunk)
      .order('time', { ascending: false });

    if (data) {
      allNewsMetrics.push(...(data as Array<NewsMetric & { theme_id: string }>));
    }
  }

  // Group news metrics by theme_id and take top 14
  const newsByTheme = new Map<string, Array<NewsMetric & { theme_id: string }>>();
  for (const metric of allNewsMetrics) {
    const arr = newsByTheme.get(metric.theme_id) || [];
    arr.push(metric);
    newsByTheme.set(metric.theme_id, arr);
  }

  for (const theme of themes) {
    const metrics = newsByTheme.get(theme.id) || [];
    if (metrics.length > 0) {
      const sorted = metrics.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 14);
      newsCache.set(theme.id, sorted);
    }
  }

  // Batch load sentiment scores
  const allSentiments: Array<{ theme_id: string; sentiment_score: number }> = [];
  for (let i = 0; i < themeIds.length; i += 300) {
    const chunk = themeIds.slice(i, i + 300);
    const { data } = await supabaseAdmin
      .from('theme_news_articles')
      .select('theme_id, sentiment_score')
      .in('theme_id', chunk)
      .gte('pub_date', sevenDaysAgo)
      .not('sentiment_score', 'is', null);

    if (data) {
      allSentiments.push(...(data as Array<{ theme_id: string; sentiment_score: number }>));
    }
  }

  // Group sentiment scores by theme_id
  const sentimentsByTheme = new Map<string, number[]>();
  for (const item of allSentiments) {
    const arr = sentimentsByTheme.get(item.theme_id) || [];
    arr.push(item.sentiment_score);
    sentimentsByTheme.set(item.theme_id, arr);
  }

  for (const theme of themes) {
    const scores = sentimentsByTheme.get(theme.id) || [];
    sentimentCache.set(theme.id, scores.filter(s => s !== null && s !== undefined));
  }

  // ─── Phase 3: Score calculation with percentile ───
  for (const theme of themes) {
    try {
      console.log(`\n   처리 중: ${theme.name}`);

      const interestMetrics = interestCache.get(theme.id);
      if (!interestMetrics || interestMetrics.length === 0) {
        console.log(`   ⚠️ 관심도 메트릭 없음`);
        continue;
      }

      const safeNewsMetrics = newsCache.get(theme.id) || [];
      const sentimentScores = sentimentCache.get(theme.id) || [];

      const rawPercentile = computePercentile(rawAvgMap.get(theme.id) ?? 0);

      // 점수 계산 (최소 데이터 미달 시 null 반환)
      const result = calculateLifecycleScore({
        interestMetrics,
        newsMetrics: safeNewsMetrics,
        sentimentScores,
        firstSpikeDate: theme.first_spike_date,
        today,
        rawPercentile,
      });

      if (!result) {
        console.log(`   ⚠️ 최소 데이터 요건 미달 (관심도 ${interestMetrics.length}일, 뉴스 ${safeNewsMetrics.length}일)`);
        continue;
      }

      const { score, components } = result;

      // 스테이지 판정
      const stage = determineStage(score, components);

      // 재점화 확인
      const isReigniting = checkReigniting(stage, interestMetrics.slice(0, 14) as InterestMetric[]);

      // 이전 스테이지 조회
      const { data: prevScore } = await supabaseAdmin
        .from('lifecycle_scores')
        .select('stage')
        .eq('theme_id', theme.id)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const prevStage = prevScore?.stage as Stage | null;
      const stageChanged = prevStage !== null && prevStage !== stage;

      // 점수 저장 (같은 날 재실행 시 덮어쓰기)
      const { error: scoreError } = await supabaseAdmin
        .from('lifecycle_scores')
        .upsert(
          {
            theme_id: theme.id,
            calculated_at: today,
            score,
            stage,
            is_reigniting: isReigniting,
            stage_changed: stageChanged,
            prev_stage: prevStage,
            components,
          },
          { onConflict: 'theme_id,calculated_at' }
        );

      if (scoreError) {
        console.error(`   ❌ 점수 저장 실패:`, scoreError);
      } else {
        console.log(`   ✅ 점수: ${score}, 스테이지: ${stage}${isReigniting ? ' (재점화!)' : ''}`);
      }

      // Backfill first_spike_date if not set
      if (!theme.first_spike_date) {
        await supabaseAdmin
          .from('themes')
          .update({ first_spike_date: today })
          .eq('id', theme.id)
          .is('first_spike_date', null);
        console.log(`   📅 first_spike_date 설정: ${today}`)
      }
    } catch (error: unknown) {
      console.error(`   ❌ 테마 처리 실패:`, error instanceof Error ? error.message : String(error));
    }
  }

  console.log('\n   ✅ 라이프사이클 점수 계산 완료');
}
