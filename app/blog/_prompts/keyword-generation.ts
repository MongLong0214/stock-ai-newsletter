/**
 * 키워드 생성 프롬프트 (간소화 버전)
 *
 * 핵심: 강력한 후킹 + 주제 다양성 + 중복 방지
 */

import type {
  KeywordMetadata,
  SearchIntent,
  KeywordDifficulty,
  ContentType,
  TopicArea,
} from '../_types/blog';

interface TopicAreaStats {
  distribution: Record<TopicArea, number>;
  total: number;
  underrepresented: TopicArea[];
  overrepresented: TopicArea[];
}

interface CompetitorKeyword {
  keyword: string;
  count: number;
  sources: string[];
}

// ============================================================================
// 후킹 트리거 패턴 (강력한 클릭 유도)
// ============================================================================

const HOOK_TRIGGERS = `
## 🔥 후킹 트리거 (필수 2개 이상 조합 - 클릭률 3배)

### 1순위: 손실/공포 회피형 (가장 강력 - 반드시 1개 이상)
"실패하는", "손실 보는", "함정", "실수", "망하는", "피해야 할", "위험한",
"모르면 손해", "놓치면 후회", "절대 하면 안 되는", "99%가 모르는"

### 2순위: 충격/호기심 유발형
"진짜", "충격", "반전", "알고보니", "사실은", "비밀", "숨겨진",
"아무도 안 알려주는", "전문가만 아는", "초보는 모르는"

### 3순위: 구체적 숫자형 (필수)
"3가지", "5단계", "7초", "10분", "90%", "100만원", "TOP 5",
"단 3개", "딱 5분", "1분 만에", "3초 체크"

### 4순위: 질문/딜레마형
"vs", "뭐가 정답?", "언제 사야?", "얼마에 팔아야?", "어떤 게 맞을까",
"정말 맞나?", "효과 있을까?", "왜 안 될까?"

### 5순위: 타이밍/조건형
"이때 사면", "이 조건이면", "이 신호 나오면", "타이밍 잡는",
"매수 시점", "진입 기준", "손절 시점"

### 🔥 필수 후킹 조합 공식 (클릭률 5배)
- [손실회피 + 숫자] = 최강: "99%가 손실 보는 RSI 함정 3가지"
- [충격 + 손실회피] = 초강력: "알고보니 독이었던 분할매수 실수 5가지"
- [질문 + 숫자] = 강력: "RSI 30 vs 40 매수 뭐가 정답일까?"
- [희소성 + 손실회피] = 강력: "전문가만 아는 손절 안 하면 망하는 패턴"
- [타이밍 + 숫자] = 강력: "매수 타이밍 잡는 3초 체크리스트"
`;

// ============================================================================
// 주제 영역 정의 (간소화)
// ============================================================================

const TOPIC_AREAS = `
## 주제 영역 (topicArea) - 8개 영역에서 골고루 생성 필수

### 🔧 technical (기술적 분석) - 구체적 주제 예시
- 지표별: RSI/MACD/스토캐스틱/볼린저밴드/이동평균/OBV/ADX/ATR/윌리엄스%R
- 패턴별: 캔들패턴/헤드앤숄더/삼중천정/쌍바닥/깃발형/삼각수렴/갭상승/갭하락
- 분석법: 다이버전스/골든크로스/데드크로스/과매수과매도/추세선/지지저항/피보나치

### 💰 value (가치투자) - 구체적 주제 예시
- 지표별: PER/PBR/PSR/EV-EBITDA/ROE/ROA/영업이익률/부채비율/유동비율
- 전략별: 저평가주/고배당주/배당성장주/자사주매입/실적개선주/턴어라운드
- 분석법: 재무제표분석/현금흐름분석/배당분석/밸류에이션/적정가치산출

### 📊 strategy (투자 전략) - 구체적 주제 예시
- 매매법: 분할매수/분할매도/물타기/불타기/피라미딩/평단가관리
- 리스크: 손절/익절/손익비/포지션사이징/자금관리/리밸런싱
- 운영: 매매일지/체크리스트/규칙기반매매/백테스트/시뮬레이션

### 🌍 market (시장 분석) - 구체적 주제 예시
- 거시경제: 금리/환율/유가/물가/CPI/GDP/경기사이클/FOMC/연준
- 수급분석: 외국인/기관/개인/프로그램매매/공매도/대차잔고/수급분석
- 섹터별: 반도체/2차전지/바이오/AI/자동차/금융/에너지/소비재

### 🔍 discovery (종목 발굴) - 구체적 주제 예시
- 스크리닝: 조건검색/필터링/퀀트/스크리너/종목발굴
- 테마별: AI관련주/2차전지관련주/반도체관련주/방산주/원전관련주/바이오주
- ETF: 국내ETF/해외ETF/레버리지/인버스/섹터ETF/배당ETF

### 🧠 psychology (투자 심리) - 구체적 주제 예시
- 심리편향: 뇌동매매/FOMO/손실회피/확증편향/과신/복수매매/감정매매
- 극복법: 멘탈관리/감정통제/규칙준수/손실복구/연속손실대처
- 습관: 매매일지/사후복기/실수패턴/자기점검/루틴

### 📚 education (투자 교육) - 구체적 주제 예시
- 입문: 계좌개설/주문방법/주식용어/시장구조/거래시간/주식기초
- 제도: 배당세금/양도세/ISA/연금계좌/공매도제도/증거금/미수거래
- 도구: 증권사비교/MTS-HTS/조건검색/알림설정/차트설정

### ⚡ execution (실전 투자) - 구체적 주제 예시
- 매매기법: 단타/스윙/중장기/추세추종/역추세/눌림목/돌파매매
- 체결실전: 호가창/체결강도/거래량/분봉분석/틱차트/주문유형
- 타이밍: 진입시점/청산시점/추가매수/손절실행/익절실행

⚠️ **필수 규칙**:
- 각 영역에서 다양한 하위 주제로 키워드 생성
- 동일 하위 주제 반복 금지 (예: RSI만 3개 X)
- ${count}개 중 최소 5개 영역에서 분산 생성
`;

// ============================================================================
// 우수 예시 (간소화 - 4개만)
// ============================================================================

const FEW_SHOT_EXAMPLES = `
## 우수 키워드 예시

1. "초보 투자자 90%가 놓치는 저PER주 함정 3가지"
   → 후킹: [손실회피+숫자] | topicArea: value | type: listicle

2. "분할매수 3번 vs 5번 몇 번이 정답일까"
   → 후킹: [질문형+비교+숫자] | topicArea: strategy | type: comparison

3. "RSI 30 매수 신호 진짜 맞을까 5년 백테스트 결과"
   → 후킹: [질문형+숫자] | topicArea: technical | type: review

4. "호가창 허매수 허매도 구별법 속지 않는 5초 체크"
   → 후킹: [손실회피+해결형+숫자] | topicArea: execution | type: guide
`;

// ============================================================================
// 메인 프롬프트 빌더
// ============================================================================

export function buildKeywordGenerationPrompt(
  count: number,
  usedKeywords: string[],
  competitorKeywords?: CompetitorKeyword[],
  topicStats?: TopicAreaStats
): string {
  const excludedList = usedKeywords.slice(-100).join(', ') || '없음';

  // 주제 분포 현황
  const topicSection = topicStats
    ? `
## 현재 주제 분포 (총 ${topicStats.total}개 글)
${Object.entries(topicStats.distribution)
  .map(([topic, count]) => {
    const status = topicStats.underrepresented.includes(topic as TopicArea)
      ? '🔴 부족'
      : topicStats.overrepresented.includes(topic as TopicArea)
        ? '🟡 과다'
        : '🟢 적정';
    return `- ${topic}: ${count}개 ${status}`;
  })
  .join('\n')}

⚠️ 부족한 주제 우선 생성: ${topicStats.underrepresented.join(', ') || '없음'}
`
    : '';

  // 경쟁사 키워드
  const competitorSection =
    competitorKeywords && competitorKeywords.length > 0
      ? `
## 경쟁사 키워드 참고 (더 구체적으로 변형)
${competitorKeywords.slice(0, 10).map((k) => `- "${k.keyword}"`).join('\n')}
`
      : '';

  return `당신은 한국 주식 투자 SEO 전문가입니다.

# 미션
Stock Matrix 블로그용 고품질 SEO 키워드 ${count}개 생성

# 서비스 정보
- 이름: Stock Matrix (스톡 매트릭스)
- 특징: AI 기반 기술적 분석, 30가지 지표, 무료 뉴스레터

${HOOK_TRIGGERS}

${TOPIC_AREAS}
${topicSection}

${FEW_SHOT_EXAMPLES}

# 필수 규칙
1. 후킹 트리거 2개 이상 조합 필수
2. topicArea 최소 4개 이상 분산
3. 롱테일 키워드 (3단어 이상) 70% 이상
4. 한국어 자연스러운 구어체

# 제외 키워드 (이미 사용됨)
${excludedList}

${competitorSection}

# 출력 형식 (JSON만 출력)
\`\`\`json
[
  {
    "keyword": "강력한 후킹이 포함된 키워드",
    "searchIntent": "informational|commercial|transactional|navigational",
    "difficulty": "low|medium|high",
    "estimatedSearchVolume": 500-1500,
    "relevanceScore": 7.5-10.0,
    "contentType": "comparison|guide|listicle|review",
    "topicArea": "technical|value|strategy|market|discovery|psychology|education|execution",
    "reasoning": "후킹 트리거와 주제 선택 이유 (30자 이상)"
  }
]
\`\`\`

JSON 배열만 출력하세요.`;
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

/** 키워드 메타데이터 검증 */
export function validateKeywordMetadata(keywords: KeywordMetadata[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const validIntents: SearchIntent[] = ['informational', 'commercial', 'transactional', 'navigational'];
  const validDifficulties: KeywordDifficulty[] = ['low', 'medium', 'high'];
  const validContentTypes: ContentType[] = ['comparison', 'guide', 'listicle', 'review'];
  const validTopicAreas: TopicArea[] = ['technical', 'value', 'strategy', 'market', 'discovery', 'psychology', 'education', 'execution'];

  keywords.forEach((kw, i) => {
    if (!kw.keyword || kw.keyword.split(/\s+/).length < 2) {
      errors.push(`[${i + 1}] 키워드가 너무 짧음`);
    }
    if (!validIntents.includes(kw.searchIntent)) {
      errors.push(`[${i + 1}] 잘못된 searchIntent`);
    }
    if (!validDifficulties.includes(kw.difficulty)) {
      errors.push(`[${i + 1}] 잘못된 difficulty`);
    }
    if (!validContentTypes.includes(kw.contentType)) {
      errors.push(`[${i + 1}] 잘못된 contentType`);
    }
    if (kw.topicArea && !validTopicAreas.includes(kw.topicArea)) {
      errors.push(`[${i + 1}] 잘못된 topicArea`);
    }
    if (kw.estimatedSearchVolume < 100 || kw.estimatedSearchVolume > 5000) {
      errors.push(`[${i + 1}] 검색량 범위 초과`);
    }
  });

  return { isValid: errors.length === 0, errors };
}

/** SEO 점수 계산 */
export function calculateSEOScore(kw: KeywordMetadata): number {
  const intentWeight = { informational: 1.2, commercial: 1.1, transactional: 0.9, navigational: 0.7 };
  const difficultyWeight = { low: 1.3, medium: 1.0, high: 0.7 };

  let volumeWeight = 1.0;
  if (kw.estimatedSearchVolume >= 500 && kw.estimatedSearchVolume <= 1500) volumeWeight = 1.2;
  else if (kw.estimatedSearchVolume < 100) volumeWeight = 0.6;

  const base = kw.relevanceScore * 5; // 0-50
  return Math.min(100, Math.round(
    base * intentWeight[kw.searchIntent] * difficultyWeight[kw.difficulty] * volumeWeight
  ));
}

export default buildKeywordGenerationPrompt;
