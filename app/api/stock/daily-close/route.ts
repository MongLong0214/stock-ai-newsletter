import { NextRequest, NextResponse } from 'next/server';
import { getBatchDailyClosePrices } from '@/app/archive/_utils/api/kis/client';
import { checkRateLimit, getTrustedClientIp, RATE_LIMITS } from '@/lib/security/rate-limit';

/**
 * GET /api/stock/daily-close?tickers=KOSPI:005930&date=20241220
 *
 * Strict validation:
 * - Tickers: EXCHANGE:TICKER format (e.g. KOSPI:005930), max 10
 * - Date: YYYYMMDD, must be a real calendar date within valid range (2020-01-01 to tomorrow)
 */

const TICKER_WITH_EXCHANGE_PATTERN = /^[A-Z]{2,10}:[0-9A-Za-z]{1,10}$/;
const DATE_PATTERN = /^\d{8}$/;

/** Days in each month (non-leap year) */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Validate a date string as a real calendar date.
 * Rejects Feb 30, Apr 31, etc.
 */
function isValidCalendarDate(dateStr: string): boolean {
  if (!DATE_PATTERN.test(dateStr)) return false;
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6));
  const day = parseInt(dateStr.slice(6, 8));

  if (year < 2020 || year > 2100) return false;
  if (month < 1 || month > 12) return false;

  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > maxDay) return false;

  // Check it's not in the far future (next day at most)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);
  const inputDate = new Date(year, month - 1, day);
  return inputDate <= tomorrow;
}

export async function GET(req: NextRequest) {
  // Distributed rate limiting (fail-closed)
  const clientIp = getTrustedClientIp(req.headers);
  const rateResult = await checkRateLimit(clientIp, RATE_LIMITS.dailyClose);
  if (rateResult.status === 'limited') {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }
  if (rateResult.status === 'unavailable') {
    return NextResponse.json(
      { success: false, error: 'Service temporarily unavailable' },
      { status: 503 }
    );
  }

  try {
    const tickers = req.nextUrl.searchParams.get('tickers')?.split(',').map((t) => t.trim()).filter(Boolean);
    const date = req.nextUrl.searchParams.get('date');

    if (!tickers?.length || tickers.length > 10 || !date) {
      return NextResponse.json({ success: false, error: 'Invalid params: tickers (max 10) and date required' }, { status: 400 });
    }

    // Strict ticker format validation
    const invalidTickers = tickers.filter((t) => !TICKER_WITH_EXCHANGE_PATTERN.test(t));
    if (invalidTickers.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid ticker format. Expected EXCHANGE:TICKER (e.g. KOSPI:005930)' },
        { status: 400 }
      );
    }

    // Strict date validation (real calendar date)
    if (!isValidCalendarDate(date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date. Expected YYYYMMDD, a real calendar date within valid range (2020-present)' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      prices: Object.fromEntries(await getBatchDailyClosePrices(tickers, date)),
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch daily close prices' }, { status: 500 });
  }
}
