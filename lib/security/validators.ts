/**
 * Pure validators for tickers and dates.
 * Deterministic, no side-effects — suitable for direct unit testing.
 */

/** Korean stock ticker: exactly 6 digits */
export const KOREAN_TICKER_PATTERN = /^[0-9]{6}$/;

/** General ticker: 1-10 alphanumeric characters */
export const GENERAL_TICKER_PATTERN = /^[A-Za-z0-9]{1,10}$/;

/** Exchange-prefixed ticker: EXCHANGE:TICKER */
export const TICKER_WITH_EXCHANGE_PATTERN = /^[A-Z]{2,10}:[0-9A-Za-z]{1,10}$/;

/** Date pattern: YYYYMMDD */
export const DATE_PATTERN = /^\d{8}$/;

/** Days in each month (non-leap year, 0-indexed) */
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Validate a ticker string.
 * Accepts Korean 6-digit or general alphanumeric up to 10 chars.
 */
export function isValidTicker(ticker: string): boolean {
  return KOREAN_TICKER_PATTERN.test(ticker) || GENERAL_TICKER_PATTERN.test(ticker);
}

/**
 * Validate a ticker with exchange prefix (e.g. KOSPI:005930).
 */
export function isValidExchangeTicker(ticker: string): boolean {
  return TICKER_WITH_EXCHANGE_PATTERN.test(ticker);
}

/**
 * Validate a date string as a real calendar date.
 * Rejects Feb 30, Apr 31, etc.
 * Range: 2020-01-01 to 2100-12-31.
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!DATE_PATTERN.test(dateStr)) return false;
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6));
  const day = parseInt(dateStr.slice(6, 8));

  if (year < 2020 || year > 2100) return false;
  if (month < 1 || month > 12) return false;

  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > maxDay) return false;

  return true;
}

/**
 * Validate a date is not in the far future (tomorrow at most).
 */
export function isDateNotFuture(dateStr: string): boolean {
  if (!isValidCalendarDate(dateStr)) return false;
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6));
  const day = parseInt(dateStr.slice(6, 8));

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);
  const inputDate = new Date(year, month - 1, day);
  return inputDate <= tomorrow;
}

/** Maximum tickers allowed per request */
export const MAX_TICKERS_PER_REQUEST = 10;
