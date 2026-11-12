// 본문 시각자료(AI 이미지) 기획 프롬프트

/**
 * 모든 이미지 프롬프트 끝에 코드가 붙이는 고정 화풍·금지 규칙.
 *
 * 모델이 기획에서 규칙을 빠뜨려도 생성 요청에는 항상 들어간다. 금융 YMYL 글에서
 * 이미지 속 숫자·로고·실존 인물은 사실 주장처럼 읽히므로 금지한다.
 *
 * 2026-11-12: 옛 규칙(사람·화면 전면 금지 + 여백 많은 차분한 정물)은 결과가 전부 나무 블록·구슬·빈 사무실
 * 같은 은유 정물이 돼 주제와 무관하고 클릭을 끌지 못했다. 지금은 주제의 실제 현장·대상을 화면 가득
 * 담는 보도 사진을 요구하고, 사람은 얼굴을 알아볼 수 없는 익명 인물로만, 화면은 내용을 읽을 수 없게만 허용한다.
 */
export const IMAGE_STYLE_SUFFIX = [
  'Style: photorealistic news photograph for a Korean financial publication, shot on location like a real photojournalist:',
  'one strong, instantly recognizable main subject filling most of the frame, close-to-medium framing, shallow depth of field,',
  'natural rich colors and realistic light with clear contrast, real textures, high detail.',
  'It must look like a real photo of the actual subject, not a conceptual still life:',
  'no symbolic props such as wooden blocks, marbles, chess pieces, puzzle pieces, balance scales, hourglasses or piggy banks,',
  'and no empty generic offices, desks or meeting rooms.',
  'People may appear only as anonymous figures (seen from behind, hands at work, distant or out-of-focus figures) with no clearly visible face.',
  'Screens may appear only blurred so that nothing on them can be read.',
  'Strictly forbidden: readable text, letters or numbers, logos, watermarks, brand marks, signage with words,',
  'charts or tickers with readable values, identifiable real company buildings or products, real celebrities or politicians,',
  'money piles, bull or bear figures, rockets, neon glow and dramatic lens flare.',
].join(' ');

/**
 * 생성 이미지 검수 프롬프트 — 금지 규칙을 지켰는지, 그리고 글 주제와 실제로 맞는지 사진을 보고 판정한다.
 * 프롬프트로 금지해도 이미지 모델은 간판 글자·가짜 로고·얼굴을 섞는 일이 있고,
 * 기획이 은유 정물로 흐르면 주제와 무관한 사진이 나온다(off_topic).
 *
 * 글자·로고는 "읽히거나 알아볼 수 있는 것"만 잡는다(커버는 2026-11-10 Isaac 결정, 섹션도 같은 기준으로 통일).
 * 제품·공장·현장 사진에는 읽을 수 없는 작은 표식이 자연히 생기고, 그것은 사실 주장으로 읽히지 않는다.
 */
export function buildImageQaPrompt(input: { alt: string; topic: string }): string {
  return `
You are the photo desk QA for a Korean financial news site. Inspect the attached generated photo strictly, at normal web viewing size.

Report true for each problem you can see:
- text: letters, numbers, or words a reader could actually read at normal web viewing size, or a prominent text-like block that draws the eye. Ignore tiny incidental marks that cannot be read (key markings, distant labels, texture patterns).
- logo: a recognizable brand mark, emblem, or trademark. Ignore a tiny generic shape nobody could identify as a brand.
- face: a clearly visible, in-focus human face. Figures seen from behind, hands, silhouettes, and distant or blurred people are fine.
- screen: a screen whose content can be read (text, numbers, app or website interface). A blurred, unreadable screen glow is fine.
- chart: a chart, graph, candlestick, or ticker with readable axes or values. Unreadable blurred lines in the background are fine.
- artifact: obvious AI distortion (melted or merged objects, extra fingers, impossible geometry) a reader would notice.
- alt_mismatch: the Korean alt text below names an object or scene that is not actually in the photo.
- off_topic: a reader who sees only this photo would not connect it to the article topic below, or it is a symbolic still life (blocks, marbles, chess pieces, scales, an empty generic office or desk) instead of a real scene of the subject.

<topic>${input.topic.replace(/[<>]/g, ' ')}</topic>
<alt>${input.alt.replace(/[<>]/g, ' ')}</alt>

Output JSON only: {"text":false,"logo":false,"face":false,"screen":false,"chart":false,"artifact":false,"alt_mismatch":false,"off_topic":false,"note":"<one short English sentence>"}
`.trim();
}

export interface VisualPlanSection {
  readonly heading: string;
  readonly excerpt: string;
}

/** 시각자료 기획 프롬프트 — JSON만 출력 */
export function buildVisualPlanPrompt(input: {
  keyword: string;
  title: string;
  sections: readonly VisualPlanSection[];
  maxSections: number;
}): string {
  const sections = input.sections
    .map((s, i) => `<section index="${i + 1}">\n<heading>${s.heading}</heading>\n<excerpt>${s.excerpt}</excerpt>\n</section>`)
    .join('\n');

  return `
<role>
당신은 한국 경제 매체의 사진 에디터입니다. 투자 블로그 글에 실을 사진을 기획합니다.
목록 썸네일만 보고도 독자가 3초 안에 "아, 이건 ○○ 얘기구나" 하고 알아보고 눌러 보고 싶어지는 사진이어야 합니다.
분위기만 내는 은유·상징 사진은 실패작입니다.
</role>

<article>
<keyword>${input.keyword}</keyword>
<title>${input.title}</title>
${sections}
</article>

<task>
1. 커버 이미지 1장: 글 제목의 핵심 대상(기업·산업·사건·상품)이 한눈에 보이는 장면. 목록 썸네일로 쓰인다.
2. 섹션 이미지 최대 ${input.maxSections}장: 이미지가 이해를 실제로 돕는 H2 섹션만 고른다.
   FAQ·요약·정리·체크리스트·용어 정의처럼 그림이 도움 되지 않는 섹션, "데이터로 보는"으로 시작하는 섹션은 고르지 않는다.
   섹션 이미지도 그 섹션이 다루는 구체 대상을 보여 준다. 이미지끼리 장면이 겹치지 않게 한다(같은 공장 반복 금지).
</task>

<rules>
- scene: 영어 40~90단어. 글의 대상을 문자 그대로 보여 주는 실제 현장·사물 사진이다. 주인공 피사체 하나가 화면 대부분을 차지하게 하고, 장소·구도·빛을 구체적으로 쓴다.
  · 기업·업종 글: 그 회사가 실제로 만드는 제품과 생산 현장을 일반화해 보여 준다. 예) LG화학 → 배터리 양극재 분말과 화학 공장 설비, 메디톡스 → 바이알·주사기가 놓인 바이오 의약품 생산 라인, 공기청정기 관련주 → 거실의 공기청정기와 필터.
  · 사건·이슈 글: 사건의 상징적 현장을 보여 준다. 예) 소송 → 법정과 판사봉, 미국 중간선거 → 미 국회의사당과 투표소, 금리 → 중앙은행 건물 외관.
  · 금융 상품·제도 글(공모주·ETF·배당·세금): 그 일이 실제로 벌어지는 장면을 보여 준다. 예) 공모주 청약 → 증권사 객장 상담 창구나 상장 기념 타종 행사장, 스마트폰으로 청약하는 손(화면은 흐리게), ETF → 여의도 금융가와 트레이딩 데스크(모니터는 흐리게), 게임 ETF → 게임 패드와 e스포츠 경기장.
  · 금지: 나무 블록·구슬·체스말·퍼즐·저울·모래시계·돼지저금통 같은 상징 소품 정물, 텅 빈 사무실·책상·회의실, 주제와 상관없는 풍경.
  · 사람은 얼굴이 보이지 않는 익명 인물(뒷모습·손·멀리 흐릿한 사람)로만 넣는다. 화면은 흐려서 내용을 읽을 수 없게 쓴다. 읽을 수 있는 글자·숫자·로고, 특정 실존 기업의 건물·제품·로고, 실존 인물은 묘사하지 않는다.
- alt: 한국어 40~110자. 이미지에 실제로 보이는 것을 객관적으로 묘사한다. 사실 주장·수치·평가를 넣지 않는다. 커버 alt에는 키워드를 자연스럽게 한 번 넣는다.
- caption: 한국어 60자 이내. 이미지가 그 섹션의 어떤 내용을 표현하는지 설명한다. 실제 해당 기업·현장 사진인 것처럼 쓰지 않는다("~를 표현한 이미지").
- heading: 위 article의 heading 문자열을 한 글자도 바꾸지 말고 그대로 복사한다.
</rules>

<output>
JSON만 출력한다.
{
  "cover": { "scene": "...", "alt": "...", "caption": "..." },
  "sections": [ { "heading": "...", "scene": "...", "alt": "...", "caption": "..." } ]
}
</output>
`.trim();
}
