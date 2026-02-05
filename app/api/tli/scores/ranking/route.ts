import { NextResponse } from 'next/server';
import { supabase, isSupabasePlaceholder } from '@/lib/supabase';
import { getStageKo } from '@/lib/tli/types';
import type { Stage, ThemeListItem, ThemeRanking } from '@/lib/tli/types';

/**
 * TLI 생명주기 단계별 랭킹 API
 * GET /api/tli/scores/ranking
 *
 * 모든 테마를 생명주기 단계별로 그룹화하고 점수순으로 정렬
 * Early: 점수 오름차순 (낮은 점수 = 가장 초기 = 새로운 기회)
 * Growth, Peak, Decay, Reigniting: 점수 내림차순
 */
export async function GET() {
  const startTime = Date.now();

  try {
    if (isSupabasePlaceholder) {
      return NextResponse.json({
        success: true,
        data: { early: [], growth: [], peak: [], decay: [], reigniting: [] },
        metadata: { total: 0, byStage: { early: 0, growth: 0, peak: 0, decay: 0, reigniting: 0 }, duration_ms: 0, timestamp: new Date().toISOString() },
      });
    }

    // Fetch all active themes
    const { data: themes, error: themesError } = await supabase
      .from('themes')
      .select('id, name, name_en')
      .eq('is_active', true);

    if (themesError) {
      console.error('[TLI API] Themes fetch error:', themesError);

      // If tables don't exist yet (migration not run), return empty data gracefully
      if (themesError.code === '42P01' || themesError.message?.includes('relation') || themesError.message?.includes('does not exist')) {
        console.warn('[TLI API] TLI tables not found - returning empty ranking');
        const duration = Date.now() - startTime;
        return NextResponse.json(
          {
            success: true,
            data: { early: [], growth: [], peak: [], decay: [], reigniting: [] },
            metadata: {
              total: 0,
              byStage: { early: 0, growth: 0, peak: 0, decay: 0, reigniting: 0 },
              duration_ms: duration,
              timestamp: new Date().toISOString(),
            },
          },
          {
            headers: {
              'Cache-Control': 'public, s-maxage=60',
              'X-Response-Time': `${duration}ms`,
            },
          }
        );
      }

      throw themesError;
    }

    // For each theme, get the latest lifecycle score
    const themeData = await Promise.all(
      (themes || []).map(async (theme) => {
        const { data: score } = await supabase
          .from('lifecycle_scores')
          .select('score, stage, is_reigniting, calculated_at')
          .eq('theme_id', theme.id)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .single();

        // Get 7-day change
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        const { data: weekAgo } = await supabase
          .from('lifecycle_scores')
          .select('score')
          .eq('theme_id', theme.id)
          .lte('calculated_at', sevenDaysAgo)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .single();

        // Count stocks
        const { count } = await supabase
          .from('theme_stocks')
          .select('*', { count: 'exact', head: true })
          .eq('theme_id', theme.id)
          .eq('is_active', true);

        const item: ThemeListItem = {
          id: theme.id,
          name: theme.name,
          nameEn: theme.name_en,
          score: score?.score ?? 0,
          stage: (score?.stage ?? 'Dormant') as Stage,
          stageKo: getStageKo((score?.stage ?? 'Dormant') as Stage),
          change7d: score?.score && weekAgo?.score ? score.score - weekAgo.score : 0,
          stockCount: count ?? 0,
          isReigniting: score?.is_reigniting ?? false,
          updatedAt: score?.calculated_at ?? new Date().toISOString(),
        };

        return item;
      })
    );

    // Group by stage and sort
    const early: ThemeListItem[] = [];
    const growth: ThemeListItem[] = [];
    const peak: ThemeListItem[] = [];
    const decay: ThemeListItem[] = [];
    const reigniting: ThemeListItem[] = [];

    for (const theme of themeData) {
      if (theme.isReigniting) {
        reigniting.push(theme);
      } else {
        switch (theme.stage) {
          case 'Early':
            early.push(theme);
            break;
          case 'Growth':
            growth.push(theme);
            break;
          case 'Peak':
            peak.push(theme);
            break;
          case 'Decay':
            decay.push(theme);
            break;
          default:
            // Dormant themes excluded from ranking
            break;
        }
      }
    }

    // Sort: Early ASC (lowest score = newest opportunity), others DESC
    early.sort((a, b) => a.score - b.score);
    growth.sort((a, b) => b.score - a.score);
    peak.sort((a, b) => b.score - a.score);
    decay.sort((a, b) => b.score - a.score);
    reigniting.sort((a, b) => b.score - a.score);

    const ranking: ThemeRanking = {
      early,
      growth,
      peak,
      decay,
      reigniting,
    };

    const duration = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        data: ranking,
        metadata: {
          total: themeData.length,
          byStage: {
            early: early.length,
            growth: growth.length,
            peak: peak.length,
            decay: decay.length,
            reigniting: reigniting.length,
          },
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

    console.error('[TLI API] Ranking error:', {
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
          message: '랭킹 정보를 불러오는데 실패했습니다.',
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
