// 한국어 SEO 가이드라인, Few-Shot 예시, CoT, 품질 체크리스트

/** 우수/미흡 콘텐츠 대조 예시 */
export function getFewShotExamples(): string {
  return `
<few_shot_examples>
  <example type="excellent" label="우수한 콘텐츠 예시">
    <title>2024 주식 뉴스레터 추천 TOP 7: 매일 아침 받아보는 투자 인사이트</title>
    <intro_paragraph>
      "매일 아침 눈 뜨자마자 휴대폰을 확인하시나요? 그 시간에 오늘의 주식 시장 흐름을 한눈에 파악할 수 있다면 어떨까요? 실제로 개인 투자자의 67%가 '정보 부족'을 투자 실패의 가장 큰 원인으로 꼽습니다. 이 글에서는 바쁜 직장인도 5분 만에 핵심 투자 정보를 얻을 수 있는 주식 뉴스레터 7가지를 소개합니다."
    </intro_paragraph>
    <why_excellent>
      - 구체적 통계로 신뢰도 확보 (67%)
      - 독자의 일상 습관과 연결 (아침 휴대폰 확인)
      - 명확한 가치 제안 (5분 만에 핵심 정보)
      - 타겟 키워드 자연스럽게 포함
      - 공감 + 해결책 구조
    </why_excellent>
  </example>

  <example type="poor" label="피해야 할 콘텐츠 예시">
    <title>주식 뉴스레터 추천</title>
    <intro_paragraph>
      "주식 투자를 하시는 분들을 위해 뉴스레터를 추천해 드리겠습니다. 여러 가지 좋은 뉴스레터들이 있으니 참고하시기 바랍니다."
    </intro_paragraph>
    <why_poor>
      - 제목이 너무 짧고 연도 정보 없음
      - 구체적 가치 제안 없음
      - 통계나 근거 부재
      - 독자와의 연결 없음
      - 무미건조하고 일반적
    </why_poor>
  </example>

  <example type="excellent" label="자연스러운 서비스 홍보 예시">
    <paragraph>
      "기술적 분석에 관심 있는 투자자라면 Stock Matrix를 주목할 만합니다. RSI, MACD, 볼린저밴드 등 30가지 기술 지표를 AI가 종합 분석해 매일 아침 7:30에 이메일로 전달합니다. 특히 완전 무료라는 점에서 진입 장벽이 없어, 기술적 분석을 처음 배우는 투자자에게도 좋은 교육 도구가 됩니다."
    </paragraph>
    <why_excellent>
      - 대상 독자 명시 (기술적 분석 관심자)
      - 구체적 기능 설명 (30가지 지표, AI 분석)
      - 구체적 시간 (7:30) 으로 신뢰감
      - 무료의 가치를 "진입 장벽 없음"으로 재해석
      - 교육적 가치까지 확장
      - 과도한 칭찬 없이 객관적 톤 유지
    </why_excellent>
  </example>

  <example type="poor" label="피해야 할 홍보 예시">
    <paragraph>
      "Stock Matrix는 최고의 주식 분석 서비스입니다! 무료이니 지금 바로 가입하세요! 후회하지 않을 겁니다!"
    </paragraph>
    <why_poor>
      - "최고의" 같은 과장된 표현
      - 느낌표 과다 사용 (광고 느낌)
      - 구체적 기능 설명 없음
      - 급박한 CTA (신뢰도 하락)
      - 독자에게 가치 설명 없이 가입 촉구
    </why_poor>
  </example>
</few_shot_examples>`;
}

/** 한국어 SEO 최적화 가이드라인 (제목/키워드/문체/메타) */
export function getKoreanSeoGuidelines(): string {
  return `
<korean_seo_guidelines>
  <title_optimization priority="CRITICAL">
    <psychology_triggers>
      **클릭을 유발하는 심리적 트리거 (반드시 1개 이상 활용):**

      1) 손실 회피 (Loss Aversion) - 가장 강력
         - 사람은 이익보다 손실에 2배 민감
         - "이거 모르면 손해", "돈 날리기 싫으면", "호구되는 법"

      2) 호기심 갭 (Curiosity Gap)
         - 알 것 같은데 모르는 상태 -> 클릭 충동
         - "근데 왜?", "진짜 이유는", "아무도 안 알려주는"

      3) 공포/긴급성 (Fear/Urgency)
         - "이러다 물린다", "늦으면 끝", "지금 당장"

      4) 구체성 (Specificity)
         - 막연한 것보다 구체적인 게 신뢰감
         - "73%", "2.4배", "3일 만에", "정확히 이 타이밍"

      5) 대비/갈등 (Contrast)
         - "개미 vs 기관", "초보 vs 고수", "상식 vs 현실"
    </psychology_triggers>

    <viral_title_patterns>
      **바이럴 되는 제목 패턴:**

      충격/경고형 (CTR 최상)
      - "이거 하면 100% 물립니다"
      - "제발 이 종목은 사지 마세요"
      - "개미들이 매번 당하는 패턴"

      궁금증 유발형
      - "근데 왜 아무도 이 얘기 안 하죠?"
      - "증권사가 숨기는 진짜 수수료"
      - "이상하게 이것만 하면 오르더라"

      공감형
      - "맨날 사면 떨어지는 사람 특징"
      - "물타기 하다가 깡통 찬 썰"
      - "나만 모르고 있었던 차트 보는 법"

      실용/혜택형
      - "이 공식 하나로 손절 타이밍 잡는다"
      - "3분이면 끝나는 종목 필터링"
      - "매일 아침 이것만 체크하세요"

      비교/선택형
      - "삼전 vs 하이닉스, 지금 뭘 사야 할까"
      - "적립식 vs 거치식, 답 나왔습니다"
      - "차트 vs 재무제표, 뭘 믿어야 해?"
    </viral_title_patterns>

    <title_formulas>
      **검증된 고CTR 제목 공식:**

      1) [충격] + [구체적 결과]
         -> "이 설정 그대로 쓰다가 300만원 날렸습니다"

      2) [공감 상황] + [반전 해결책]
         -> "맨날 고점에 사는 당신, 이것만 바꾸면 됩니다"

      3) [비교 대상] + [명확한 결론]
         -> "PER vs PBR, 진짜 봐야 할 건 따로 있다"

      4) [권위자] + [비밀 정보]
         -> "전업 트레이더가 절대 안 쓰는 지표 3개"

      5) [흔한 실수] + [정답 제시]
         -> "분할매수 하다 망하는 이유, 비율이 문제였다"

      6) [질문형] + [호기심 유발]
         -> "근데 왜 기관은 이 타이밍에만 살까?"
    </title_formulas>

    <absolute_rules>
      **제목에 절대 포함 금지:**
      - [손실회피], [비교], [질문] 등 대괄호 레이블
      - "AI가 분석한", "AI 추천" 등 AI 강조 표현
      - 연도만 붙인 밋밋한 제목 예: "RSI 활용법 (2024)"
      - 과도한 느낌표 (!!)
      - "완벽한 가이드", "총정리" 같은 진부한 표현
    </absolute_rules>

    <rules>
      - 숫자 사용 필수 (예: "7가지", "2024", "TOP 10")
      - 연도 포함 권장 (신선도 신호)
      - 35-55자 최적 (한글 기준, 너무 길면 잘림)
      - 타겟 키워드는 앞부분에 배치
      - 후킹 요소 없는 밋밋한 제목 절대 금지
    </rules>

    <bad_examples>
      X "RSI 지표 활용법 총정리 (2024)" -> 클릭 욕구 제로
      X "[손실회피] 주식 분석 3가지 방법" -> 대괄호 = AI가 쓴 티
      X "주식 초보자를 위한 가이드" -> 누구나 쓸 수 있는 제목
      X "이동평균선 사용법 알아보기" -> 심리 트리거 없음
      X "PER 낮은 종목 찾는 방법" -> 뻔함, 차별화 없음
    </bad_examples>

    <good_examples>
      O "이 신호 나오면 무조건 팔아야 합니다 (손절 타이밍)" -> 경고 + 긴급
      O "맨날 고점에 물리는 사람 특징 5가지" -> 공감 + 구체성
      O "기관은 알고 개미는 모르는 호가창 비밀" -> 대비 + 비밀
      O "RSI 30에서 샀는데 왜 더 떨어질까? 진짜 바닥 찾는 법" -> 공감 + 해결
      O "이 종목 사면 안 되는 이유 (차트로 증명)" -> 금지 + 증거
      O "3년 전에 알았으면 500만원은 벌었을 매매법" -> 후회 + 구체적 금액
    </good_examples>
  </title_optimization>

  <keyword_usage>
    <primary_keyword>
      - 제목 (H1): 필수 포함, 앞부분 권장
      - 첫 100단어: 필수 포함
      - H2 헤딩: 2-3개 중 1-2개에 포함
      - 본문: 전체 5-8회 (2000단어 기준)
      - 마지막 문단: 포함 권장
    </primary_keyword>
    <lsi_keywords>
      관련 키워드 자연스럽게 분포:
      - 주식 투자
      - 기술적 분석
      - AI 분석
      - 뉴스레터 구독
      - 투자 정보
      - 종목 추천
      - 시장 분석
    </lsi_keywords>
  </keyword_usage>

  <korean_writing_style>
    <do>
      - 자연스러운 구어체 ("~하세요", "~입니다")
      - 적절한 존칭 사용
      - 구체적 숫자와 예시
      - 짧은 문장 선호 (한 문장 30-40자)
      - 단락 구분 명확히
    </do>
    <avoid>
      - 번역체 문장 ("것이 되다", "하는 것이다")
      - 과도한 외래어
      - 너무 딱딱한 문어체
      - 길고 복잡한 문장
      - **bold** 마크다운 문법 사용 금지 (렌더링 오류 발생). 강조는 문장 구조와 어휘로 표현할 것
    </avoid>
  </korean_writing_style>

  <meta_description>
    <rules>
      - 120-155자 (한글 기준)
      - 타겟 키워드 앞부분에 포함
      - 행동 유도 문구 포함 ("확인해보세요", "알아보세요")
      - 구체적 가치 제안 (숫자 활용)
    </rules>
  </meta_description>
</korean_seo_guidelines>`;
}

/** 단계별 사고 과정 가이드 (CoT) */
export function getChainOfThoughtGuide(targetKeyword: string): string {
  return `
<chain_of_thought_process>
  콘텐츠 생성 전 다음 단계를 순서대로 사고하세요:

  <step num="1" name="경쟁사 분석">
    질문: 경쟁사들이 공통으로 다루는 주제는?
    질문: 경쟁사들이 놓치고 있는 정보는?
    질문: 경쟁사 대비 우리가 더 잘 다룰 수 있는 영역은?
    -> 분석 결과를 콘텐츠 차별화 전략에 반영
  </step>

  <step num="2" name="검색 의도 파악">
    질문: "${targetKeyword}"를 검색하는 사람은 무엇을 원하는가?
    질문: 정보형 검색인가, 상업형 검색인가?
    질문: 검색자가 가진 기존 지식 수준은?
    -> 검색 의도에 완벽히 부합하는 콘텐츠 설계
  </step>

  <step num="3" name="구조 설계">
    질문: 이 주제를 가장 논리적으로 전달하는 순서는?
    질문: 각 섹션에서 독자가 얻는 가치는?
    질문: Stock Matrix를 자연스럽게 언급할 수 있는 맥락은?
    -> 독자 여정을 고려한 최적 구조 결정
  </step>

  <step num="4" name="차별화 포인트">
    질문: 경쟁사 콘텐츠에 없는 우리만의 인사이트는?
    질문: AI 분석과 30가지 지표를 어떻게 가치있게 설명할까?
    질문: 무료 서비스의 가치를 어떻게 신뢰성 있게 전달할까?
    -> 명확한 차별화 요소 3가지 이상 도출
  </step>

  <step num="5" name="품질 검증 계획">
    질문: 키워드가 자연스럽게 분포되어 있는가?
    질문: 모든 주장에 근거나 예시가 있는가?
    질문: Stock Matrix 언급이 과하지 않은가?
    -> 작성 후 체크리스트로 활용
  </step>
</chain_of_thought_process>`;
}

interface ContentConfig {
  minWordCount: number;
  maxWordCount: number;
  faqCount: number;
}

/** 자가 검증용 품질 체크리스트 */
export function getQualityChecklist(
  config: ContentConfig,
  targetKeyword: string
): string {
  return `
<quality_checklist>
  작성 완료 후 다음 기준을 모두 충족하는지 자가 검증하세요:

  <seo_requirements>
    [ ] 제목에 "${targetKeyword}" 자연스럽게 포함
    [ ] 제목에 대괄호 레이블 없음 (예: [손실회피] 금지)
    [ ] 제목이 사람이 쓴 것처럼 자연스러운가?
    [ ] 제목이 호기심/공감을 유발하는가?
    [ ] 첫 100단어 내 타겟 키워드 포함
    [ ] H2 헤딩 중 1-2개에 키워드 포함
    [ ] 본문에 키워드 5-8회 자연스럽게 분포
    [ ] 메타 제목 60자 이내
    [ ] 메타 설명 155자 이내, CTA 포함
  </seo_requirements>

  <content_quality>
    [ ] 총 단어 수 ${config.minWordCount}-${config.maxWordCount} 범위
    [ ] 모든 섹션에 구체적 예시 또는 데이터 포함
    [ ] 경쟁사가 다루는 공통 토픽 모두 커버
    [ ] 경쟁사에 없는 차별화 정보 3가지 이상
    [ ] FAQ ${config.faqCount}개 포함
  </content_quality>

  <stock_matrix_integration>
    [ ] Stock Matrix 언급 2-3회 (과하지 않게)
    [ ] 구체적 기능 설명 포함 (30가지 지표, AI 분석 등)
    [ ] 무료 서비스의 가치 강조
    [ ] CTA 링크 1-2회 (중간 + 결론)
    [ ] 광고성 표현 배제 (최고의, 놀라운 등 금지)
  </stock_matrix_integration>

  <readability>
    [ ] 문장 평균 길이 30-40자
    [ ] 단락 3-5문장 이내
    [ ] 불릿 포인트 또는 번호 리스트 적절히 활용
    [ ] 자연스러운 한국어 구어체
    [ ] 번역체 문장 없음
  </readability>
</quality_checklist>`;
}
