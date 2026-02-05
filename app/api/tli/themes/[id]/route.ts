import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabasePlaceholder } from '@/lib/supabase';
import { getStageKo } from '@/lib/tli/types';
import type { Stage, ThemeDetail } from '@/lib/tli/types';

/**
 * TLI 테마 상세 조회 API
 * GET /api/tli/themes/[id]
 *
 * 특정 테마의 상세 정보, 점수 구성 요소, 관련 종목, 유사 테마 비교, 생명주기 곡선 반환
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();

  try {
    const { id } = await params;

    if (isSupabasePlaceholder) {
      return NextResponse.json({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'Supabase 환경변수가 설정되지 않았습니다.', statusCode: 503 },
      }, { status: 503 });
    }

    // Fetch theme basic info
    const { data: theme, error: themeError } = await supabase
      .from('themes')
      .select('id, name, name_en, description')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (themeError) {
      console.error('[TLI API] Theme fetch error:', themeError);

      // If tables don't exist yet (migration not run), return 404
      if (themeError.code === '42P01' || themeError.message?.includes('relation') || themeError.message?.includes('does not exist')) {
        console.warn('[TLI API] TLI tables not found');
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: '테마를 찾을 수 없습니다.',
              statusCode: 404,
            },
          },
          { status: 404 }
        );
      }
    }

    if (!theme) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '테마를 찾을 수 없습니다.',
            statusCode: 404,
          },
        },
        { status: 404 }
      );
    }

    // Fetch latest score with components
    const { data: latestScore } = await supabase
      .from('lifecycle_scores')
      .select('score, stage, is_reigniting, calculated_at, components')
      .eq('theme_id', id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();

    // Get 24h change
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const { data: dayAgo } = await supabase
      .from('lifecycle_scores')
      .select('score')
      .eq('theme_id', id)
      .lte('calculated_at', oneDayAgo)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();

    // Get 7-day change
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const { data: weekAgo } = await supabase
      .from('lifecycle_scores')
      .select('score')
      .eq('theme_id', id)
      .lte('calculated_at', sevenDaysAgo)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();

    // Fetch related stocks
    const { data: stocks } = await supabase
      .from('theme_stocks')
      .select('symbol, name, market, source, relevance')
      .eq('theme_id', id)
      .eq('is_active', true)
      .order('relevance', { ascending: false });

    // Fetch theme comparisons
    const { data: comparisons } = await supabase
      .from('theme_comparisons')
      .select(`
        id,
        past_theme_id,
        similarity_score,
        current_day,
        past_peak_day,
        past_total_days,
        message
      `)
      .eq('current_theme_id', id)
      .order('similarity_score', { ascending: false })
      .limit(5);

    // Get past theme names
    const comparisonResults = await Promise.all(
      (comparisons || []).map(async (comp) => {
        const { data: pastTheme } = await supabase
          .from('themes')
          .select('name')
          .eq('id', comp.past_theme_id)
          .single();

        const estimatedDaysToPeak = comp.past_peak_day - comp.current_day;
        const postPeakDecline = comp.current_day > comp.past_peak_day
          ? ((comp.past_total_days - comp.current_day) / comp.past_total_days) * 100
          : null;

        return {
          pastTheme: pastTheme?.name ?? 'Unknown',
          similarity: comp.similarity_score,
          currentDay: comp.current_day,
          pastPeakDay: comp.past_peak_day,
          estimatedDaysToPeak,
          postPeakDecline,
          message: comp.message,
        };
      })
    );

    // Fetch 30-day lifecycle curve
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const { data: historicalScores } = await supabase
      .from('lifecycle_scores')
      .select('calculated_at, score')
      .eq('theme_id', id)
      .gte('calculated_at', thirtyDaysAgo)
      .order('calculated_at', { ascending: true });

    const components = latestScore?.components as Record<string, unknown>;

    const result: ThemeDetail = {
      id: theme.id,
      name: theme.name,
      nameEn: theme.name_en,
      description: theme.description,
      score: {
        value: latestScore?.score ?? 0,
        stage: (latestScore?.stage ?? 'Dormant') as Stage,
        stageKo: getStageKo((latestScore?.stage ?? 'Dormant') as Stage),
        updatedAt: latestScore?.calculated_at ?? new Date().toISOString(),
        change24h: latestScore?.score && dayAgo?.score ? latestScore.score - dayAgo.score : 0,
        change7d: latestScore?.score && weekAgo?.score ? latestScore.score - weekAgo.score : 0,
        components: {
          interest: (components?.interest_score as number | undefined) ?? 0,
          newsMomentum: (components?.news_momentum as number | undefined) ?? 0,
          volatility: (components?.volatility_score as number | undefined) ?? 0,
          maturity: (components?.maturity_ratio as number | undefined) ?? 0,
        },
      },
      stocks: (stocks || []).map((s) => ({
        symbol: s.symbol,
        name: s.name,
        market: s.market,
        source: s.source,
        relevance: s.relevance,
      })),
      comparisons: comparisonResults,
      lifecycleCurve: (historicalScores || []).map((s) => ({
        date: s.calculated_at,
        score: s.score,
      })),
    };

    const duration = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        data: result,
        metadata: {
          duration_ms: duration,
          timestamp: new Date().toISOString(),
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
          'X-Response-Time': `${duration}ms`,
        },
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = error && typeof error === 'object' && 'code' in error ? (error as { code: unknown }).code : undefined;
    const errorDetails = error && typeof error === 'object' && 'details' in error ? (error as { details: unknown }).details : undefined;

    console.error('[TLI API] Theme detail error:', {
      message: errorMessage,
      code: errorCode,
      details: errorDetails,
      duration_ms: duration,
      stack: error instanceof Error ? error.stack : undefined,
      fullError: error,
    });

    const isProduction = process.env.NODE_ENV === 'production';

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '테마 상세 정보를 불러오는데 실패했습니다.',
          details: !isProduction ? `${errorMessage}${errorCode ? ` (code: ${errorCode})` : ''}${errorDetails ? ` - ${errorDetails}` : ''}` : 'Unknown error',
          statusCode: 500,
        },
      },
      {
        status: 500,
        headers: {
          'X-Response-Time': `${duration}ms`,
        },
      }
    );
  }
}

export const runtime = 'nodejs';
