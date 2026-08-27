/**
 * 한글 AI 문체(AI 티) 계량 지표 — im-not-ai metrics_v2 부분 포팅
 *
 * Copyright (c) epoko77-ai — https://github.com/epoko77-ai/im-not-ai (MIT).
 * 원본은 Python(metrics.py / metrics_v2.py)이며, 윤문 게이트에 필요한 지표만 옮겼다.
 *
 * 쓰는 법이 중요하다: 이 지표들은 **절대 임계 게이트로 쓰지 않는다.**
 * 자사 실측에서 사람이 쓴 페이지(methodology 0.164, faq 0.048)와 AI 생성 글(0.12대)의
 * ending_diversity가 같은 범위였고, im-not-ai의 baseline_v2는 전 셀 placeholder다.
 * 유일하게 신뢰할 수 있는 용법은 같은 글의 윤문 전/후 비교 — "윤문이 AI 티를
 * 실제로 줄였는가(적어도 늘리지 않았는가)"의 델타 검사다.
 */

const SENTENCE_SPLIT_RE = /(?<=[.!?。])\s+/;
/** 문장 종결 키: 종결부호 앞 한글 2음절 (1음절 문장은 폴백) */
const ENDING_FINAL_RE = /([가-힣]{2})[.!?]\s*$/;
const ENDING_FINAL_FALLBACK_RE = /([가-힣])[.!?]\s*$/;

/** 이중 피동 표층형 (T2b). 단순 "되다"는 정상 표현이므로 제외. */
const DOUBLE_PASSIVE_TOKENS = [
  '되어진다', '되어졌다', '되어진', '되어지는',
  '보여진다', '보여졌다', '보여진',
  '쓰여진다', '쓰여졌다', '쓰여진',
  '잊혀진', '잊혀졌', '잊혀진다',
  '닫혀진', '열려진', '불려진', '놓여진',
] as const;

/** 결산 상투구 — AI가 결론 문단을 여는 전형적 신호 */
const CONCLUSION_PIVOT_LEXICON = ['결론적으로', '이를 통해', '그러므로', '시사하는 바'] as const;

/** 안전 균형 hedge — 양시론으로 빠지는 AI 특유 패턴 */
const SAFE_BALANCE_LEXICON = ['양쪽 모두', '두 가지 모두', '장점도 있지만', '신중하게 접근'] as const;

/** 문두 접속사 (humanize 프롬프트 H-1 규칙과 같은 목록) */
const OPENER_CONJUNCTION_RE = /(?:^|[.!?]\s+)(또한|따라서|즉|나아가|아울러|게다가|더욱이),?\s/g;

export interface AiTellMetrics {
  /** 결산 상투구 등장 수 */
  readonly conclusionPivotCount: number;
  /** '~다' 4연속 이상 스트릭 수 (0이 다양, 클수록 단조) */
  readonly daStreaks: number;
  /** 이중 피동 표층형 등장 수 */
  readonly doublePassiveCount: number;
  /** 고유 종결키 / 문장 수 (높을수록 다양) */
  readonly endingDiversity: number;
  /** 문두 접속사 등장 수 */
  readonly openerConjunctionCount: number;
  /** 안전 균형 hedge 등장 수 */
  readonly safeBalanceCount: number;
  readonly sentenceCount: number;
}

function splitSentences(text: string): string[] {
  return text
    .trim()
    .split(SENTENCE_SPLIT_RE)
    .flatMap((part) => part.split('\n'))
    .map((s) => s.trim())
    .filter(Boolean);
}

function lastEojeol(sentence: string): string {
  const words = sentence.replace(/[.!?。]\s*$/, '').trim().split(/\s+/);
  return words[words.length - 1] ?? '';
}

/** 긴 토큰 우선의 비중첩 매칭 — "되어진다"가 "되어진"으로 이중 카운트되지 않게 */
function countOccurrences(text: string, items: readonly string[]): number {
  const pattern = [...items].sort((a, b) => b.length - a.length).join('|');
  return text.match(new RegExp(pattern, 'g'))?.length ?? 0;
}

export function measureAiTell(text: string): AiTellMetrics {
  const sentences = splitSentences(text);

  const endingKeys: string[] = [];
  let daStreaks = 0;
  let currentStreak = 0;
  for (const sentence of sentences) {
    const key = ENDING_FINAL_RE.exec(sentence)?.[1] ?? ENDING_FINAL_FALLBACK_RE.exec(sentence)?.[1];
    if (key) endingKeys.push(key);

    if (lastEojeol(sentence).endsWith('다')) {
      currentStreak += 1;
    } else {
      if (currentStreak >= 4) daStreaks += 1;
      currentStreak = 0;
    }
  }
  if (currentStreak >= 4) daStreaks += 1;

  return {
    conclusionPivotCount: countOccurrences(text, CONCLUSION_PIVOT_LEXICON),
    daStreaks,
    doublePassiveCount: countOccurrences(text, DOUBLE_PASSIVE_TOKENS),
    endingDiversity: endingKeys.length ? new Set(endingKeys).size / endingKeys.length : 0,
    openerConjunctionCount: [...text.matchAll(OPENER_CONJUNCTION_RE)].length,
    safeBalanceCount: countOccurrences(text, SAFE_BALANCE_LEXICON),
    sentenceCount: sentences.length,
  };
}

/**
 * 윤문 전후 델타 판정. 윤문의 존재 이유가 AI 티 제거이므로,
 * 계량 가능한 축 중 어느 하나라도 유의미하게 **악화**하면 반려한다.
 * (개선을 강제하지는 않는다 — 원문이 이미 깨끗한 축은 0→0으로 통과.)
 */
export function humanizeMadeItWorse(before: AiTellMetrics, after: AiTellMetrics): string | null {
  if (after.doublePassiveCount > before.doublePassiveCount) {
    return `이중 피동 증가 (${before.doublePassiveCount} → ${after.doublePassiveCount})`;
  }
  if (after.daStreaks > before.daStreaks) {
    return `'~다' 단조 스트릭 증가 (${before.daStreaks} → ${after.daStreaks})`;
  }
  if (after.conclusionPivotCount > before.conclusionPivotCount) {
    return `결산 상투구 증가 (${before.conclusionPivotCount} → ${after.conclusionPivotCount})`;
  }
  if (after.openerConjunctionCount > before.openerConjunctionCount + 1) {
    return `문두 접속사 증가 (${before.openerConjunctionCount} → ${after.openerConjunctionCount})`;
  }
  // 종결 다양성: 문장 수 자체가 변하므로 절대 비교 대신 상대 하락 20%까지 허용
  if (before.endingDiversity > 0 && after.endingDiversity < before.endingDiversity * 0.8) {
    return `종결어미 다양성 하락 (${before.endingDiversity.toFixed(3)} → ${after.endingDiversity.toFixed(3)})`;
  }
  return null;
}
