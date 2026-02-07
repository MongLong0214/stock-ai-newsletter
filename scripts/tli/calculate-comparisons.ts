import { supabaseAdmin } from './supabase-admin';
import { normalizeTimeline, compareThemes } from '../../lib/tli/comparison';
import { getKSTDate } from './utils';
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
    metricsByTheme.get(m.theme_id)?.push(m);
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

      if (currentError) {
        console.log(`   ❌ 데이터 조회 실패: ${currentError.message}`);
        continue;
      }

      if (!currentMetrics || currentMetrics.length < 7) {
        console.log(`   ⚠️ 데이터 부족: interest_metrics ${currentMetrics?.length || 0}일분 (최소 7일 필요)`);
        console.log(`      → first_spike_date 이후 interest_metrics 수집이 필요합니다`);
        continue;
      }

      const currentTimeline = normalizeTimeline(
        currentMetrics.map(m => ({ date: m.time, value: m.normalized })),
        currentTheme.first_spike_date
      );

      const topMatches: Array<{
        pastThemeId: string;
        pastThemeName: string;
        similarity: number;
        currentDay: number;
        pastPeakDay: number;
        pastTotalDays: number;
        message: string;
      }> = [];

      // 각 과거 테마와 비교 (메모리 조회, DB 호출 없음)
      let skippedCount = 0;
      let comparedCount = 0;
      for (const pastTheme of allPastThemes) {
        if (pastTheme.id === currentTheme.id) continue;
        if (!pastTheme.first_spike_date) continue;

        const allMetrics = metricsByTheme.get(pastTheme.id);
        if (!allMetrics) continue;

        // first_spike_date 이후만 필터
        const pastMetrics = allMetrics.filter(m => m.time >= pastTheme.first_spike_date!);
        if (pastMetrics.length < 7) {
          skippedCount++;
          continue;
        }
        comparedCount++;

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

        if (comparison.similarity > 0.3) {
          topMatches.push({
            pastThemeId: pastTheme.id,
            pastThemeName: pastTheme.name,
            ...comparison,
          });
        }
      }

      // 상위 5개 매칭 저장
      topMatches.sort((a, b) => b.similarity - a.similarity);
      const finalMatches = topMatches.slice(0, 5);

      console.log(`      비교 완료: ${comparedCount}개 테마 비교, ${skippedCount}개 스킵 (데이터 부족)`);
      console.log(`      유사도 >= 0.5 매칭: ${topMatches.length}개`);

      if (finalMatches.length > 0) {
        const today = getKSTDate();
        // 기존 비교 데이터 정리 (오늘 날짜 기준, 더 이상 매칭 안 되는 데이터 제거)
        await supabaseAdmin
          .from('theme_comparisons')
          .delete()
          .eq('current_theme_id', currentTheme.id)
          .eq('calculated_at', today);
        for (const match of finalMatches) {
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
              },
              { onConflict: 'current_theme_id,past_theme_id,calculated_at' }
            );

          if (compError) {
            console.error(`   ⚠️ 비교 결과 저장 실패:`, compError);
          }
        }
        console.log(
          `   ✅ ${finalMatches.length}개 매칭 저장 (최고: ${finalMatches[0].pastThemeName} ${Math.round(finalMatches[0].similarity * 100)}%)`
        );
      } else {
        console.log(`   ⊘ 유사 매칭 없음 (유사도 >= 0.5 기준)`);
      }
    } catch (error: unknown) {
      console.error(`   ❌ 테마 비교 실패:`, error instanceof Error ? error.message : String(error));
    }
  }

  console.log('\n   ✅ 테마 비교 분석 완료');
}
