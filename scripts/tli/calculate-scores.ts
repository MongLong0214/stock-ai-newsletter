import { supabaseAdmin } from './supabase-admin';
import { calculateLifecycleScore } from '../../lib/tli/calculator';
import { determineStage } from '../../lib/tli/stage';
import { checkReigniting } from '../../lib/tli/reigniting';
import type { InterestMetric, NewsMetric, Stage } from '../../lib/tli/types';
import type { ThemeWithKeywords } from './data-ops';

/** 라이프사이클 점수 계산 및 저장 */
export async function calculateAndSaveScores(themes: ThemeWithKeywords[]) {
  console.log('\n🧮 라이프사이클 점수 계산 중...');

  const today = new Date().toISOString().split('T')[0];

  for (const theme of themes) {
    try {
      console.log(`\n   처리 중: ${theme.name}`);

      // 최근 30일 관심도 메트릭 로딩
      const { data: interestMetrics, error: interestError } = await supabaseAdmin
        .from('interest_metrics')
        .select('*')
        .eq('theme_id', theme.id)
        .order('time', { ascending: false })
        .limit(30);

      if (interestError || !interestMetrics || interestMetrics.length === 0) {
        console.log(`   ⚠️ 관심도 메트릭 없음`);
        continue;
      }

      // 최근 14일 뉴스 메트릭 로딩
      const { data: newsMetrics, error: newsError } = await supabaseAdmin
        .from('news_metrics')
        .select('*')
        .eq('theme_id', theme.id)
        .order('time', { ascending: false })
        .limit(14);

      if (newsError || !newsMetrics || newsMetrics.length === 0) {
        console.log(`   ⚠️ 뉴스 메트릭 없음`);
        continue;
      }

      // 점수 계산 (최소 데이터 미달 시 null 반환)
      const result = calculateLifecycleScore({
        interestMetrics: interestMetrics as InterestMetric[],
        newsMetrics: newsMetrics as NewsMetric[],
        firstSpikeDate: theme.first_spike_date,
        today,
      });

      if (!result) {
        console.log(`   ⚠️ 최소 데이터 요건 미달 (관심도 ${interestMetrics.length}일, 뉴스 ${newsMetrics.length}일)`);
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
    } catch (error) {
      console.error(`   ❌ 테마 처리 실패:`, error);
    }
  }

  console.log('\n   ✅ 라이프사이클 점수 계산 완료');
}
