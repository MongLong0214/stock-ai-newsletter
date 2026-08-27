/**
 * 캡처 섹션의 데이터 유효성 — 파일 생성만으로 "찍혔다"고 보지 않는다.
 */

/**
 * 빈 상태 문구.
 *
 * 추이 차트뿐 아니라 뉴스·종목 섹션도 로딩·빈 상태 문구를 보여준다. 그 화면을 찍으면
 * "이미지 4장"은 채우지만 정보 가치가 0인 이미지가 공개된다.
 */
/**
 * 빈 상태 문구는 **구체적인 것만** 쓴다.
 *
 * 섹션 텍스트는 클립 영역과 겹치는 모든 요소를 모아 만든다. 그래서 `불러오는 중`,
 * `아직 없습니다`, `표시할 항목이 없` 같은 일반 문구를 넣으면 주변 UI에 걸려
 * **정상 섹션이 빈 화면으로 판정된다** — 실측에서 관련종목·관련뉴스 필수 캡처가
 * 전부 실패해 발행 0건이 됐다. 과도한 엄격화는 결함과 같은 비용이다.
 *
 * 섹션별 빈 상태는 문구가 아니라 **양의 신호**로 보는 편이 안전하다
 * (관련종목은 행 수, 추이는 데이터 선 길이). 문구를 추가할 때는 실측으로
 * 오탐이 없는지 확인한 것만 넣는다.
 */
export const EMPTY_CHART_RE = /비교선이 아직 없어요|비교선이 없습니다|표시할 데이터가 없/;

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
