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

/**
 * 문자 단위 DP 상한 (n*m). 초과 시 어절 단위로 자동 강등
 *
 * 임계값 0.30/0.50은 문자 단위 기준으로만 보정돼 있다. 한국어는 교착어라
 * 어절 단위 LCS가 부분 일치를 통째로 놓치고, 같은 편집이 문자 0.28 / 어절 0.57로
 * 두 배 가까이 벌어진다. 강등이 일어나면 정상 윤문이 과윤문으로 반려된다.
 *
 * 그래서 상한을 실제 기사가 절대 넘지 못할 높이에 둔다. 실측 기사는 4,000~7,000자
 * (16M~49M 셀)이고, 이 상한은 각 20,000자까지 문자 단위를 보장한다.
 * 비용은 실측 400M 셀에서 약 0.4초 — 180초짜리 LLM 콜 옆에서는 무시할 수준이다.
 * 남은 어절 경로는 비정상 입력용 백스톱이며, 걸리면 humanizer가 로그로 드러낸다.
 */
const MAX_DP_CELLS = 400_000_000;

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
 * 비교에 쓰인 토큰 단위
 *
 * `word`는 입력이 `MAX_DP_CELLS`를 넘겨 강등된 경우뿐이다. 이때 값은 문자 단위
 * 임계값과 같은 척도가 아니므로(한국어에서 약 2배 과다 보고) 그대로 비교하면 안 된다.
 */
export type Tokenization = 'char' | 'word';

export interface ChangeRateResult {
  rate: number;
  tokenization: Tokenization;
}

/**
 * 변경률 + 사용된 토큰 단위
 *
 * 강등 여부를 호출부가 알아야 반려 사유를 정확히 남길 수 있다.
 *
 * @param before - 원문
 * @param after - 윤문본
 */
export function changeRateDetailed(
  before: string,
  after: string,
  options: ChangeRateOptions = {}
): ChangeRateResult {
  let a = stripSummaryBlock(before);
  let b = stripSummaryBlock(after);

  if (options.ignoreMarkup) {
    a = stripMarkup(a);
    b = stripMarkup(b);
  }

  if (!a && !b) return { rate: 0, tokenization: 'char' };
  if (!a || !b) return { rate: 1, tokenization: 'char' };
  if (a === b) return { rate: 0, tokenization: 'char' };

  // 정상 기사는 항상 문자 단위. 어절 강등은 비정상 입력용 백스톱이다
  const useChars = a.length * b.length <= MAX_DP_CELLS;
  const seqA = useChars ? toCharCodes(a) : a.split(/\s+/);
  const seqB = useChars ? toCharCodes(b) : b.split(/\s+/);

  const lcs = lcsLength(seqA, seqB);
  const total = seqA.length + seqB.length;

  return { rate: 1 - (2 * lcs) / total, tokenization: useChars ? 'char' : 'word' };
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
  return changeRateDetailed(before, after, options).rate;
}
