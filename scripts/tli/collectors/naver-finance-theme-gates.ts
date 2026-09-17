import { z } from 'zod';

export const NAVER_FINANCE_THEME_GATE_DEFAULTS = {
  minimumCoverage: 0.7,
  minimumSchemaParseRate: 0.95,
  currentPriceRange: { min: 1, max: 10_000_000 },
  /**
   * **KRX가 법적으로 허용하는 범위**다. 평시 가격제한폭(±30%)이 아니다.
   *
   * 이 게이트의 목적은 시장 이상치 제거가 아니라 **소스 열화·파싱 붕괴 탐지**다
   * (PRD R10 / H.4). 그래서 경계는 "실제로 나올 수 있는 값"이어야 하고, 평시
   * 제한폭을 쓰면 합법적인 시세가 테마를 통째로 버리게 만든다.
   *
   * - 상한 +300%: 신규상장일은 공모가의 60~400% 범위에서 거래된다(2023-06-26 시행).
   *   실측 — 에스팀(458350) 2026-03-09 +300%, 종가 34,000원. 게이트 도입(2026-07-06)
   *   전이라 저장됐고, 도입 후였다면 그 테마 전체가 버려졌다.
   * - 하한 -100%: 정리매매 종목에는 가격제한폭이 없다. 가격이 0이 될 수 없으므로
   *   -100%가 물리적 바닥이다.
   *
   * 파싱이 깨지면 값은 이 범위를 크게 벗어난다(등락률 칸에 거래량·가격이 들어오면
   * 수천~수백만). 탐지력은 유지된다.
   */
  priceChangePctRange: { min: -100, max: 300 },
  volumeRange: { min: 0, max: 5_000_000_000 },
} as const;

/**
 * T-001 행수 게이트 보완: HTML 내 게이트(파싱률·값범위)는 "같은 페이지에서 센 행수"를
 * 분모로 쓰므로 네이버가 축소된 정상 형태 페이지를 내려주면 무력화된다.
 * 직전 실행 대비 수집량 붕괴(＜70%)를 별도로 감지해 상호보완한다.
 */
export const NAVER_FINANCE_COLLECTION_COLLAPSE_DEFAULTS = {
  /** 이 미만이면 부트스트랩/소규모 테마 집합으로 보고 붕괴 판정을 건너뜀 */
  minimumBaselineCount: 50,
  /** 직전 대비 이 비율 미만으로 수집되면 붕괴로 간주 */
  minimumRetentionRatio: 0.7,
} as const;

export function shouldRejectStockCollection(input: {
  readonly prevCount: number;
  readonly collectedCount: number;
  readonly minimumBaselineCount?: number;
  readonly minimumRetentionRatio?: number;
}): boolean {
  const minimumBaselineCount =
    input.minimumBaselineCount ?? NAVER_FINANCE_COLLECTION_COLLAPSE_DEFAULTS.minimumBaselineCount;
  const minimumRetentionRatio =
    input.minimumRetentionRatio ?? NAVER_FINANCE_COLLECTION_COLLAPSE_DEFAULTS.minimumRetentionRatio;

  if (input.prevCount < minimumBaselineCount) return false;
  return input.collectedCount < input.prevCount * minimumRetentionRatio;
}

export type NaverFinanceThemeGateOptions = {
  readonly expectedRows: number;
  readonly minimumCoverage?: number;
  readonly minimumSchemaParseRate?: number;
};

export type NaverFinanceThemeGateMetrics = {
  readonly expectedRows: number;
  readonly minimumCoverage: number;
  readonly minimumSchemaParseRate: number;
  readonly totalRows: number;
  readonly validRows: number;
  readonly rowCoverage: number;
  readonly schemaParseRate: number;
};

export type NaverFinanceThemeGateIssue =
  | { readonly kind: 'invalidExpectedRows'; readonly actual: number }
  | { readonly kind: 'zeroRows'; readonly actual: number }
  | { readonly kind: 'minimumCoverage'; readonly actual: number; readonly minimum: number }
  | {
      readonly kind: 'schemaParseRate';
      readonly actual: number;
      readonly minimum: number;
      readonly malformedRows: readonly number[];
    }
  | {
      readonly kind: 'valueRange';
      readonly rows: readonly number[];
      /**
       * 어떤 종목의 어떤 값이 왜 걸렸는지. `kind`만 남기면 로그만 보고 원인을 가릴 수 없어
       * 조사를 한 바퀴 더 돌아야 한다 — 2026-09-10 리다이렉트 사고와 같은 실패 방식이다.
       */
      readonly violations: readonly ValueRangeViolation[];
    };

export type ValueRangeViolation = {
  readonly index: number;
  readonly symbol: string;
  readonly field: 'currentPrice' | 'priceChangePct' | 'volume';
  readonly value: number;
  readonly min: number;
  readonly max: number;
};

const describeIssue = (issue: NaverFinanceThemeGateIssue): string => {
  if (issue.kind !== 'valueRange') return issue.kind;
  const shown = issue.violations
    .slice(0, 3)
    .map((v) => `${v.symbol} ${v.field}=${v.value} (허용 ${v.min}~${v.max})`)
    .join('; ');
  const rest = issue.violations.length > 3 ? ` 외 ${issue.violations.length - 3}건` : '';
  return `valueRange[${shown}${rest}]`;
};

export class NaverFinanceThemeGateError extends Error {
  readonly name = 'NaverFinanceThemeGateError';

  constructor(
    readonly issues: readonly NaverFinanceThemeGateIssue[],
    readonly metrics: NaverFinanceThemeGateMetrics,
  ) {
    super(`Naver finance theme scraper gate failed: ${issues.map(describeIssue).join(', ')}`);
  }
}

const NaverFinanceThemeStockSchema = z
  .object({
    themeId: z.string().min(1),
    // KRX 단축코드는 **숫자 6자리가 아니다.** 신규상장·SPAC에는 영숫자 코드가 붙는다
    // (실측: 0130H0 엔에이치스팩33호, 0220W0 한화머시너리앤서비스홀딩스, 0082N0 카나프테라퓨틱스).
    // 숫자만 허용하던 동안 구 HTML 스크래퍼는 이들을 조용히 건너뛰어 데이터가 샜고
    // (SPAC 테마 69개 중 31개 유실), JSON API로 옮긴 뒤에는 파싱률 게이트에 걸려
    // 테마가 통째로 버려졌다. 같은 원인이 증상만 바꿔 나타난 것이다.
    symbol: z.string().regex(/^[0-9A-Z]{6}$/),
    name: z.string().min(1),
    market: z.union([z.literal('KOSPI'), z.literal('KOSDAQ')]),
    currentPrice: z.number().finite(),
    priceChangePct: z.number().finite(),
    volume: z.number().int().finite(),
  })
  .strict();

export type NaverFinanceThemeStock = z.infer<typeof NaverFinanceThemeStockSchema>;

type ParsedScraperRow = {
  readonly index: number;
  readonly value: NaverFinanceThemeStock;
};

export function validateNaverFinanceThemeStocks(
  rows: readonly unknown[],
  options: NaverFinanceThemeGateOptions,
): NaverFinanceThemeGateMetrics {
  const minimumCoverage = options.minimumCoverage ?? NAVER_FINANCE_THEME_GATE_DEFAULTS.minimumCoverage;
  const minimumSchemaParseRate =
    options.minimumSchemaParseRate ?? NAVER_FINANCE_THEME_GATE_DEFAULTS.minimumSchemaParseRate;
  const parsedRows = parseRows(rows);
  const metrics = buildMetrics(rows, parsedRows, {
    expectedRows: options.expectedRows,
    minimumCoverage,
    minimumSchemaParseRate,
  });
  const issues = collectIssues(rows, parsedRows, metrics);

  if (issues.length > 0) {
    throw new NaverFinanceThemeGateError(issues, metrics);
  }

  return metrics;
}

function parseRows(rows: readonly unknown[]): readonly ParsedScraperRow[] {
  return rows.flatMap((row, index) => {
    const result = NaverFinanceThemeStockSchema.safeParse(row);
    return result.success ? [{ index, value: result.data }] : [];
  });
}

function buildMetrics(
  rows: readonly unknown[],
  parsedRows: readonly ParsedScraperRow[],
  options: Required<NaverFinanceThemeGateOptions>,
): NaverFinanceThemeGateMetrics {
  const schemaParseRate = rows.length === 0 ? 0 : parsedRows.length / rows.length;
  const rowCoverage = options.expectedRows > 0 ? rows.length / options.expectedRows : 0;

  return {
    expectedRows: options.expectedRows,
    minimumCoverage: options.minimumCoverage,
    minimumSchemaParseRate: options.minimumSchemaParseRate,
    totalRows: rows.length,
    validRows: parsedRows.length,
    rowCoverage,
    schemaParseRate,
  };
}

function collectIssues(
  rows: readonly unknown[],
  parsedRows: readonly ParsedScraperRow[],
  metrics: NaverFinanceThemeGateMetrics,
): readonly NaverFinanceThemeGateIssue[] {
  const issues: NaverFinanceThemeGateIssue[] = [];

  if (!Number.isFinite(metrics.expectedRows) || metrics.expectedRows <= 0) {
    issues.push({ kind: 'invalidExpectedRows', actual: metrics.expectedRows });
  }

  if (rows.length === 0) {
    issues.push({ kind: 'zeroRows', actual: rows.length });
  }

  if (metrics.rowCoverage < metrics.minimumCoverage) {
    issues.push({
      kind: 'minimumCoverage',
      actual: metrics.rowCoverage,
      minimum: metrics.minimumCoverage,
    });
  }

  if (metrics.schemaParseRate < metrics.minimumSchemaParseRate) {
    issues.push({
      kind: 'schemaParseRate',
      actual: metrics.schemaParseRate,
      minimum: metrics.minimumSchemaParseRate,
      malformedRows: findMalformedRows(rows, parsedRows),
    });
  }

  const violations = parsedRows.flatMap((row) => findValueRangeViolations(row.index, row.value));

  if (violations.length > 0) {
    issues.push({
      kind: 'valueRange',
      rows: [...new Set(violations.map((v) => v.index))],
      violations,
    });
  }

  return issues;
}

function findMalformedRows(
  rows: readonly unknown[],
  parsedRows: readonly ParsedScraperRow[],
): readonly number[] {
  const validIndexes = new Set(parsedRows.map((row) => row.index));
  return rows.flatMap((_, index) => (validIndexes.has(index) ? [] : [index]));
}

const VALUE_RANGE_FIELDS = [
  { field: 'currentPrice', range: NAVER_FINANCE_THEME_GATE_DEFAULTS.currentPriceRange },
  { field: 'priceChangePct', range: NAVER_FINANCE_THEME_GATE_DEFAULTS.priceChangePctRange },
  { field: 'volume', range: NAVER_FINANCE_THEME_GATE_DEFAULTS.volumeRange },
] as const;

function findValueRangeViolations(index: number, row: NaverFinanceThemeStock): ValueRangeViolation[] {
  return VALUE_RANGE_FIELDS.flatMap(({ field, range }) =>
    isWithinRange(row[field], range)
      ? []
      : [{ index, symbol: row.symbol, field, value: row[field], min: range.min, max: range.max }],
  );
}

function isWithinRange(value: number, range: { readonly min: number; readonly max: number }): boolean {
  return value >= range.min && value <= range.max;
}
