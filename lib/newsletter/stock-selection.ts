import type { StockSelection } from '@/lib/llm/_types/stock-data';

export const STOCK_SELECTION_TARGET = '선정 목표: 추천일 양봉 마감(종가 > 시가)과 추천일 포함 5거래일 안에 추천일 시가 대비 장중 +10% 도달';
export const STOCK_REFERENCE_SCORE_NOTE = '기술 참고 점수는 관측 지표의 요약이며 상승 확률이 아닙니다.';

export function isStockSelection(value: unknown): value is StockSelection {
  if (!value || typeof value !== 'object') return false;
  const selection = value as Record<string, unknown>;
  return typeof selection.strategy === 'string'
    && selection.strategy.trim().length > 0
    && typeof selection.rank === 'number'
    && Number.isInteger(selection.rank)
    && selection.rank >= 1 && selection.rank <= 3
    && selection.objective === 'bullishThenTouch10Within5TradingDays';
}

/** 세 종목의 순위가 모두 있을 때만 선정 순서를 사용할 수 있다. */
export function hasCompleteStockSelection(stocks: readonly unknown[]): boolean {
  if (stocks.length !== 3) return false;
  const selections = stocks.map((stock) => (
    stock && typeof stock === 'object' ? (stock as { selection?: unknown }).selection : undefined
  ));
  if (!selections.every(isStockSelection)) return false;
  return new Set(selections.map((selection) => selection.rank)).size === 3
    && selections.every((selection) => selection.strategy === selections[0].strategy);
}

/** 기존 기록은 당시의 기술점수 정렬을 유지한다. 입력 배열은 변경하지 않는다. */
export function sortStocksForDisplay<T extends {
  signals: { overall_score: number };
  selection?: StockSelection;
}>(stocks: readonly T[]): T[] {
  return hasCompleteStockSelection(stocks)
    ? [...stocks].sort((left, right) => left.selection!.rank - right.selection!.rank)
    : [...stocks].sort((left, right) => right.signals.overall_score - left.signals.overall_score);
}
