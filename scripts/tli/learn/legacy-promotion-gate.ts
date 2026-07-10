export interface PromotionGateInput {
  readonly nEff: number
  readonly cycleExtendedWeeks: number
  readonly promotionsThisYear: number
  readonly brierChampion: number
  readonly deltaBrierPoint: number
  readonly deltaBrierUpper99: number
  readonly ecePoint: number
  readonly eceUpper95: number
  readonly pAt10Challenger: number
  readonly pAt10Champion: number
  readonly clusterBalance: {
    readonly topFivePercentLabelShare: number
    readonly wildClusterBootstrapUsed: boolean
  }
}
