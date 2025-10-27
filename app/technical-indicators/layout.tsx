import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:
    '기술적 지표 완벽 가이드 | RSI, MACD, 볼린저밴드 활용법 - Stock Matrix',
  description:
    'RSI, MACD, 볼린저밴드 등 30가지 기술적 지표를 AI로 종합 분석하는 방법. 이동평균선 골든크로스, 스토캐스틱 매매 타이밍까지 완벽 정리',
  keywords: [
    '기술적 지표',
    'RSI 지표란',
    'MACD 골든크로스',
    '볼린저밴드 활용',
    '이동평균선',
    '스토캐스틱 지표',
    '기술적 분석',
    '주식 기술적 지표',
    'AI 주식 분석',
    'CCI 지표',
    'OBV 거래량',
    '차트 분석',
  ],
  openGraph: {
    title: '30가지 기술적 지표로 분석하는 AI 주식 투자 전략',
    description:
      'RSI·MACD·볼린저밴드를 포함한 30개 기술적 지표를 AI가 실시간 분석. 골든크로스부터 과매수·과매도 구간까지 자동 포착',
    type: 'article',
    url: 'https://stockmatrix.co.kr/technical-indicators',
  },
};

export default function TechnicalIndicatorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white pt-20">
      {children}
    </div>
  );
}