import { supabaseAdmin } from './supabase-admin';
import { normalizeTimeline, compareThemes } from '../../lib/tli/comparison';
import type { ThemeWithKeywords } from './data-ops';

/** 테마 비교 분석 계산 및 저장 */
export async function calculateThemeComparisons(themes: ThemeWithKeywords[]) {
  console.log('\n🔍 테마 비교 분석 중...');

  // 과거 테마 목록 + 메트릭을 한 번만 배치 로딩 (N*M → 2 쿼리)
  const { data: allPastThemes, error: pastError } = await supabaseAdmin
    .from('themes')
    .select('id, name, first_spike_date')
    .not('first_spike_date', 'is', null);

  if (pastError || !allPastThemes || allPastThemes.length === 0) {
    console.log('   ⚠️ 과거 테마 로딩 실패 또는 없음');
    return;
  }

  const pastThemeIds = allPastThemes.map(t => t.id);
  const earliestDate = allPastThemes.reduce(
    (min, t) => (t.first_spike_date! < min ? t.first_spike_date! : min),
    '9999-12-31'
  );

  const { data: allPastMetrics } = await supabaseAdmin
    .from('interest_metrics')
    .select('theme_id, time, normalized')
    .in('theme_id', pastThemeIds)
    .gte('time', earliestDate)
    .order('time', { ascending: true });

  // theme_id별 그룹핑
  const metricsByTheme = new Map<string, Array<{ time: string; normalized: number }>>();
  for (const m of allPastMetrics || []) {
    if (!metricsByTheme.has(m.theme_id)) metricsByTheme.set(m.theme_id, []);
    metricsByTheme.get(m.theme_id)!.push(m);
  }

  console.log(`   과거 테마 ${allPastThemes.length}개, 메트릭 ${allPastMetrics?.length ?? 0}건 로딩 완료`);

  for (const currentTheme of themes) {
    try {
      console.log(`\n   비교 중: ${currentTheme.name}`);

      if (!currentTheme.first_spike_date) {
        console.log(`   ⊘ 첫 급등일 없음, 건너뜀`);
        continue;
      }

      // 현재 테마의 라이프사이클 데이터 조회
      const { data: currentMetrics, error: currentError } = await supabaseAdmin
        .from('interest_metrics')
        .select('time, normalized')
        .eq('theme_id', currentTheme.id)
        .gte('time', currentTheme.first_spike_date)
        .order('time', { ascending: true });

      if (currentError || !currentMetrics || currentMetrics.length < 7) {
        console.log(`   ⊘ 데이터 부족`);
        continue;
      }

      const currentTimeline = normalizeTimeline(
        currentMetrics.map(m => ({ date: m.time, value: m.normalized })),
        currentTheme.first_spike_date
      );

      let bestMatch: {
        pastThemeId: string;
        pastThemeName: string;
        similarity: number;
        currentDay: number;
        pastPeakDay: number;
        pastTotalDays: number;
        message: string;
      } | null = null;

      // 각 과거 테마와 비교 (메모리 조회, DB 호출 없음)
      for (const pastTheme of allPastThemes) {
        if (pastTheme.id === currentTheme.id) continue;
        if (!pastTheme.first_spike_date) continue;

        const allMetrics = metricsByTheme.get(pastTheme.id);
        if (!allMetrics) continue;

        // first_spike_date 이후만 필터
        const pastMetrics = allMetrics.filter(m => m.time >= pastTheme.first_spike_date!);
        if (pastMetrics.length < 30) continue;

        // 비정상적 장기 테마 제외 (365일 초과)
        const pastFirstDate = new Date(pastTheme.first_spike_date!).getTime();
        const pastLastDate = new Date(pastMetrics[pastMetrics.length - 1].time).getTime();
        const pastDaySpan = Math.round((pastLastDate - pastFirstDate) / (1000 * 60 * 60 * 24));
        if (pastDaySpan > 365) continue;

        const pastTimeline = normalizeTimeline(
          pastMetrics.map(m => ({ date: m.time, value: m.normalized })),
          pastTheme.first_spike_date
        );

        const comparison = compareThemes(currentTimeline, pastTimeline, pastTheme.name);

        if (!bestMatch || comparison.similarity > bestMatch.similarity) {
          bestMatch = {
            pastThemeId: pastTheme.id,
            pastThemeName: pastTheme.name,
            ...comparison,
          };
        }
      }

      // 최적 매칭 저장
      if (bestMatch && bestMatch.similarity > 0.7) {
        const today = new Date().toISOString().split('T')[0];
        const { error: compError } = await supabaseAdmin
          .from('theme_comparisons')
          .upsert(
            {
              current_theme_id: currentTheme.id,
              past_theme_id: bestMatch.pastThemeId,
              similarity_score: bestMatch.similarity,
              current_day: bestMatch.currentDay,
              past_peak_day: bestMatch.pastPeakDay,
              past_total_days: bestMatch.pastTotalDays,
              message: bestMatch.message,
              calculated_at: today,
            },
            { onConflict: 'current_theme_id,past_theme_id,calculated_at' }
          );

        if (compError) {
          console.error(`   ⚠️ 비교 결과 저장 실패:`, compError);
        } else {
          console.log(
            `   ✅ 최적 매칭: ${bestMatch.pastThemeName} (${Math.round(bestMatch.similarity * 100)}%)`
          );
        }
      } else {
        console.log(`   ⊘ 강한 매칭 없음`);
      }
    } catch (error) {
      console.error(`   ❌ 테마 비교 실패:`, error);
    }
  }

  console.log('\n   ✅ 테마 비교 분석 완료');
}
