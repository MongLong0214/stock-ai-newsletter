/**
 * 가독성 레이아웃 — 발행 직전 문단을 읽기 쉬운 단위로 쪼갠다.
 *
 * 조합기(compose*)는 의미 블록 단위로 문단을 만든다. 그대로 발행하면 한 문단에
 * 3~4문장이 줄바꿈 없이 들어가고, 볼드 리드 문장이 뒤 문장과 한 줄로 붙는다:
 *
 *   **생명주기 단계는 무엇을 뜻하나** 점수의 절대값과 최근 추세를 함께 보고 초기·성장·
 *   정점·쇠퇴·휴면 다섯 구간 중 하나로 분류한 값입니다. 같은 점수라도 오르는 중인지…
 *
 * 네이버 본문 폭은 모바일에서 약 360px다. 위 문단은 8~10줄짜리 글자벽이 된다.
 * 스마트에디터는 `\n\n`으로 나뉜 블록마다 별도 문단 컴포넌트를 만들므로,
 * 여기서 블록을 나눠 두면 그대로 줄바꿈이 된다.
 *
 * 건드리지 않는 블록: 인용구(`>> `), 이미지 슬롯, URL 단독, 번호 목록(①②…).
 */

/** 한 문단에 넣을 최대 문장 수 */
export const MAX_SENTENCES_PER_PARAGRAPH = 2;
/** 한 문단 최대 길이(자). 문장 2개라도 이보다 길면 쪼갠다. */
export const MAX_PARAGRAPH_CHARS = 110;

const QUOTE_PREFIX = '>> ';
const IMAGE_SLOT = /^\{\{image:[^}]+\}\}$/;
const URL_ONLY = /^https?:\/\/\S+$/;
/** 조합기가 쓰는 번호 목록 마커 */
const NUMERAL_LIST = /[①②③④⑤⑥⑦⑧⑨⑩]/;

/**
 * 한국어 문장 경계.
 *
 * 종결어미 뒤의 마침표만 경계로 본다. `2026.08`, `1.5`, `stockmatrix.co.kr` 같은
 * 마침표를 문장 끝으로 오해하지 않게 하려면 숫자·URL이 아니라 어미를 봐야 한다.
 */
// 마커가 문장 끝에 붙는 경우도 경계다: `[[r:늘었습니다]].`, `**있습니다**.`
const SENTENCE_END = /(?<=[다요죠까함음]|[다요죠까함음]\*\*|[다요죠까함음]\]\])\.(?=\s|$)/g;

export function splitSentences(text: string): string[] {
  const parts: string[] = [];
  let last = 0;
  for (const m of text.matchAll(SENTENCE_END)) {
    const end = (m.index ?? 0) + 1;
    parts.push(text.slice(last, end).trim());
    last = end;
  }
  const tail = text.slice(last).trim();
  if (tail) parts.push(tail);
  return parts.filter(Boolean);
}

/** 볼드 리드로 시작하는 문단이면 [리드, 나머지]로 나눈다. 아니면 null. */
function splitBoldLead(block: string): [string, string] | null {
  const m = block.match(/^(\*\*[^*]+\*\*)\s*(\S[\s\S]*)$/);
  if (!m) return null;
  // 리드가 너무 길면 소제목이 아니라 강조 문장이다 — 건드리지 않는다
  if (m[1].replace(/\*/g, '').length > 30) return null;
  return [m[1], m[2].trim()];
}

function groupSentences(sentences: readonly string[]): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) out.push(buf.join(' '));
    buf = [];
  };
  for (const s of sentences) {
    const candidate = [...buf, s].join(' ');
    if (buf.length >= MAX_SENTENCES_PER_PARAGRAPH || (buf.length > 0 && candidate.length > MAX_PARAGRAPH_CHARS)) {
      flush();
    }
    buf.push(s);
  }
  flush();
  return out;
}

/** 블록 하나를 읽기 쉬운 문단들로 */
export function layoutBlock(block: string): string[] {
  const trimmed = block.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith(QUOTE_PREFIX) || IMAGE_SLOT.test(trimmed) || URL_ONLY.test(trimmed)) {
    return [trimmed];
  }
  // 번호 목록은 이미 줄바꿈으로 구조가 잡혀 있다
  if (NUMERAL_LIST.test(trimmed)) return [trimmed];

  const lead = splitBoldLead(trimmed);
  if (lead) {
    return [lead[0], ...groupSentences(splitSentences(lead[1]))];
  }
  return groupSentences(splitSentences(trimmed));
}

/** 본문 전체에 적용 */
export function applyReadabilityLayout(body: string): string {
  return body
    .split(/\n{2,}/)
    .flatMap((block) => layoutBlock(block))
    .filter(Boolean)
    .join('\n\n');
}
