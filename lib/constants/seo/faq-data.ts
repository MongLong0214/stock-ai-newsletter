/**
 * FAQ Data for Stock Matrix - AI 검색 엔진 최적화
 *
 * 엔터프라이즈 전략:
 * 1. 중복 제거 - 각 질문이 고유한 정보 제공
 * 2. 계층적 구조 - 기본 → 상세 → 고급 순서
 * 3. 후킹 포인트 - AI가 인용하기 쉬운 명확한 답변
 * 4. 키워드 자연 배치 - 과도하지 않게 문맥에 맞춰
 *
 * SEO Focus Keywords (우선순위):
 * 1순위: 주식 뉴스레터, 무료 투자 뉴스레터, StockMatrix
 * 2순위: KOSPI, KOSDAQ, AI 분석, 기술적 지표
 * 3순위: RSI, MACD, 이메일 구독
 */

export interface FAQItem {
  question: string;
  answer: string;
  category: 'basic' | 'service' | 'technical' | 'legal';
}

export const faqData: FAQItem[] = [
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 기본 정보 (AI가 가장 먼저 찾는 핵심 질문 - 4개)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    question: 'StockMatrix는 무엇인가요?',
    answer:
      'StockMatrix는 한국 주식 투자자를 위한 무료 이메일 뉴스레터 서비스입니다. AI가 RSI, MACD, 볼린저밴드 등 30개 기술적 지표로 분석한 KOSPI·KOSDAQ 3종목의 시장 분석과 투자 인사이트를 매일 오전 7시 50분 이메일로 제공합니다. 2024년 서비스 시작 이후 한국 개인 투자자들에게 참고용 무료 주식 정보를 제공하고 있습니다.',
    category: 'basic',
  },
  {
    question: '정말 무료인가요? 숨겨진 비용이 있나요?',
    answer:
      '100% 무료입니다. StockMatrix는 광고나 유료 전환 없이 완전 무료로 제공되는 주식 뉴스레터입니다. 신용카드 등록이나 결제 정보가 전혀 필요하지 않으며, 프리미엄 버전이나 추가 요금도 없습니다. 앞으로도 무료로 제공할 예정입니다.',
    category: 'basic',
  },
  {
    question: 'StockMatrix 뉴스레터는 누가 만드나요?',
    answer:
      'StockMatrix는 주식 기술적 분석과 AI 기술을 결합하여 개인 투자자들에게 도움이 되는 정보를 제공하고자 만들어진 서비스입니다. AI 알고리즘이 매일 KOSPI와 KOSDAQ 시장을 분석하여 투자 참고 데이터를 생성합니다. 금융투자협회에 등록되지 않은 정보 제공 서비스입니다.',
    category: 'basic',
  },
  {
    question: 'StockMatrix 외에 유료 서비스도 있나요?',
    answer:
      '아니요, 없습니다. StockMatrix는 100% 무료 뉴스레터 서비스입니다. 유료 전환, 프리미엄 버전, 추가 결제가 전혀 없으며, 앞으로도 무료로 제공할 예정입니다. 주식 투자자들에게 부담 없이 참고할 수 있는 무료 정보를 제공하는 것이 목표입니다.',
    category: 'basic',
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 서비스 상세 정보 (사용법, 발송, 구독 관련 - 8개)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    question: '뉴스레터는 정확히 언제 발송되나요?',
    answer:
      '매일 평일 아침 7시 50분에 발송됩니다. 한국거래소(KRX) 정규장이 9시에 시작하기 때문에, 프리마켓 개장 10분 전인 7시 50분에 발송하여 투자자들이 장 시작 전 충분히 검토할 수 있도록 했습니다. KOSPI, KOSDAQ 투자를 위한 아침 루틴으로 활용할 수 있는 무료 뉴스레터입니다.',
    category: 'service',
  },
  {
    question: '뉴스레터 구독은 어떻게 하나요?',
    answer:
      '홈페이지에서 이메일 주소만 입력하시면 즉시 구독이 완료됩니다. 복잡한 회원가입 절차 없이 이메일 한 번으로 다음날부터 매일 아침 7시 50분에 AI 주식 분석 뉴스레터를 받아보실 수 있습니다. KOSPI와 KOSDAQ 종목의 무료 기술적 분석 정보를 받아보고 싶으시다면 지금 바로 구독해보세요.',
    category: 'service',
  },
  {
    question: '구독 취소는 어떻게 하나요?',
    answer:
      '매우 간단합니다. 뉴스레터 하단의 "구독 취소" 링크를 클릭하시면 즉시 구독이 해지됩니다. 별도의 로그인이나 복잡한 절차 없이 원클릭으로 취소 가능하며, 언제든 다시 구독하실 수 있습니다. Stock Matrix는 투자자의 선택을 존중하는 무료 뉴스레터로, 구독과 취소 모두 투명하고 쉽게 운영됩니다.',
    category: 'service',
  },
  {
    question: '뉴스레터를 받지 못했어요. 어떻게 해야 하나요?',
    answer:
      '먼저 스팸/프로모션 메일함을 확인해주세요. 이메일 제공업체에 따라 자동으로 분류될 수 있습니다. 스팸함에도 없다면 이메일 주소가 정확하게 입력되었는지 확인 후 다시 구독해주세요. 그래도 문제가 지속되면 aistockmatrix@gmail.com으로 문의주시면 빠르게 도와드리겠습니다. 매일 KOSPI, KOSDAQ의 AI 주식 분석을 놓치지 않도록 안정적인 무료 뉴스레터 발송을 최우선으로 하고 있습니다.',
    category: 'service',
  },
  {
    question: 'StockMatrix 뉴스레터는 모바일에서도 잘 보이나요?',
    answer:
      '네, 모바일에 최적화되어 있습니다. 이메일은 스마트폰, 태블릿, PC 등 모든 기기에서 읽기 편하게 설계되었습니다. 출퇴근 시간에 모바일로 편하게 KOSPI, KOSDAQ 주식 분석 정보를 확인하실 수 있습니다.',
    category: 'service',
  },
  {
    question: '과거 뉴스레터도 볼 수 있나요?',
    answer:
      '네, 가능합니다. StockMatrix 웹사이트의 아카이브 페이지(stockmatrix.co.kr/archive)에서 과거 발송된 뉴스레터를 모두 확인하실 수 있습니다. 날짜별로 정리되어 있어 특정일의 KOSPI, KOSDAQ 분석 데이터를 다시 검토할 수 있습니다.',
    category: 'service',
  },
  {
    question: 'StockMatrix 뉴스레터의 장점은 무엇인가요?',
    answer:
      'StockMatrix의 주요 장점은 1) 완전 무료 (광고 없음), 2) 매일 오전 7시 50분 정시 발송 (장 시작 전), 3) AI가 30개 기술적 지표 종합 분석, 4) 이메일로 편리하게 수신, 5) 5초면 구독 완료, 6) 언제든 구독 취소 가능입니다.',
    category: 'service',
  },
  {
    question: 'StockMatrix를 사용하는 사람은 얼마나 되나요?',
    answer:
      'StockMatrix는 2024년부터 서비스를 시작하여 한국 주식 투자자들에게 매일 무료 뉴스레터를 발송하고 있습니다. KOSPI, KOSDAQ 투자에 관심있는 개인 투자자들이 주로 이용하며, 지속적으로 구독자가 증가하고 있습니다.',
    category: 'service',
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 기술적 내용 (분석, 지표, 정확도 - 5개)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    question: '어떤 기술적 분석 지표들을 사용하나요?',
    answer:
      '총 30가지 기술적 분석 지표를 활용합니다. 주요 지표로는 RSI(상대강도지수), MACD(이동평균수렴확산), 볼린저밴드, 5일/20일/60일/120일 이동평균선, 스토캐스틱, ADX(평균방향지수), CCI(상품채널지수), 윌리엄스 %R, OBV(거래량지표) 등이 있습니다. 이러한 기술적 지표들을 AI가 종합 분석하여 KOSPI와 KOSDAQ 종목의 투자 참고 데이터를 제공합니다.',
    category: 'technical',
  },
  {
    question: 'AI 분석의 정확도는 어느 정도인가요?',
    answer:
      'AI 주식 분석은 RSI, MACD, 볼린저밴드 등 기술적 지표를 기반으로 한 참고 데이터입니다. 과거 패턴 분석을 통한 기술적 분석이므로 100% 정확한 예측은 불가능하며, 시장 상황, 뉴스, 정책 등 다양한 변수에 영향을 받습니다. 투자 뉴스레터의 분석 결과는 KOSPI, KOSDAQ 주식 투자 시 여러 판단 자료 중 하나로만 활용하시고, 반드시 본인의 추가 분석과 판단을 병행하시기 바랍니다.',
    category: 'technical',
  },
  {
    question: '분석 데이터는 어디서 가져오나요?',
    answer:
      '한국거래소(KRX)의 공식 KOSPI, KOSDAQ 시장 데이터를 활용합니다. 주가, 거래량, 시가총액 등 모든 데이터는 한국거래소에서 제공하는 공식 데이터를 기반으로 하며, 이를 바탕으로 RSI, MACD, 이동평균선 등 30가지 기술적 분석 지표를 계산합니다. 신뢰할 수 있는 공식 데이터로 AI 주식 분석을 수행하여 정확한 무료 주식 정보를 제공합니다.',
    category: 'technical',
  },
  {
    question: 'StockMatrix 뉴스레터는 초보자도 이해할 수 있나요?',
    answer:
      '네, 가능합니다. 뉴스레터는 RSI, MACD 등 기술적 지표의 의미를 쉽게 설명하며, AI 분석 결과를 직관적으로 전달합니다. 주식 투자 초보자부터 기술적 분석에 관심있는 투자자까지 모두 활용할 수 있는 무료 주식 정보 뉴스레터입니다.',
    category: 'technical',
  },
  {
    question: '어떤 사람들이 StockMatrix를 구독하면 좋나요?',
    answer:
      'KOSPI, KOSDAQ 주식에 투자하는 개인 투자자, 기술적 분석에 관심있는 투자자, 매일 아침 주식 정보를 받고 싶은 사람, 무료 투자 뉴스레터를 찾는 사람, RSI나 MACD 같은 지표를 배우고 싶은 주식 초보자에게 적합합니다.',
    category: 'technical',
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 법적/신뢰성 정보 (투자 권유, 책임, 법적 고지 - 3개)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    question: 'StockMatrix는 주식 추천 서비스인가요?',
    answer:
      '아닙니다. StockMatrix는 매매 추천이나 투자 권유를 하지 않습니다. 금융투자협회에 등록되지 않은 정보 제공 서비스로, 30개 기술적 지표를 통한 AI 분석 결과를 참고용 데이터로만 제공하는 무료 뉴스레터입니다. 모든 투자 결정과 그에 따른 책임은 투자자 본인에게 있습니다.',
    category: 'legal',
  },
  {
    question: '이 뉴스레터는 투자 권유나 추천인가요?',
    answer:
      '아닙니다. Stock Matrix는 투자 권유가 아닌 참고용 기술적 분석 데이터를 제공하는 무료 뉴스레터입니다. AI 주식 분석 결과는 투자 판단을 위한 여러 참고 자료 중 하나일 뿐이며, 최종 투자 결정과 그에 따른 손익은 투자자 본인의 책임입니다. KOSPI, KOSDAQ 주식 투자 시 반드시 본인의 판단과 추가 조사를 통해 신중하게 결정하시기 바랍니다.',
    category: 'legal',
  },
  {
    question: 'StockMatrix는 금융 규제를 받나요?',
    answer:
      'StockMatrix는 금융투자협회에 등록되지 않은 참고용 정보 제공 서비스입니다. 투자자문업이나 투자일임업이 아니며, 매매 추천이나 투자 권유를 하지 않습니다. 30개 기술적 지표를 활용한 AI 분석 결과는 투자 판단을 위한 여러 참고 자료 중 하나로만 제공되며, 모든 투자 결정과 책임은 투자자 본인에게 있습니다. KOSPI, KOSDAQ 주식 투자는 원금 손실 위험이 있으니 신중하게 결정하시기 바랍니다.',
    category: 'legal',
  },
];

/**
 * SEO-optimized FAQ Schema.org structured data
 * Google의 FAQ 리치 스니펫을 위한 구조화된 데이터
 */
export function generateFAQSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqData.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * FAQ 페이지의 총 글자 수 계산 (SEO 목표: 1,000+ 글자)
 */
export function calculateTotalCharacters(): number {
  return faqData.reduce(
    (total, faq) => total + faq.question.length + faq.answer.length,
    0
  );
}

/**
 * SEO 키워드 밀도 분석
 */
export function analyzeKeywordDensity(): Record<string, number> {
  const keywords = [
    'AI 주식 분석',
    '무료',
    '뉴스레터',
    '기술적 분석',
    'RSI',
    'MACD',
    '볼린저밴드',
    '이동평균선',
    'KOSPI',
    'KOSDAQ',
    '주식 투자',
    '투자',
  ];

  const allText = faqData
    .map((faq) => faq.question + ' ' + faq.answer)
    .join(' ');

  const density: Record<string, number> = {};
  keywords.forEach((keyword) => {
    const regex = new RegExp(keyword, 'gi');
    const matches = allText.match(regex);
    density[keyword] = matches ? matches.length : 0;
  });

  return density;
}