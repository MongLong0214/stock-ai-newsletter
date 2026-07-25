/**
 * 윤문 전후 변경률 계산 — 과윤문 가드의 SSOT
 *
 * Humanize KR(im-not-ai)의 `references/metrics_v2.py::change_rate()`를 TypeScript로 옮긴 것.
 * 원본: https://github.com/epoko77-ai/im-not-ai (MIT License)
 *
 * 원본은 Python `difflib.SequenceMatcher` 문자 단위 유사도의 보수(1 - ratio)를 쓴다.
 * SequenceMatcher는 재귀적 최장 일치 블록 방식이라 LCS보다 매칭량이 같거나 적다.
 * 여기서는 LCS로 계산하므로 결과는 원본과 같거나 아주 조금 작게(= 보수적으로 낮게) 나온다.
 * 게이트 임계값(0.30 / 0.50)은 원본 상수를 그대로 따른다.
 */

/** 변경률 경고 임계값 — 초과 시 로그 경고, 채택은 유지 */
export const CHANGE_RATE_WARN = 0.3;

/** 변경률 중단 임계값 — 이상이면 윤문본 폐기하고 원문 롤백 */
export const CHANGE_RATE_ABORT = 0.5;

/** 문자 단위 DP 상한 (n*m). 초과 시 어절 단위로 자동 강등 */
const MAX_DP_CELLS = 64_000_000;

/** 본문 끝 메타데이터 주석 블록 — 여는 마커부터 끝까지 */
const SUMMARY_BLOCK_RE = /<!--\s*HUMANIZE-SUMMARY\b[\s\S]*/;

/**
 * `<!-- HUMANIZE-SUMMARY -->` 메타 블록 제거
 *
 * 이 블록은 윤문 산출물이 아니라 메타데이터이므로 비교 전에 제거한다.
 * 제거하지 않으면 변경률이 부풀려진다.
 */
export function stripSummaryBlock(text: string): string {
  return text.replace(SUMMARY_BLOCK_RE, '').trim();
}

/** 마크업 전용 줄 제거 + 줄머리 장식 제거 (헤딩·불릿·번호·인용) */
function stripMarkup(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*(```|---+|\|[\s|:-]+\|)\s*$/.test(line))
    .map((line) => line.replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/, ''))
    .join('\n');
}

/** LCS 길이 — 롤링 배열로 O(min(n,m)) 메모리 */
function lcsLength(a: Int32Array | string[], b: Int32Array | string[]): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return 0;

  let prev = new Int32Array(m + 1);
  let curr = new Int32Array(m + 1);

  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1];
    for (let j = 1; j <= m; j++) {
      if (ai === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        const up = prev[j];
        const left = curr[j - 1];
        curr[j] = up >= left ? up : left;
      }
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }

  return prev[m];
}

function toCharCodes(text: string): Int32Array {
  const out = new Int32Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

export interface ChangeRateOptions {
  /** 헤딩·불릿 삭제가 변경률을 부풀리는 경우 마크업을 제외하고 본문만 비교 */
  ignoreMarkup?: boolean;
}

/**
 * 윤문 전후 변경률 (0.0 = 동일, 1.0 = 전면 교체)
 *
 * @param before - 원문
 * @param after - 윤문본
 */
export function changeRate(
  before: string,
  after: string,
  options: ChangeRateOptions = {}
): number {
  let a = stripSummaryBlock(before);
  let b = stripSummaryBlock(after);

  if (options.ignoreMarkup) {
    a = stripMarkup(a);
    b = stripMarkup(b);
  }

  if (!a && !b) return 0;
  if (!a || !b) return 1;
  if (a === b) return 0;

  // 긴 입력은 문자 단위 DP가 비싸다 — 어절 단위로 강등해 근사
  const useChars = a.length * b.length <= MAX_DP_CELLS;
  const seqA = useChars ? toCharCodes(a) : a.split(/\s+/);
  const seqB = useChars ? toCharCodes(b) : b.split(/\s+/);

  const lcs = lcsLength(seqA, seqB);
  const total = seqA.length + seqB.length;

  return 1 - (2 * lcs) / total;
}
