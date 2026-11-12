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
- off_topic: judge by subject matter only. The photo is not allowed to show company names or logos, so never require it to identify a specific company; a scene of that company's industry, product type, or the event at issue is on-topic. Report true only when the depicted subject is unrelated to the topic below, when it is a symbolic still life (blocks, marbles, chess pieces, scales, an empty generic office or desk), or when it is a generic scene with no link to the topic's industry or event (a hand holding a phone, a random office tower, plain paperwork).

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
분위기만 내는 은유·상징 사진, 다른 글에 그대로 써도 되는 범용 사진은 실패작입니다.
커버에는 코드가 사진 위에 한글 후킹 문구(kicker·headline·subhead)를 크게 얹습니다. 문구가 무엇을, 사진이 어떤 현장인지를 맡습니다.
</role>

<article>
<keyword>${input.keyword}</keyword>
<title>${input.title}</title>
${sections}
</article>

<task>
1. 커버 이미지 1장 + 후킹 문구: 글 제목의 핵심 대상(기업·산업·사건·상품)과 쟁점이 한눈에 보이는 장면. 목록 썸네일·SNS 공유 이미지로 쓰인다.
   사진 하단 1/3은 문구가 덮으므로 주인공 피사체는 화면 위쪽 2/3에 둔다.
2. 섹션 이미지 최대 ${input.maxSections}장: 이미지가 이해를 실제로 돕는 H2 섹션만 고른다.
   FAQ·요약·정리·체크리스트·용어 정의처럼 그림이 도움 되지 않는 섹션, "데이터로 보는"으로 시작하는 섹션은 고르지 않는다.
   섹션 이미지도 그 섹션이 다루는 구체 대상을 보여 준다. 이미지끼리 장면이 겹치지 않게 한다(같은 공장 반복 금지).
</task>

<rules>
- scene: 영어 50~100단어. 이 글에만 맞는 구체적인 실제 현장·사물 사진이다. 주인공 피사체 하나가 화면 대부분을 차지하게 하고, 장소·구도·빛을 구체적으로 쓴다.
  · 핵심 대상 + 쟁점을 한 장면에 함께 담는다. 대상은 그 회사의 실제 주력 제품·그 사건의 쟁점 사물·그 상품이 실제로 쓰이는 장면이고, 쟁점은 제목의 이슈(소송·실적·청약·선거·배당 등)다.
    예) 메디톡스 소송 → 법정 판사석 앞 탁자에 놓인 소형 주사제 바이알(배경은 흐린 법정)
        LG화학 실적 → 양극재 분말이 쏟아지는 배터리 소재 생산 설비와 완성된 원통형 배터리 셀
        11월 공모주 → 상장 첫날 거래소 기념 타종 행사장의 큰 종과 꽃다발, 전광판은 흐리게
        미국 중간선거 → 미국 국회의사당 앞 투표소의 성조기 투표함
        게임 ETF → 관중석이 꽉 찬 e스포츠 경기장 무대와 게이밍 장비
        공기청정기 관련주 → 거실에서 가동 중인 공기청정기와 교체용 헤파 필터
  · 이미지 모델 안전 필터에 걸리는 단어는 scene에 쓰지 않는다: 독소·독극물·마약·무기·폭발·혈액·시신 등. 예) 보툴리눔 톡신 → small injectable medicine vials.
  · 섹션 이미지는 그 섹션이 다루는 구체 대상(특정 제품·특정 절차·특정 현장)을 같은 방식으로 보여 준다.
  · 실패 기준: 다른 금융 글에 그대로 써도 어색하지 않은 범용 장면(스마트폰 든 손, 여의도 빌딩 외관, 정체 모를 공장, 빈 사무실·책상·회의실),
    나무 블록·구슬·체스말·퍼즐·저울·모래시계·돼지저금통 같은 상징 소품 정물, 주제와 상관없는 풍경.
  · 사람은 얼굴이 보이지 않는 익명 인물(뒷모습·손·멀리 흐릿한 사람)로만 넣는다. 화면은 흐려서 내용을 읽을 수 없게 쓴다. 읽을 수 있는 글자·숫자·로고, 특정 실존 기업의 건물·제품·로고, 실존 인물은 묘사하지 않는다.
- alt: 한국어 40~110자. 이미지에 실제로 보이는 것을 객관적으로 묘사한다. 사실 주장·수치·평가를 넣지 않는다. 커버 alt에는 키워드를 자연스럽게 한 번 넣는다.
- caption: 한국어 60자 이내. 이미지가 그 섹션의 어떤 내용을 표현하는지 설명한다. 실제 해당 기업·현장 사진인 것처럼 쓰지 않는다("~를 표현한 이미지").
- heading: 위 article의 heading 문자열을 한 글자도 바꾸지 말고 그대로 복사한다.
- 커버 문구(사진 위에 큰 글자로 얹힌다. 숫자는 제목·본문에 그대로 있는 것만 쓴다. 매수 권유·수익 보장·과장어(폭등·대박·무조건) 금지):
  · kicker: 2~8자. 글 유형. 예) 소송 분석, 실적 분석, 공모주 일정, ETF 비교
  · headline: 6~16자. 핵심 대상의 고유명사(기업명·상품명·사건명)를 반드시 넣고 독자가 가장 궁금해할 쟁점을 짚는다.
    예) 메디톡스 400억 소송의 향방, LG화학 실적 7가지 체크, 11월 공모주 청약 일정
  · subhead: 8~26자. 글을 읽으면 얻는 것. 예) 판결이 주가에 미칠 3가지 경로
</rules>

<output>
JSON만 출력한다.
{
  "cover": { "scene": "...", "alt": "...", "caption": "...", "kicker": "...", "headline": "...", "subhead": "..." },
  "sections": [ { "heading": "...", "scene": "...", "alt": "...", "caption": "..." } ]
}
</output>
`.trim();
}
