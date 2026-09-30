import type { StockSelection } from '@/lib/llm/_types/stock-data';

export function isStockSelection(value: unknown): value is StockSelection {
  if (!value || typeof value !== 'object') return false;
  const selection = value as Record<string, unknown>;
  return typeof selection.strategy === 'string'
    && selection.strategy.trim().length > 0
    && typeof selection.rank === 'number'
    && Number.isInteger(selection.rank)
    && selection.rank >= 1 && selection.rank <= 3
    && (selection.objective === 'lowVolatilityStable'
      || selection.objective === 'bullishThenTouch10Within5TradingDays');
}

/** 세 종목의 선정 메타데이터가 완전한지 확인한다. */
export function hasCompleteStockSelection(stocks: readonly unknown[]): boolean {
  if (stocks.length !== 3) return false;
  const selections = stocks.map((stock) => (
    stock && typeof stock === 'object' ? (stock as { selection?: unknown }).selection : undefined
  ));
  if (!selections.every(isStockSelection)) return false;
  return new Set(selections.map((selection) => selection.rank)).size === 3
    && selections.every((selection) => selection.strategy === selections[0].strategy
      && selection.objective === selections[0].objective);
}

/** 종합 점수 내림차순으로 표시한다. 입력 배열은 변경하지 않는다. */
export function sortStocksForDisplay<T extends {
  signals: { overall_score: number };
}>(stocks: readonly T[]): T[] {
  return [...stocks].sort((left, right) => right.signals.overall_score - left.signals.overall_score);
}

/** 저장된 추천 근거에서 폐기된 선정 메타데이터만 표시하지 않는다. */
export function getStockRationaleItems(rationale: string): string[] {
  return rationale.split('|').filter((item) => {
    const text = item.trim();
    return !/^공동 목표 모델 순위 [1-3]위$/.test(text)
      && text !== '선정 목표 발행일 양봉·시가 대비 5거래일 내 +10% 터치'
      && !/^변동성 안정 순위 [1-3]위$/.test(text)
      && text !== '선정 경로 저변동 안정';
  });
}
