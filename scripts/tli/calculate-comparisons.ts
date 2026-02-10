import { supabaseAdmin } from './supabase-admin'
import { batchQuery, groupByThemeId } from './supabase-batch'
import {
  normalizeTimeline,
  findPeakDay,
  extractFeatures,
  featuresToArray,
  compositeCompare,
  classifySector,
  type TimeSeriesPoint,
  type ThemeFeatures,
  type FeaturePopulationStats,
} from '../../lib/tli/comparison';
import { getKSTDate } from './utils';
import type { ThemeWithKeywords } from './data-ops';

// ─── 보강된 테마 타입 ─────────────────────────────────────────────────────

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

// ─── 메인 파이프라인 ───────────────────────────────────────────────────────────

/** 테마 비교 분석 계산 및 저장 (다중 시그널) */
export async function calculateThemeComparisons(themes: ThemeWithKeywords[]) {
  console.log('\n🔍 테마 비교 분석 중 (다중 시그널)...');

  // ═══ Phase 1: 전체 테마 + 데이터 배치 로딩 (자동 페이지네이션) ═══

  // 전체 테마 페이지네이션 조회
  const allThemes: Array<{ id: string; name: string; first_spike_date: string | null; created_at: string | null; is_active: boolean }> = []
  let pageFrom = 0
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('themes')
      .select('id, name, first_spike_date, created_at, is_active')
      .order('id')
      .range(pageFrom, pageFrom + 999)
    if (error || !data?.length) break
    allThemes.push(...data)
    if (data.length < 1000) break
    pageFrom += 1000
  }

  if (allThemes.length === 0) {
    console.log('   ⚠️ 테마 로딩 실패')
    return
  }

  const allThemeIds = allThemes.map(t => t.id)

  // KST 날짜 경계
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const ninetyDaysAgo = new Date(kstNow.getTime() - 90 * 86400000).toISOString().split('T')[0]
  const oneEightyDaysAgo = new Date(kstNow.getTime() - 180 * 86400000).toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(kstNow.getTime() - 30 * 86400000).toISOString().split('T')[0]

  // 5개 테이블 병렬 배치 로딩 (자동 페이지네이션)
  const [interestAll, scoresAll, newsAll, keywordsAll, stocksAll] = await Promise.all([
    batchQuery<{ theme_id: string; time: string; normalized: number }>(
      'interest_metrics', 'theme_id, time, normalized', allThemeIds,
      q => q.gte('time', oneEightyDaysAgo),
    ),
    batchQuery<{ theme_id: string; score: number; calculated_at: string }>(
      'lifecycle_scores', 'theme_id, score, calculated_at', allThemeIds,
      q => q.gte('calculated_at', ninetyDaysAgo).order('calculated_at', { ascending: false }),
    ),
    batchQuery<{ theme_id: string; article_count: number }>(
      'news_metrics', 'theme_id, article_count', allThemeIds,
      q => q.gte('time', thirtyDaysAgo),
    ),
    batchQuery<{ theme_id: string; keyword: string }>(
      'theme_keywords', 'theme_id, keyword', allThemeIds,
    ),
    batchQuery<{ theme_id: string; price_change_pct: number | null; volume: number | null }>(
      'theme_stocks', 'theme_id, price_change_pct, volume', allThemeIds,
    ),
  ])

  console.log(
    `   데이터 로딩: 테마 ${allThemes.length}개, 관심도 ${interestAll.length}건, 점수 ${scoresAll.length}건, 뉴스 ${newsAll.length}건, 키워드 ${keywordsAll.length}건, 주가 ${stocksAll.length}건`,
  )

  // 테마별 그룹화
  const interestByTheme = groupByThemeId(interestAll)
  const scoresByTheme = groupByThemeId(scoresAll)
  const newsByTheme = groupByThemeId(newsAll)
  const keywordsByTheme = groupByThemeId(keywordsAll)
  const stocksByTheme = groupByThemeId(stocksAll)

  // ═══ Phase 2: first_spike_date 자동 추론 + 보강 테마 맵 구축 ═══

  const enrichedThemes: EnrichedTheme[] = [];
  let inferredCount = 0;

  for (const theme of allThemes) {
    // first_spike_date 누락 또는 365일 초과 시 자동 추론 (장기/반복 테마 대응)
    let firstSpikeDate = theme.first_spike_date as string | null;
    const rawActiveDays = firstSpikeDate
      ? Math.floor((kstNow.getTime() - new Date(firstSpikeDate).getTime()) / 86400000)
      : Infinity;
    if (!firstSpikeDate || rawActiveDays > 365) {
      const MIN_MEANINGFUL_INTEREST = 30;
      const interest = interestByTheme.get(theme.id);
      if (interest && interest.length > 0) {
        const sorted = [...interest].sort((a, b) => a.time.localeCompare(b.time));
        const meaningful = sorted.find(d => d.normalized >= MIN_MEANINGFUL_INTEREST);
        if (meaningful) {
          firstSpikeDate = meaningful.time;
        } else {
          const peak = sorted.reduce((max, d) => d.normalized > max.normalized ? d : max, sorted[0]);
          firstSpikeDate = peak.time;
        }
        inferredCount++;
      } else if (theme.created_at) {
        firstSpikeDate = new Date(theme.created_at as string).toISOString().split('T')[0];
        inferredCount++;
      } else {
        // 데이터 없음 — 스킵
        continue;
      }

      // 재추론된 first_spike_date는 이 파이프라인 내에서만 사용 (DB 원본은 보존)
      // 이유: 원본 first_spike_date는 테마 발견 시점의 역사적 기록이므로 덮어쓰지 않음
    }

    // 테마별 데이터 수집
    const interest = interestByTheme.get(theme.id) || [];
    const scores = scoresByTheme.get(theme.id) || [];
    const news = newsByTheme.get(theme.id) || [];
    const keywords = (keywordsByTheme.get(theme.id) || []).map((k) => k.keyword);

    // first_spike_date 이후 관심도 곡선
    const interestAfterSpike = interest
      .filter((m) => m.time >= firstSpikeDate!)
      .sort((a, b) => a.time.localeCompare(b.time));

    const curve = normalizeTimeline(
      interestAfterSpike.map((m) => ({ date: m.time, value: m.normalized })),
      firstSpikeDate,
    );

    // first_spike 이후 활성 일수
    const activeDays = Math.max(
      0,
      Math.floor((kstNow.getTime() - new Date(firstSpikeDate).getTime()) / 86400000),
    );

    // 총 뉴스 건수 (최근 30일)
    const totalNewsCount = news.reduce((sum, n) => sum + n.article_count, 0);

    // 주가 데이터
    const stocks = stocksByTheme.get(theme.id) || [];
    const validPrices = stocks.filter((s: { price_change_pct: number | null }) => s.price_change_pct !== null).map((s: { price_change_pct: number | null }) => s.price_change_pct!);
    const validVolumes = stocks.filter((s: { volume: number | null }) => s.volume !== null).map((s: { volume: number | null }) => s.volume!);
    const avgPriceChangePct = validPrices.length > 0 ? validPrices.reduce((a: number, b: number) => a + b, 0) / validPrices.length : 0;
    const avgVolume = validVolumes.length > 0 ? validVolumes.reduce((a: number, b: number) => a + b, 0) / validVolumes.length : 0;

    // 다중 시그널 피처 추출
    const features = extractFeatures({
      scores: scores.map((s) => ({ score: s.score })), // 쿼리에서 이미 desc 정렬됨
      interestValues: interestAfterSpike.map((m) => m.normalized),
      totalNewsCount,
      activeDays,
      avgPriceChangePct,
      avgVolume,
    });

    // 피크 일차 및 총 일수
    const peakDay = curve.length > 0 ? findPeakDay(curve) : -1;
    const totalDays = curve.length > 0 ? curve[curve.length - 1].day : activeDays;

    // 섹터 분류
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

  if (enrichedThemes.length === 0) {
    console.log('   ⚠️ 보강된 테마 없음 — 비교 분석 생략');
    return;
  }

  // ═══ Phase 2.5: z-score용 모집단 피처 통계 계산 ═══
  const allFeatureVecs = enrichedThemes.map(t => featuresToArray(t.features));
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
  console.log(`   피처 모집단 통계: ${numDims}차원, ${allFeatureVecs.length}개 테마`);

  // 조회용 맵 구축
  const enrichedMap = new Map(enrichedThemes.map((t) => [t.id, t]));

  // ═══ Phase 3: 활성 테마별 비교 ═══

  const SIMILARITY_THRESHOLD = 0.35;
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

      // 모든 보강 테마와 비교
      for (const past of enrichedThemes) {
        if (past.id === currentTheme.id) continue;
        // 최소 14일 일수 + 최소 7개 데이터 포인트 (sparse sampling 방지)
        if (past.totalDays < 14 || past.curve.length < 7) continue;

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

      // 유사도 내림차순 정렬, 상위 3개 선택
      topMatches.sort((a, b) => b.similarity - a.similarity);
      const finalMatches = topMatches.slice(0, 3);

      if (finalMatches.length > 0) {
        themesWithMatches++;
        totalMatches += finalMatches.length;

        const today = getKSTDate();

        // 매칭 결과 저장 (필라 점수 + 결과 데이터)
        for (const match of finalMatches) {
          // isFinite 가드: NaN/Infinity가 DB에 들어가는 것을 방지
          const numericFields = [match.similarity, match.featureSim, match.curveSim, match.keywordSim];
          if (!numericFields.every(v => isFinite(v))) {
            console.error(`   ⚠️ 비정상 수치 감지 (${match.pastThemeName}): sim=${match.similarity}, f=${match.featureSim}, c=${match.curveSim}, k=${match.keywordSim} — 건너뜀`);
            continue;
          }

          // 과거 테마의 결과 컨텍스트 계산
          const pastScores = scoresByTheme.get(match.pastThemeId) || [];
          let pastPeakScore: number | null = null;
          for (const s of pastScores) {
            if (pastPeakScore === null || s.score > pastPeakScore) pastPeakScore = s.score;
          }
          const pastThemeData = enrichedMap.get(match.pastThemeId);
          const pastFinalStage = pastThemeData && !pastThemeData.isActive ? 'Dormant' : null;
          // 캡핑된 값으로 일관성 유지 (match.pastPeakDay/pastTotalDays는 composite에서 이미 캡핑됨)
          const pastDeclineDays = pastPeakScore !== null && match.pastPeakDay > 0
            ? Math.max(0, match.pastTotalDays - match.pastPeakDay)
            : null;

          const { error: compError } = await supabaseAdmin
            .from('theme_comparisons')
            .upsert(
              {
                current_theme_id: currentTheme.id,
                past_theme_id: match.pastThemeId,
                similarity_score: match.similarity,
                current_day: match.currentDay,
                past_peak_day: Math.max(0, match.pastPeakDay),
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

        // 오늘 날짜의 최종 매칭에 없는 오래된 항목 삭제
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
