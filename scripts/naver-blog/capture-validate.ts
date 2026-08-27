/**
 * 캡처 섹션의 데이터 유효성 — 파일 생성만으로 "찍혔다"고 보지 않는다.
 */

export const EMPTY_CHART_RE = /비교선이 아직 없어요|데이터가 없어요|표시할 데이터가 없|비교선이 없습니다/;

export function isEmptyChartCopy(text: string): boolean {
  return EMPTY_CHART_RE.test(text);
}

/** Recharts path가 축/빈 경로가 아니라 실제 곡선인지 */
export function hasUsableDataLine(paths: readonly { d: string }[]): boolean {
  return paths.some((path) => {
    const d = path.d ?? '';
    if (d.length < 60) return false;
    const commands = d.replace(/[0-9eE.+,\s-]/g, '');
    if (commands.length === 0) return false;
    if (/^[MLmlHVhvZz]+$/.test(commands) && d.length < 80) return false;
    return /[CcSsQqTtAa]/.test(commands) || d.length > 80;
  });
}

/**
 * 캡처 영역에 필요한 만큼의 종목 행이 보이는가.
 *
 * 동수 비교(`===`)였을 때는 8개 초과 테마에서 항상 실패했다 — 초안은 종목을 8개로
 * 자르지만 상세 페이지는 활성 종목 **전체**를 렌더하므로 DOM 12행 vs 기대 8행이 된다.
 * 이 검사의 목적은 "표가 잘렸는가"이므로 하한 비교가 맞다.
 */
export function stockRowsMatch(visibleRows: number, expected: number): boolean {
  return expected > 0 && visibleRows >= expected;
}

export function shouldIncludeTrend(input: { dataLineCount: number; emptyCopy: boolean }): boolean {
  return !input.emptyCopy && input.dataLineCount >= 1;
}

export function shouldSplitStocks(rowCount: number, maxPerImage = 4): boolean {
  return rowCount > maxPerImage;
}

/** theme 글에서 기본 제외하는 캡처 대상 */
export const THEME_EXCLUDED_SECTIONS = ['outlook', 'pattern'] as const;

export function isExcludedThemeSection(name: string): boolean {
  return THEME_EXCLUDED_SECTIONS.some((section) => name.includes(section));
}
