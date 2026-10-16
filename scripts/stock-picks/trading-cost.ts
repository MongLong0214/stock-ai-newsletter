const validatePositivePrice = (price: number): void => {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`가격은 양의 유한수여야 합니다: ${price}`)
  }
}

/** 수익률로 복원한 가격의 부동소수점 오차가 호가 구간을 바꾸지 않도록 정규화한다. */
export function reconstructExitPrice(entryPrice: number, grossReturn: number): number {
  const exitPrice = Number((entryPrice * (1 + grossReturn)).toFixed(6))
  validatePositivePrice(exitPrice)
  return exitPrice
}

/** KRX 보통주 통합 호가 단위(2023-01-25 이후, KOSPI·KOSDAQ 공통). */
export function krxTickSize(price: number): number {
  validatePositivePrice(price)
  return price < 2_000 ? 1
    : price < 5_000 ? 5
      : price < 20_000 ? 10
        : price < 50_000 ? 50
          : price < 200_000 ? 100
            : price < 500_000 ? 500 : 1_000
}

/** T+2 결제 연도의 세율을 매도 거래일 경계로 환산한 값(KOSPI 농특세 포함). */
export function sellTaxBps(sellDate: string): number {
  if (typeof sellDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sellDate)
    || sellDate < '0001-01-01') {
    throw new Error(`올바르지 않은 ISO 날짜입니다: ${sellDate}`)
  }
  const parsed = new Date(`${sellDate}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== sellDate) {
    throw new Error(`올바르지 않은 ISO 날짜입니다: ${sellDate}`)
  }
  if (sellDate >= '2025-12-29') return 20
  if (sellDate >= '2024-12-27') return 15
  if (sellDate >= '2023-12-27') return 18
  throw new Error(`지원하지 않는 매도 거래일입니다: ${sellDate}`)
}

export interface RoundTripCost {
  /** 총비용과 각 구성 비용 모두 진입금액 대비 bps다. */
  readonly costBps: number
  readonly sellTaxBps: number
  readonly commissionBps: number
  readonly slippageBps: number
}

export function estimateRoundTripCost({
  entryPrice,
  exitPrice,
  sellDate,
  // WHY: 일반적인 온라인 수수료를 가정한다. 실제 계좌 요율은 미확인이므로 재정의 가능하다.
  commissionBpsPerSide = 1.5,
  slippageTicksPerSide = 0.5,
}: {
  readonly entryPrice: number
  readonly exitPrice: number
  readonly sellDate: string
  readonly commissionBpsPerSide?: number
  readonly slippageTicksPerSide?: number
}): RoundTripCost {
  const entryTick = krxTickSize(entryPrice)
  const exitTick = krxTickSize(exitPrice)
  for (const value of [commissionBpsPerSide, slippageTicksPerSide]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`수수료·슬리피지 가정은 0 이상의 유한수여야 합니다: ${value}`)
    }
  }
  const exitRatio = exitPrice / entryPrice
  const taxBps = sellTaxBps(sellDate)
  const entrySlippageBps = slippageTicksPerSide * entryTick / entryPrice * 10_000
  const exitSlippageBps = slippageTicksPerSide * exitTick / exitPrice * 10_000
  return {
    costBps: (commissionBpsPerSide + entrySlippageBps)
      + (commissionBpsPerSide + taxBps + exitSlippageBps) * exitRatio,
    sellTaxBps: taxBps * exitRatio,
    commissionBps: commissionBpsPerSide * (1 + exitRatio),
    slippageBps: entrySlippageBps + exitSlippageBps * exitRatio,
  }
}
