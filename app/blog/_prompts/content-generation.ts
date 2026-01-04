/**
 * Elite-level content generation prompt for Gemini 3 Pro
 *
 * Techniques: Role-Based, CoT, Few-Shot, Constitutional AI
 * Target: Korean SEO content with Stock Matrix integration
 */

import { SITE_INFO, CONTENT_TYPE_CONFIG } from '../_config/pipeline-config';
import type { CompetitorAnalysis } from '../_types/blog';

/**
 * 경쟁사 분석 결과를 구조화된 인사이트로 변환
 * 단순 나열이 아닌 전략적 분석 관점 제공
 */
function summarizeCompetitorAnalysis(analysis: CompetitorAnalysis): string {
  const { scrapedContents, commonTopics, averageWordCount, contentGaps } =
    analysis;

  const competitorDetails = scrapedContents
    .map((content, idx) => {
      const allHeadings = [
        ...content.headings.h1,
        ...content.headings.h2.slice(0, 7),
      ];
      const contentPreview = content.paragraphs
        .slice(0, 4)
        .join(' ')
        .slice(0, 600);

      return `
<competitor rank="${idx + 1}">
  <title>${content.title}</title>
  <url>${content.url}</url>
  <word_count>${content.wordCount}</word_count>
  <heading_structure>${allHeadings.join(' | ') || '구조 없음'}</heading_structure>
  <content_sample>${contentPreview}...</content_sample>
  <strengths>분석 필요: 이 콘텐츠가 상위 랭킹인 이유</strengths>
  <weaknesses>분석 필요: 개선 가능한 영역</weaknesses>
</competitor>`;
    })
    .join('\n');

  const targetWordCount = Math.max(
    Math.round(averageWordCount * 1.3),
    averageWordCount + 500
  );

  return `
<competitor_intelligence>
  <summary>
    <total_analyzed>${scrapedContents.length}</total_analyzed>
    <avg_word_count>${averageWordCount}</avg_word_count>
    <target_word_count>${targetWordCount}</target_word_count>
    <common_topics>${commonTopics.join(', ') || '공통 토픽 없음'}</common_topics>
    <content_gaps>${contentGaps.join(', ') || 'AI 분석, 30가지 지표, 무료 서비스'}</content_gaps>
  </summary>

  <competitors>
${competitorDetails}
  </competitors>

  <strategic_directives>
    - 평균 대비 30% 이상 긴 콘텐츠 작성 (${targetWordCount}+ 단어)
    - 모든 공통 토픽을 더 깊이 있게 다룰 것
    - 콘텐츠 갭을 차별화 포인트로 활용
    - 경쟁사의 약점을 우리의 강점으로 전환
  </strategic_directives>
</competitor_intelligence>`;
}

/**
 * 콘텐츠 타입별 구조 템플릿 (향상된 버전)
 * 각 섹션에 구체적인 품질 기준과 예시 포함
 */
function getContentStructureGuide(
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

/**
 * Few-Shot 예시 생성 (우수 vs 미흡 콘텐츠)
 * Chain of Thought를 유도하는 대조적 예시 제공
 */
function getFewShotExamples(): string {
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
      "기술적 분석에 관심 있는 투자자라면 Stock Matrix를 주목할 만합니다. RSI, MACD, 볼린저밴드 등 30가지 기술 지표를 AI가 종합 분석해 매일 아침 7:50에 이메일로 전달합니다. 특히 완전 무료라는 점에서 진입 장벽이 없어, 기술적 분석을 처음 배우는 투자자에게도 좋은 교육 도구가 됩니다."
    </paragraph>
    <why_excellent>
      - 대상 독자 명시 (기술적 분석 관심자)
      - 구체적 기능 설명 (30가지 지표, AI 분석)
      - 구체적 시간 (7:50) 으로 신뢰감
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

/**
 * 한국어 SEO 최적화 가이드라인
 * 한국 검색 시장 특성 반영
 */
function getKoreanSeoGuidelines(): string {
  return `
<korean_seo_guidelines>
  <title_optimization priority="CRITICAL">
    ⚠️ **제목이 후킹 없으면 클릭률 0% = 글 전체가 무의미**

    <mandatory_hooking_elements>
      **반드시 아래 후킹 패턴 중 2개 이상 조합 필수:**

      1) 🚨 손실/실패 회피 (가장 강력)
         - "90%가 모르는", "하면 망하는", "절대 피해야 할", "손실 보는", "실패하는"
         - 예: "90%가 모르는 RSI 함정 3가지"

      2) 📊 구체적 숫자
         - "3가지", "5단계", "TOP 10", "3분 만에", "7일 완성"
         - 예: "3분 만에 저평가주 찾는 체크리스트"

      3) ❓ 질문형/딜레마
         - "언제 사야", "뭐가 정답", "왜 안 오를까", "진짜 맞나"
         - 예: "RSI 30 vs 40 어디서 사야 할까?"

      4) 💡 비밀/반전형
         - "아무도 안 알려주는", "숨겨진", "진짜 이유", "프로만 아는"
         - 예: "기관만 쓰는 거래량 분석 비법"

      5) ⚔️ 비교형
         - "A vs B", "차이점", "뭐가 더 유리"
         - 예: "삼성전자 vs SK하이닉스 수익률 비교"
    </mandatory_hooking_elements>

    <hooking_formulas>
      **자연스러운 후킹 제목 예시:**
      - "재무제표는 완벽한데 왜 내 종목만 안 오를까?" (의문형 + 공감)
      - "물타기 vs 손절 뭐가 정답일까? 10년 백테스트 결과" (비교 + 데이터)
      - "이 차트 패턴 나오면 무조건 팔아야 합니다" (경고 + 단정)
      - "개미는 모르는 기관 매매 타이밍 포착법" (대비 + 비밀)
      - "3분이면 끝나는 저평가주 체크리스트 (엑셀 공유)" (시간 + 혜택)
    </hooking_formulas>

    <absolute_rules>
      ⛔ **제목에 절대 포함 금지:**
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
      ❌ "RSI 지표 활용법 총정리 (2024)" → 밋밋함 + 진부한 표현
      ❌ "[손실회피] 주식 분석 3가지 방법" → 대괄호 레이블 = AI티
      ❌ "AI가 분석한 완벽한 PER 가이드" → AI 강조 = 신뢰 하락
      ❌ "투자 전략 가이드!! 꼭 읽어보세요!!" → 느낌표 과다
    </bad_examples>

    <good_examples>
      ✅ "재무제표 좋은데 왜 안 오르지? 가치 함정 피하는 3가지 신호"
      ✅ "이 설정 쓰면 이동평균선 손절 당합니다"
      ✅ "분할매수 3회 vs 5회, 10년 백테스트해봤더니"
      ✅ "거래량 터지면 사라고? 진짜 매수 타이밍은 따로 있다"
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

/**
 * Chain of Thought 사고 과정 가이드
 * AI가 단계별로 생각하도록 유도
 */
function getChainOfThoughtGuide(targetKeyword: string): string {
  return `
<chain_of_thought_process>
  콘텐츠 생성 전 다음 단계를 순서대로 사고하세요:

  <step num="1" name="경쟁사 분석">
    질문: 경쟁사들이 공통으로 다루는 주제는?
    질문: 경쟁사들이 놓치고 있는 정보는?
    질문: 경쟁사 대비 우리가 더 잘 다룰 수 있는 영역은?
    → 분석 결과를 콘텐츠 차별화 전략에 반영
  </step>

  <step num="2" name="검색 의도 파악">
    질문: "${targetKeyword}"를 검색하는 사람은 무엇을 원하는가?
    질문: 정보형 검색인가, 상업형 검색인가?
    질문: 검색자가 가진 기존 지식 수준은?
    → 검색 의도에 완벽히 부합하는 콘텐츠 설계
  </step>

  <step num="3" name="구조 설계">
    질문: 이 주제를 가장 논리적으로 전달하는 순서는?
    질문: 각 섹션에서 독자가 얻는 가치는?
    질문: Stock Matrix를 자연스럽게 언급할 수 있는 맥락은?
    → 독자 여정을 고려한 최적 구조 결정
  </step>

  <step num="4" name="차별화 포인트">
    질문: 경쟁사 콘텐츠에 없는 우리만의 인사이트는?
    질문: AI 분석과 30가지 지표를 어떻게 가치있게 설명할까?
    질문: 무료 서비스의 가치를 어떻게 신뢰성 있게 전달할까?
    → 명확한 차별화 요소 3가지 이상 도출
  </step>

  <step num="5" name="품질 검증 계획">
    질문: 키워드가 자연스럽게 분포되어 있는가?
    질문: 모든 주장에 근거나 예시가 있는가?
    질문: Stock Matrix 언급이 과하지 않은가?
    → 작성 후 체크리스트로 활용
  </step>
</chain_of_thought_process>`;
}

/**
 * 품질 체크리스트
 * 자가 검증을 위한 명확한 기준
 */
function getQualityChecklist(
  config: (typeof CONTENT_TYPE_CONFIG)[keyof typeof CONTENT_TYPE_CONFIG],
  targetKeyword: string
): string {
  return `
<quality_checklist>
  작성 완료 후 다음 기준을 모두 충족하는지 자가 검증하세요:

  <seo_requirements>
    [ ] 제목에 "${targetKeyword}" 자연스럽게 포함
    [ ] ⚠️ 제목에 대괄호 레이블 없음 (예: [손실회피] 금지)
    [ ] ⚠️ 제목이 사람이 쓴 것처럼 자연스러운가?
    [ ] ⚠️ 제목이 호기심/공감을 유발하는가?
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

/**
 * 메인 콘텐츠 생성 프롬프트 빌더 (Elite-Level)
 *
 * [적용된 프롬프트 엔지니어링 기법]
 * 1. Role-Based Prompting: 구체적 전문가 페르소나 설정
 * 2. Chain of Thought (CoT): 5단계 사고 과정 가이드
 * 3. Few-Shot Learning: 우수/미흡 예시 대조 제공
 * 4. Constraint Setting: XML 구조로 명확한 제약 조건
 * 5. Self-Evaluation: 품질 체크리스트 자가 검증
 * 6. Output Specification: 정밀한 JSON 출력 형식
 * 7. Structured Prompting: XML 태그로 섹션 명확 구분
 *
 * @param targetKeyword - SEO 목표 키워드
 * @param competitorAnalysis - 경쟁사 분석 결과
 * @param contentType - 콘텐츠 타입
 * @returns 최적화된 프롬프트 문자열
 */
export function buildContentGenerationPrompt(
  targetKeyword: string,
  competitorAnalysis: CompetitorAnalysis,
  contentType: 'comparison' | 'guide' | 'listicle' | 'review'
): string {
  const config = CONTENT_TYPE_CONFIG.guide;
  const competitorSummary = summarizeCompetitorAnalysis(competitorAnalysis);
  const structureGuide = getContentStructureGuide(contentType);
  const fewShotExamples = getFewShotExamples();
  const koreanSeoGuide = getKoreanSeoGuidelines();
  const cotGuide = getChainOfThoughtGuide(targetKeyword);
  const qualityChecklist = getQualityChecklist(config, targetKeyword);

  return `
<system_context>
당신은 한국 최고의 SEO 콘텐츠 전문가입니다. 당신의 글은 항상 Google/Naver 검색 1페이지에 노출되며, 독자들의 높은 참여율을 기록합니다.

당신의 전문 분야:
- 한국어 SEO 콘텐츠 작성 10년 경력
- 금융/투자 분야 콘텐츠 마케팅 전문
- 전환율 최적화 (CRO) 전문가
- Google E-E-A-T 기준 충족 콘텐츠 제작

당신의 작성 원칙:
1. 독자에게 실질적 가치를 제공하는 콘텐츠만 작성
2. 모든 주장에는 근거(통계, 예시, 경험)를 제시
3. 과장이나 허위 정보 절대 금지
4. 서비스 홍보는 자연스럽고 가치 중심으로
</system_context>

<mission>
타겟 키워드 "${targetKeyword}"로 검색 1위를 달성할 수 있는 최고 품질의 한국어 블로그 콘텐츠를 작성하세요.
경쟁사 콘텐츠를 분석하여 더 깊이 있고, 더 실용적이며, 더 차별화된 콘텐츠를 생성해야 합니다.
</mission>

<target_keyword priority="high">
${targetKeyword}
</target_keyword>

<our_service>
  <name>${SITE_INFO.name}</name>
  <name_ko>${SITE_INFO.nameKo}</name_ko>
  <domain>${SITE_INFO.domain}</domain>
  <core_features>
${SITE_INFO.features.map((f) => `    - ${f}`).join('\n')}
  </core_features>
  <unique_selling_points>
${SITE_INFO.uniqueSellingPoints.map((u) => `    - ${u}`).join('\n')}
  </unique_selling_points>
  <integration_guidelines>
    - 콘텐츠 전체에서 2-3회만 언급 (과하면 스팸으로 인식)
    - 항상 독자에게 제공하는 가치 관점에서 설명
    - "최고의", "완벽한" 같은 과장 표현 금지
    - 구체적 기능(30가지 지표, AI 분석 등)으로 차별화
    - CTA는 중간 1회 + 결론 1회로 제한
  </integration_guidelines>
</our_service>

${competitorSummary}

${cotGuide}

${fewShotExamples}

${structureGuide}

${koreanSeoGuide}

<content_requirements>
  <word_count>
    <min>${config.minWordCount}</min>
    <max>${config.maxWordCount}</max>
    <target>${Math.round((config.minWordCount + config.maxWordCount) / 2)}</target>
  </word_count>
  <faq_count>${config.faqCount}</faq_count>
  <language>한국어 (자연스러운 구어체, 존칭 사용)</language>
  <tone>전문적이면서도 친근한, 신뢰감 있는 톤</tone>
  <current_year>${new Date().getFullYear()}</current_year>
</content_requirements>

${qualityChecklist}

<output_specification>
반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트 없이 JSON만 출력합니다.

⚠️ **제목(title) 필수 체크:**
- 사람이 쓴 것 같은 자연스러운 제목 (대괄호 레이블 절대 금지)
- 클릭하고 싶어지는 호기심/공감 유발
- 질문형, 경고형, 비교형 등 다양하게 활용

\`\`\`json
{
  "title": "자연스럽고 후킹되는 제목 (예: '재무제표 좋은데 왜 안 오르지? 가치 함정 피하는 법')",
  "description": "글의 핵심 가치를 요약 (150-200자)",
  "metaTitle": "검색 결과 제목 (50-60자, 키워드 앞부분 + 후킹 요소)",
  "metaDescription": "검색 결과 설명 (145-155자, 키워드+가치+CTA)",
  "content": "전체 본문 (Markdown 형식, H2/H3 헤딩 포함, 이미지 위치 표시)",
  "headings": ["H2 헤딩 배열 (순서대로)"],
  "faqItems": [
    {
      "question": "실제 검색될 만한 질문 형태",
      "answer": "구체적이고 유용한 답변 (2-4문장)"
    }
  ],
  "suggestedTags": ["태그1", "태그2", "태그3", "태그4", "태그5"]
}
\`\`\`
</output_specification>

<final_instruction>
위의 모든 가이드라인을 철저히 따라 최고 품질의 SEO 콘텐츠를 생성하세요.
특히 Chain of Thought 프로세스를 내부적으로 수행한 후 콘텐츠를 작성하고,
작성 완료 후 Quality Checklist로 자가 검증을 수행하세요.
오직 JSON 형식으로만 응답하세요.
</final_instruction>
`;
}
