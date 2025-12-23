import { NextRequest, NextResponse } from 'next/server';
import { getBatchDailyClosePrices } from '@/app/archive/_utils/api/kis/client';

/** GET /api/stock/daily-close?tickers=KOSPI:005930&date=20241220 */
export async function GET(req: NextRequest) {
  try {
    const tickers = req.nextUrl.searchParams.get('tickers')?.split(',').map((t) => t.trim()).filter(Boolean);
    const date = req.nextUrl.searchParams.get('date');
    if (!tickers?.length || tickers.length > 10 || !date) {
      return NextResponse.json({ success: false, error: 'Invalid params' }, { status: 400 });
    }
    return NextResponse.json({ success: true, prices: Object.fromEntries(await getBatchDailyClosePrices(tickers, date)) });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
