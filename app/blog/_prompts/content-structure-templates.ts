// 콘텐츠 타입별 구조 템플릿

/** contentType에 따른 콘텐츠 구조 가이드 XML 반환 */
export function getContentStructureGuide(
  contentType: 'comparison' | 'guide' | 'listicle' | 'review'
): string {
  const structures: Record<typeof contentType, string> = {
    comparison: `
<content_structure type="comparison">
  <section name="hook_intro" word_count="250-350">
    <purpose>독자의 즉각적 관심 유도 및 문제 공감</purpose>
    <elements>
      - 충격적인 통계 또는 공감 가능한 질문으로 시작
      - 잘못된 선택의 결과 (손실, 시간 낭비 등) 언급
      - 이 글을 읽으면 얻게 될 구체적 가치 제시
      - 타겟 키워드 자연스럽게 포함 (첫 100단어 내)
    </elements>
  </section>

  <section name="quick_comparison_table" word_count="테이블">
    <purpose>핵심 차이점 한눈에 파악</purpose>
    <format>Markdown 테이블 필수</format>
    <columns>서비스명 | 가격 | 핵심 기능 | AI 분석 | 추천 대상</columns>
    <note>Stock Matrix의 무료 + AI 분석 조합이 돋보이도록 구성</note>
  </section>

  <section name="detailed_analysis" word_count="각 300-450">
    <purpose>각 서비스의 깊이 있는 분석</purpose>
    <per_item>
      - 서비스 개요 (1-2문장)
      - 핵심 강점 3가지 (구체적 기능 설명)
      - 단점 또는 한계 1-2가지 (신뢰도 확보용)
      - 적합한 사용자 유형
    </per_item>
    <stock_matrix_position>3번째 또는 4번째로 소개 (자연스러움)</stock_matrix_position>
  </section>

  <section name="verdict_cta" word_count="250-350">
    <purpose>명확한 추천 및 행동 유도</purpose>
    <elements>
      - 상황별 추천 (초보자 / 중급자 / 전문가)
      - Stock Matrix가 최적인 구체적 이유
      - 자연스러운 CTA (도메인 링크 포함)
    </elements>
  </section>

  <section name="faq" count="5">
    <purpose>롱테일 키워드 커버 + 검색 의도 충족</purpose>
    <requirements>
      - 실제 검색될 만한 질문 형태
      - 답변은 2-4문장으로 구체적
      - 최소 2개 FAQ에 타겟 키워드 변형 포함
    </requirements>
  </section>
</content_structure>`,
    guide: `
<content_structure type="guide">
  <section name="problem_intro" word_count="250-350">
    <purpose>독자의 문제/니즈에 공감하고 해결 약속</purpose>
    <elements>
      - 구체적 문제 상황 묘사 (독자가 "나도 그래!" 느끼도록)
      - 이 가이드가 제공할 해결책 미리보기
      - 타겟 독자 명시 (초보 투자자, 직장인 등)
      - 타겟 키워드 자연스럽게 포함
    </elements>
  </section>

  <section name="step_by_step" word_count="각 단계 200-300">
    <purpose>실행 가능한 구체적 단계 제공</purpose>
    <format>
      ## Step 1: [동사형 제목]
      - 왜 이 단계가 필요한지
      - 구체적 실행 방법
      - 흔한 실수와 해결법
      - (해당시) Stock Matrix 활용법 언급
    </format>
    <step_count>4-6단계 권장</step_count>
  </section>

  <section name="pro_tips" word_count="300-400">
    <purpose>전문가 수준의 인사이트 제공</purpose>
    <elements>
      - 상급 팁 4-5개 (숫자 또는 불릿 리스트)
      - 흔한 실수 3개와 해결 방법
      - 성공 사례 또는 구체적 수치 예시
    </elements>
  </section>

  <section name="tool_recommendation" word_count="250-350">
    <purpose>가이드 실행을 돕는 도구로 Stock Matrix 소개</purpose>
    <approach>
      - "이 가이드를 더 쉽게 실행하려면" 형태로 연결
      - Stock Matrix의 구체적 기능이 어떻게 도움되는지
      - 무료라는 진입장벽 없음 강조
      - CTA 링크 삽입
    </approach>
  </section>

  <section name="faq" count="4">
    <requirements>
      - 가이드 관련 실제 궁금증
      - "어떻게", "왜", "언제" 형태 질문
    </requirements>
  </section>
</content_structure>`,
    listicle: `
<content_structure type="listicle">
  <section name="intro" word_count="150-250">
    <purpose>리스트의 가치와 선정 기준 설명</purpose>
    <elements>
      - 왜 이 리스트가 필요한지 (문제 제기)
      - 선정 기준 3-4가지 명시 (객관성 확보)
      - 총 몇 개 항목인지 미리 안내
    </elements>
  </section>

  <section name="list_items" word_count="각 200-300">
    <format>
      ## N. [서비스명]: [한 줄 특징]
      - 개요 (1-2문장)
      - 핵심 장점 2-3가지
      - 단점 또는 주의사항 1가지 (솔직함 = 신뢰)
      - 추천 대상 (누구에게 적합한지)
      - (해당시) 가격 정보
    </format>
    <item_count>7-10개 권장</item_count>
    <stock_matrix_position>2위 또는 3위 (너무 1위면 광고 느낌)</stock_matrix_position>
    <stock_matrix_emphasis>
      - AI 분석의 구체적 가치 설명
      - 30가지 지표의 의미
      - 무료의 파격적 가치
    </stock_matrix_emphasis>
  </section>

  <section name="selection_guide" word_count="200-250">
    <purpose>상황별 선택 도움</purpose>
    <format>
      - 초보자라면: [추천 서비스]
      - 기술적 분석 중심이라면: Stock Matrix
      - 유료 프리미엄 원한다면: [추천 서비스]
    </format>
  </section>

  <section name="conclusion_cta" word_count="150-200">
    <elements>
      - 핵심 요약 (2-3문장)
      - Stock Matrix 시작하기 CTA
    </elements>
  </section>

  <section name="faq" count="3">
    <focus>리스트 항목 선택 관련 질문</focus>
  </section>
</content_structure>`,
    review: `
<content_structure type="review">
  <section name="intro" word_count="200-250">
    <purpose>리뷰 대상과 목적 명확히</purpose>
    <elements>
      - 왜 이 서비스를 리뷰하는지
      - 리뷰어의 관점/배경 (신뢰도 확보)
      - 이 리뷰에서 다룰 내용 미리보기
    </elements>
  </section>

  <section name="feature_deep_dive" word_count="500-600">
    <purpose>핵심 기능 상세 분석</purpose>
    <format>
      - 주요 기능 3-5개 각각 상세 설명
      - 실제 사용 예시 또는 시나리오
      - 경쟁 서비스와 비교 포인트
    </format>
    <for_stock_matrix>
      - AI 분석 알고리즘 작동 방식
      - 30가지 지표 구체적 설명 (RSI, MACD 등)
      - 이메일 뉴스레터 실제 예시 묘사
    </for_stock_matrix>
  </section>

  <section name="pros" word_count="300-350">
    <format>
      - 장점 5-7가지 구체적 나열
      - 각 장점에 실제 예시 또는 근거
    </format>
  </section>

  <section name="cons" word_count="200-250">
    <purpose>솔직한 단점으로 신뢰도 확보</purpose>
    <format>
      - 단점 2-3가지 (진짜 단점)
      - 개선 희망 사항
      - 단점의 영향 수준 (치명적? 사소한?)
    </format>
  </section>

  <section name="value_analysis" word_count="150-200">
    <elements>
      - 가격 대비 가치 분석
      - 무료 서비스의 파격성 강조
      - 숨은 비용 없음 언급
    </elements>
  </section>

  <section name="verdict" word_count="200-250">
    <elements>
      - 총평 점수 또는 등급 (예: 4.5/5)
      - 추천 대상 명확히
      - 비추천 대상도 솔직히
      - 최종 CTA
    </elements>
  </section>

  <section name="faq" count="4">
    <focus>서비스 사용 관련 실제 궁금증</focus>
  </section>
</content_structure>`,
  };

  return structures[contentType];
}
