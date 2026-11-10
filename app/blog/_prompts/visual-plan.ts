// 본문 시각자료(AI 이미지) 기획 프롬프트

/**
 * 모든 이미지 프롬프트 끝에 코드가 붙이는 고정 화풍·금지 규칙.
 *
 * 모델이 기획에서 규칙을 빠뜨려도 생성 요청에는 항상 들어간다. 금융 YMYL 글에서
 * 이미지 속 숫자·로고·실존 인물은 사실 주장처럼 읽히므로 전부 금지한다.
 * 화풍은 사이트 톤(짙은 남색·슬레이트·절제된 에메랄드)에 맞춘 차분한 보도 사진이다.
 */
export const IMAGE_STYLE_SUFFIX = [
  'Style: photorealistic editorial photograph for a serious financial publication, natural soft light,',
  'calm muted palette of deep navy, slate gray and soft neutrals with at most a subtle emerald accent,',
  'clean uncluttered composition with generous negative space, realistic textures, 35mm lens, high detail.',
  'Strictly forbidden: any text, letters, numbers, logos, watermarks, signage, brand marks, charts, graphs,',
  'stock tickers, screens or documents with readable content, money piles, bull or bear figures, rockets,',
  'neon glow, dramatic lens flare, real company facilities, and any people, faces, hands or human figures',
  '(show places and objects only), and any monitor, phone or tablet screen that is switched on.',
].join(' ');

/**
 * 생성 이미지 검수 프롬프트 — 금지 규칙을 모델이 실제로 지켰는지 사진을 보고 판정한다.
 * 프롬프트로 금지해도 이미지 모델은 간판 글자·가짜 로고·사람을 섞는 일이 있다.
 */
export function buildImageQaPrompt(alt: string): string {
  return `
You are the photo desk QA for a Korean financial news site. Inspect the attached generated photo strictly, at normal web viewing size.

Report true for each problem you can see:
- text: any letters, numbers, characters, or text-like scribbles anywhere (signs, labels, paper, packaging, screens, clothing), legible or not.
- logo: any brand mark, emblem, or trademark-like symbol.
- person: any human or part of one (face, hand, arm, silhouette, reflection).
- screen: any monitor, phone, tablet, or display that is switched on.
- chart: any chart, graph, candlestick, or ticker-like pattern.
- artifact: obvious AI distortion (melted or merged objects, impossible geometry) a reader would notice.
- alt_mismatch: the Korean alt text below names an object or scene that is not actually in the photo.

<alt>${alt.replace(/[<>]/g, ' ')}</alt>

Output JSON only: {"text":false,"logo":false,"person":false,"screen":false,"chart":false,"artifact":false,"alt_mismatch":false,"note":"<one short English sentence>"}
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
당신은 한국 경제 매체의 사진 에디터입니다. 투자 블로그 글에 실을 이미지를 기획합니다.
이미지는 장식이 아니라 독자가 글의 대상(산업 현장·제품군·개념)을 머릿속에 그리게 돕는 자료입니다.
</role>

<article>
<keyword>${input.keyword}</keyword>
<title>${input.title}</title>
${sections}
</article>

<task>
1. 커버 이미지 1장: 글 전체 주제를 대표하는 장면.
2. 섹션 이미지 최대 ${input.maxSections}장: 이미지가 이해를 실제로 돕는 H2 섹션만 고른다.
   FAQ·요약·정리·체크리스트·용어 정의처럼 그림이 도움 되지 않는 섹션, "데이터로 보는"으로 시작하는 섹션은 고르지 않는다.
   이미지끼리 장면이 겹치지 않게 한다(같은 공장·같은 책상 반복 금지).
</task>

<rules>
- scene: 영어 40~90단어. 피사체·장소·구도·빛을 구체적으로 쓴다. 사람(얼굴·손 포함)이 없는 장소·사물 장면만 쓴다. 특정 실존 기업의 건물·제품·로고를 묘사하지 않는다.
  기업 글이면 그 산업의 일반적인 장면(예: 배터리 소재 연구실, 조선소 도크, 반도체 클린룸)으로 표현한다.
  추상 개념(리스크 관리, 배당, 실적 발표)은 일상 사물의 정물이나 빈 업무 공간으로 표현한다. 켜진 화면, 읽을 수 있는 문서가 보이면 안 된다.
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
