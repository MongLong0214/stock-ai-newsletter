// Published exchange calendar, checked 2026-09-07. Outside this range, fail closed.
// https://www.nyse.com/trade/hours-calendars
const HOLIDAYS: Record<string, readonly string[]> = {
  '2026': ['01-01', '01-19', '02-16', '04-03', '05-25', '06-19', '07-03', '09-07', '11-26', '12-25'],
  '2027': ['01-01', '01-18', '02-15', '03-26', '05-31', '06-18', '07-05', '09-06', '11-25', '12-24'],
  '2028': ['01-17', '02-21', '04-14', '05-29', '06-19', '07-04', '09-04', '11-23', '12-25'],
};
const EARLY_CLOSE = new Set(['2026-11-27', '2026-12-24', '2027-11-26', '2028-07-03', '2028-11-24']);
export const hasUsMarketCalendar = (date: string) => !!HOLIDAYS[date.slice(0, 4)];
export function isUsTradingDate(date: string): boolean {
  return hasUsMarketCalendar(date) && ![0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())
    && !HOLIDAYS[date.slice(0, 4)].includes(date.slice(5));
}
export const getUsSessionCloseTime = (date: string): string => EARLY_CLOSE.has(date) ? '13:00' : '16:00';
