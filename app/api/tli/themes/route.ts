import { NextResponse } from 'next/server';
import { supabase, isSupabasePlaceholder } from '@/lib/supabase';
import { getStageKo } from '@/lib/tli/types';
import type { Stage } from '@/lib/tli/types';

/**
 * TLI 테마 목록 조회 API
 * GET /api/tli/themes
 *
 * 모든 활성 테마와 현재 생명주기 점수 반환
 */
export async function GET() {
  const startTime = Date.now();

  try {
    if (isSupabasePlaceholder) {
      return NextResponse.json({
        success: true,
        data: [],
        metadata: { count: 0, duration_ms: 0, timestamp: new Date().toISOString() },
      });
    }

    // Fetch all active themes
    const { data: themes, error: themesError } = await supabase
      .from('themes')
      .select('id, name, name_en')
      .eq('is_active', true)
      .order('name');

    if (themesError) {
      console.error('[TLI API] Themes fetch error:', themesError);

      // If tables don't exist yet (migration not run), return empty data gracefully
      if (themesError.code === '42P01' || themesError.message?.includes('relation') || themesError.message?.includes('does not exist')) {
        console.warn('[TLI API] TLI tables not found - returning empty themes list');
        const duration = Date.now() - startTime;
        return NextResponse.json(
          {
            success: true,
            data: [],
            metadata: {
              count: 0,
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
    const results = await Promise.all(
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

        return {
          id: theme.id,
          name: theme.name,
          nameEn: theme.name_en,
          score: score?.score ?? 0,
          stage: (score?.stage ?? 'Dormant') as Stage,
          stageKo: getStageKo((score?.stage ?? 'Dormant') as Stage),
          change7d: score?.score && weekAgo?.score ? score.score - weekAgo.score : 0,
          stockCount: count ?? 0,
          isReigniting: score?.is_reigniting ?? false,
          updatedAt: score?.calculated_at ?? null,
        };
      })
    );

    const duration = Date.now() - startTime;

    const response = NextResponse.json(
      {
        success: true,
        data: results,
        metadata: {
          count: results.length,
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

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = error && typeof error === 'object' && 'code' in error ? (error as { code: unknown }).code : undefined;
    const errorDetails = error && typeof error === 'object' && 'details' in error ? (error as { details: unknown }).details : undefined;

    console.error('[TLI API] Themes error:', {
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
          message: '테마 목록을 불러오는데 실패했습니다.',
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
