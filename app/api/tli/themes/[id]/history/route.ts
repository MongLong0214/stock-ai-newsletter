import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabasePlaceholder } from '@/lib/supabase';
import type { Stage } from '@/lib/tli/types';

/**
 * TLI 테마 점수 히스토리 조회 API
 * GET /api/tli/themes/[id]/history
 *
 * 특정 테마의 30일 생명주기 점수 이력 반환
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
        success: true,
        data: [],
        metadata: { count: 0, themeId: id, duration_ms: 0, timestamp: new Date().toISOString() },
      });
    }

    // Verify theme exists
    const { data: theme, error: themeError } = await supabase
      .from('themes')
      .select('id')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (themeError) {
      console.error('[TLI API] Theme verification error:', themeError);

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

    // Fetch 30-day history
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const { data: history, error: historyError } = await supabase
      .from('lifecycle_scores')
      .select('calculated_at, score, stage')
      .eq('theme_id', id)
      .gte('calculated_at', thirtyDaysAgo)
      .order('calculated_at', { ascending: true });

    if (historyError) {
      console.error('[TLI API] History fetch error:', historyError);
      throw historyError;
    }

    const results = (history || []).map((item) => ({
      date: item.calculated_at,
      score: item.score,
      stage: item.stage as Stage,
    }));

    const duration = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        data: results,
        metadata: {
          count: results.length,
          themeId: id,
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

    console.error('[TLI API] Theme history error:', {
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
          message: '테마 점수 이력을 불러오는데 실패했습니다.',
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
