import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'

/**
 * 테스트용 KIS FHPTJ04160001 output2 행(최신일 먼저, 30거래일). 종목·거래일마다 결정적으로 달라
 * 수급 15개 입력이 모델 분기에 실제로 들어가게 한다. 금액은 백만원, 거래대금은 원 단위다.
 */
export function syntheticInvestorFlowRows(symbol: string, endKisDate: string): Record<string, string>[] {
  const end = `${endKisDate.slice(0, 4)}-${endKisDate.slice(4, 6)}-${endKisDate.slice(6)}`
  const seed = Number(symbol.replace(/\D/g, '')) % 97
  return Array.from({ length: 30 }, (_value, back) => {
    const date = addKoreanTradingDays(end, -back)
    const wave = ((seed * 7 + back * 13) % 41) - 20
    return {
      stck_bsop_date: date.replaceAll('-', ''),
      acml_tr_pbmn: String(4_000_000_000 + seed * 10_000_000 + back * 1_000_000),
      frgn_ntby_tr_pbmn: String(wave * 9),
      orgn_ntby_tr_pbmn: String(((seed + back * 5) % 23 - 11) * 6),
      prsn_ntby_tr_pbmn: String(-wave * 9 - ((seed + back * 5) % 23 - 11) * 6),
      ivtr_ntby_tr_pbmn: String((seed + back) % 7 - 3),
      fund_ntby_tr_pbmn: String((seed * 3 + back) % 5 - 2),
      pe_fund_ntby_tr_pbmn: String((seed + back * 2) % 3 - 1),
    }
  })
}
