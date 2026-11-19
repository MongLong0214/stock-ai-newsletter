/**
 * 출처를 단 수치의 근거 대조
 *
 * 모호 출처("통계에 따르면")는 YMYL 게이트가 막지만, 기관명을 붙이면 통과한다:
 * "한국은행에 따르면 가계부채는 2,100조원" — 기관은 진짜인데 숫자는 모델 기억(또는 창작)일 수 있다.
 * 생성 모델은 웹 검색 없이 프롬프트의 근거 문서·검증 시세만 본다. 그러니 출처를 단 문장의 수치가
 * 그 근거 어디에도 없으면 확인할 수 없는 통계다. 재표기("1조 2천억"↔"1.2조")는 놓칠 수 있어
 * 숫자 자체가 근거에 한 번이라도 나오면 통과시킨다(관대하게 — 오탐으로 글을 잃지 않게).
 */

const ATTRIBUTION_RE =
  /에\s*따르면|에\s*의하면|(?:이|가|은|는)\s*(?:발표|집계|공시|공개|발간|조사)(?:한|했|하)|자료(?:에서|로는|를\s*보면)|보고서(?:에서|는)/;
const ATTRIBUTED_FIGURE_RE = /(\d[\d,]*(?:\.\d+)?)\s*(?:%p|%|퍼센트|조|억|만|천|원|달러|배|명|건|개(?!월)|포인트)/g;

const stripThousands = (text: string) => text.replace(/(?<=\d),(?=\d{3})/g, '');
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 출처를 단 문장 중 근거에 없는 수치가 든 문장 */
export function findUngroundedAttributedFigures(text: string, sources: string): string[] {
  const haystack = stripThousands(sources);
  const ungrounded: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (!ATTRIBUTION_RE.test(sentence)) continue;
    for (const m of sentence.matchAll(ATTRIBUTED_FIGURE_RE)) {
      const value = stripThousands(m[1]);
      if (!new RegExp(`(?<![\\d.])${escapeRegExp(value)}(?!\\d|\\.\\d)`).test(haystack)) {
        ungrounded.push(sentence.trim());
        break;
      }
    }
  }
  return ungrounded;
}
