import { z } from 'zod';

export const NAVER_FINANCE_THEME_GATE_DEFAULTS = {
  minimumCoverage: 0.7,
  minimumSchemaParseRate: 1,
  currentPriceRange: { min: 1, max: 10_000_000 },
  priceChangePctRange: { min: -30, max: 30 },
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
  | { readonly kind: 'valueRange'; readonly rows: readonly number[] };

export class NaverFinanceThemeGateError extends Error {
  readonly name = 'NaverFinanceThemeGateError';

  constructor(
    readonly issues: readonly NaverFinanceThemeGateIssue[],
    readonly metrics: NaverFinanceThemeGateMetrics,
  ) {
    super(`Naver finance theme scraper gate failed: ${issues.map((issue) => issue.kind).join(', ')}`);
  }
}

const NaverFinanceThemeStockSchema = z
  .object({
    themeId: z.string().min(1),
    symbol: z.string().regex(/^\d{6}$/),
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

  const valueRangeRows = parsedRows
    .filter((row) => !hasSaneValues(row.value))
    .map((row) => row.index);

  if (valueRangeRows.length > 0) {
    issues.push({ kind: 'valueRange', rows: valueRangeRows });
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

function hasSaneValues(row: NaverFinanceThemeStock): boolean {
  return (
    isWithinRange(row.currentPrice, NAVER_FINANCE_THEME_GATE_DEFAULTS.currentPriceRange) &&
    isWithinRange(row.priceChangePct, NAVER_FINANCE_THEME_GATE_DEFAULTS.priceChangePctRange) &&
    isWithinRange(row.volume, NAVER_FINANCE_THEME_GATE_DEFAULTS.volumeRange)
  );
}

function isWithinRange(value: number, range: { readonly min: number; readonly max: number }): boolean {
  return value >= range.min && value <= range.max;
}
