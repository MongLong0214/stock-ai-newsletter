
export const TECHNICAL_INDICATORS_DATA = [
  {
    title: "가격/모멘텀",
    items: [
      "이동평균선 (SMA/EMA/WMA)",
      "골든크로스/데드크로스",
      "RSI, Stochastic, Williams %R",
      "MACD, ROC, VWAP",
      "캔들 패턴 분석"
    ],
    gradient: "from-emerald-500/10 via-emerald-500/5 to-transparent",
  },
  {
    title: "거래량",
    items: [
      "거래량 vs 평균거래량",
      "연속 거래량 증가",
      "OBV 추세",
      "CMF (자금흐름)",
      "MFI (자금유입강도)"
    ],
    gradient: "from-emerald-500/10 via-emerald-500/5 to-transparent",
  },
  {
    title: "변동성",
    items: [
      "ATR (평균진폭)",
      "볼린저밴드 위치",
      "밴드폭 변화",
      "역사적 변동성 (HV)",
      "가격 변동 범위"
    ],
    gradient: "from-emerald-500/10 via-teal-500/5 to-transparent",
  },
  {
    title: "추세",
    items: [
      "ADX, DI+, DI-",
      "Parabolic SAR",
      "일목균형표",
      "SuperTrend",
      "추세선 분석"
    ],
    gradient: "from-teal-500/10 via-cyan-500/5 to-transparent",
  },
  {
    title: "시장 심리",
    items: [
      "A/D Line (수급)",
      "Chaikin Oscillator",
      "체결강도",
      "매수/매도 압력",
      "투자심리 지수"
    ],
    gradient: "from-cyan-500/10 via-sky-500/5 to-transparent",
  },
  {
    title: "종합 분석",
    items: [
      "정배열/역배열 여부",
      "지지/저항선 확인",
      "신호 강도 계산",
      "리스크/리워드 비율",
      "종합 점수 산출"
    ],
    gradient: "from-sky-500/10 via-blue-500/5 to-transparent",
  },
] as const;