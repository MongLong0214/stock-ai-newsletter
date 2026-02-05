import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabasePlaceholder } from '@/lib/supabase';
import { getStageKo } from '@/lib/tli/types';
import type { Stage } from '@/lib/tli/types';

/**
 * TLI 종목별 테마 정보 조회 API
 * GET /api/tli/stocks/[symbol]/theme
 *
 * 특정 종목이 속한 모든 테마와 각 테마의 현재 점수 및 단계 반환
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();

  try {
    const { symbol } = await params;

    // Input validation
    if (!symbol || symbol.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '종목 코드가 필요합니다.',
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    if (isSupabasePlaceholder) {
      return NextResponse.json({
        success: true,
        data: [],
        metadata: { symbol, count: 0, duration_ms: 0, timestamp: new Date().toISOString() },
      });
    }

    // Fetch themes this stock belongs to
    const { data: themeStocks, error: themeStocksError } = await supabase
      .from('theme_stocks')
      .select('theme_id, source, relevance')
      .eq('symbol', symbol)
      .eq('is_active', true);

    if (themeStocksError) {
      console.error('[TLI API] Theme stocks fetch error:', themeStocksError);

      // If tables don't exist yet (migration not run), return empty data gracefully
      if (themeStocksError.code === '42P01' || themeStocksError.message?.includes('relation') || themeStocksError.message?.includes('does not exist')) {
        console.warn('[TLI API] TLI tables not found - returning empty stock themes');
        const duration = Date.now() - startTime;
        return NextResponse.json(
          {
            success: true,
            data: [],
            metadata: {
              symbol,
              count: 0,
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
      }

      throw themeStocksError;
    }

    if (!themeStocks || themeStocks.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: [],
          metadata: {
            symbol,
            count: 0,
            duration_ms: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
            'X-Response-Time': `${Date.now() - startTime}ms`,
          },
        }
      );
    }

    // For each theme, get theme info and latest score
    const results = await Promise.all(
      themeStocks.map(async (ts) => {
        const { data: theme } = await supabase
          .from('themes')
          .select('id, name, name_en')
          .eq('id', ts.theme_id)
          .eq('is_active', true)
          .single();

        if (!theme) return null;

        const { data: score } = await supabase
          .from('lifecycle_scores')
          .select('score, stage, is_reigniting, calculated_at')
          .eq('theme_id', ts.theme_id)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .single();

        return {
          themeId: theme.id,
          themeName: theme.name,
          themeNameEn: theme.name_en,
          score: score?.score ?? 0,
          stage: (score?.stage ?? 'Dormant') as Stage,
          stageKo: getStageKo((score?.stage ?? 'Dormant') as Stage),
          isReigniting: score?.is_reigniting ?? false,
          relevance: ts.relevance,
          source: ts.source,
          updatedAt: score?.calculated_at ?? null,
        };
      })
    );

    // Filter out null results and sort by score descending
    const validResults = results.filter((r) => r !== null).sort((a, b) => b!.score - a!.score);

    const duration = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        data: validResults,
        metadata: {
          symbol,
          count: validResults.length,
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

    console.error('[TLI API] Stock theme error:', {
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
          message: '종목 테마 정보를 불러오는데 실패했습니다.',
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
