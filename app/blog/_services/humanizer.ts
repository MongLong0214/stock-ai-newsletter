/**
 * 한글 AI 문체 제거(윤문) 서비스
 *
 * Humanize KR(im-not-ai)의 monolith Fast Path를 블로그 파이프라인에 이식한 것.
 * 생성된 본문을 Gemini 1콜로 윤문하고, 결정적 가드로 과윤문·의미 훼손을 차단한다.
 *
 * 원본: https://github.com/epoko77-ai/im-not-ai (MIT License)
 *
 * 설계 원칙: 이 단계는 절대 실패를 전파하지 않는다.
 * 윤문은 부가 품질 개선이므로, 어떤 이유로든 실패하면 원문을 그대로 통과시킨다.
 */

import { generateText } from '@/lib/llm/gemini-client';
import { buildHumanizePrompt, HUMANIZE_BEGIN, HUMANIZE_END } from '../_prompts/humanize';
import { HUMANIZE_CONFIG } from '../_config/pipeline-config';
import { humanizeMadeItWorse, measureAiTell } from '../_utils/ai-tell-metrics';
import {
  changeRateDetailed,
  stripSummaryBlock,
  CHANGE_RATE_WARN,
  CHANGE_RATE_ABORT,
} from '../_utils/change-rate';
import type { GeneratedContent } from '../_types/blog';

/** 윤문본 채택 여부 판정 결과 */
export interface HumanizeVerdict {
  accepted: boolean;
  /** 채택 시 윤문본, 반려 시 원문 */
  text: string;
  changeRate: number;
  /** 반려 사유 또는 경고 (채택+무경고면 null) */
  reason: string | null;
}

// --- 응답 파싱 ---

/**
 * 모델 응답에서 윤문본 추출
 *
 * 두 센티널을 각각 독립적으로 잘라낸다. 한쪽만 나온 응답(출력 토큰 소진으로
 * 닫는 센티널이 잘렸거나 모델이 빠뜨린 경우)에서 마커 문자열이 본문에 남으면
 * 나머지 가드를 모두 통과해 그대로 발행될 수 있다.
 */
export function extractHumanized(response: string): string {
  let body = response;

  const begin = body.indexOf(HUMANIZE_BEGIN);
  if (begin !== -1) body = body.slice(begin + HUMANIZE_BEGIN.length);

  const end = body.lastIndexOf(HUMANIZE_END);
  if (end !== -1) body = body.slice(0, end);

  body = stripSummaryBlock(body).trim();

  // 모델이 전체를 코드 펜스로 감싼 경우만 벗긴다 (본문 내 코드 블록은 보존)
  const fenced = body.match(/^```(?:markdown|md)?\s*\n([\s\S]*)\n```$/);
  if (fenced) body = fenced[1].trim();

  // 센티널을 여러 번 뱉은 응답까지 막는다 — 반환값에 마커가 남는 경우는 없어야 한다
  return body.split(HUMANIZE_BEGIN).join('').split(HUMANIZE_END).join('').trim();
}

// --- 가드 유틸 ---

/** 한글 어절 + 영문 단어 수 (content-generator의 계산과 동일) */
function countWords(text: string): number {
  const korean = (text.match(/[가-힣]+/g) || []).length;
  const english = (text.match(/[a-zA-Z]+/g) || []).length;
  return korean + english;
}

function countHeadings(text: string): number {
  return (text.match(/^##\s/gm) || []).length;
}

function countKeyword(text: string, keyword: string): number {
  if (!keyword) return 0;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(escaped, 'gi')) || []).length;
}

/**
 * 의미 보존 검증용 수치 집합 추출
 *
 * 목록 마커("1) ", "2. ")는 C-9 규칙상 정당하게 사라질 수 있으므로 제외한다.
 */
export function extractFigures(text: string): Set<string> {
  const withoutMarkers = text.replace(/^\s*\d+[.)]\s+/gm, '');
  const matches = withoutMarkers.match(/\d[\d,]*(?:\.\d+)?/g) || [];
  return new Set(matches.map((m) => m.replace(/[,]/g, '').replace(/\.0+$/, '')));
}

/**
 * 수치 토큰 — 자릿수(천·만·억·조)와 단위(원·달러·%…)를 분리해 읽는다.
 *
 * 두 가지를 동시에 만족해야 한다.
 *   1) `10%`와 `10원`은 다른 값이다 (단위 변조 검출)
 *   2) `5000만원`과 `5천만원`은 같은 값이다 (한국어 재표기 허용)
 * 자릿수를 배수로 환산해 값을 정규화하면 둘 다 성립한다. 하나의 alternation으로
 * 두면 `10억원`과 `10억달러`가 모두 `10억`으로 뭉개져 1)이 깨진다.
 */
const FIGURE_SCALE: Record<string, number> = { 천: 1e3, 만: 1e4, 억: 1e8, 조: 1e12 };
const FIGURE_UNIT = '%|퍼센트|원|달러|엔|위안|배|건|일|년|월|주|개|명|포인트|bp';
// 자릿수는 연달아 붙는다: `5천만` = 5 × 1e3 × 1e4 = 5e7 = `5000만`.
// 하나만 받으면 `5천만원`이 `5천`(=5000, 단위 없음)으로 잘려 `5000만원`과 달라진다.
const FIGURE_TOKEN_RE = new RegExp(
  `(\\d[\\d,]*(?:\\.\\d+)?)\\s*([천만억조]*)\\s*((?:${FIGURE_UNIT})?)`,
  'g',
);

/**
 * 같은 뜻의 단위를 하나로 모은다.
 *
 * 윤문이 `20퍼센트`를 `20%`로 바꾸는 것은 정당한 재표기인데, 별개 단위로 두면
 * "수치 유실·단위 변형"으로 반려된다(실측 e2e에서 이 사유로 1편 반려).
 */
function normalizeUnit(unit: string): string {
  if (unit === '퍼센트') return '%';
  return unit;
}

interface FigureToken {
  /** 자릿수를 환산한 값 */
  readonly value: number;
  /** 단위. 빈 문자열이면 맨 숫자다. */
  readonly unit: string;
}

function parseFigureTokens(text: string): FigureToken[] {
  // 전각(％ ０-９)을 반각으로 맞춘다. 모델이 표기만 정규화해도 "유실"로 오판하기 때문이다.
  const normalized = text
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/％/g, '%')
    .replace(/，/g, ',');
  // 목록 마커("1) ", "2. ")는 C-9 규칙상 정당하게 사라질 수 있으므로 제외한다.
  const withoutMarkers = normalized.replace(/^\s*\d+[.)]\s+/gm, '');

  const tokens: FigureToken[] = [];
  for (const m of withoutMarkers.matchAll(FIGURE_TOKEN_RE)) {
    const base = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(base)) continue;
    const scale = [...(m[2] ?? '')].reduce((acc, ch) => acc * (FIGURE_SCALE[ch] ?? 1), 1);
    tokens.push({ value: base * scale, unit: normalizeUnit(m[3] ?? '') });
  }
  return tokens;
}

/** 단위가 붙은 토큰의 개수 맵 — 단위 변조·개수 유실을 잡는다 */
export function countFigureTokens(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of parseFigureTokens(text)) {
    const key = `${t.value}${t.unit}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}



/** 원문에 없던 볼드가 새로 생겼을 때만 제거 (하우스 스타일: 볼드 금지) */
function stripIntroducedBold(original: string, candidate: string): string {
  if (original.includes('**')) return candidate;
  return candidate.replace(/\*\*\*?/g, '');
}

// --- 판정 ---

/**
 * 윤문본 채택 여부 판정 — 순수 함수, 네트워크 없음
 *
 * @param original - 윤문 전 본문
 * @param candidate - 모델이 돌려준 윤문본
 * @param targetKeyword - SEO 타겟 키워드
 */
export function evaluateHumanization(
  original: string,
  candidate: string,
  targetKeyword: string
): HumanizeVerdict {
  const reject = (reason: string, rate = 0): HumanizeVerdict => ({
    accepted: false,
    text: original,
    changeRate: rate,
    reason,
  });

  const cleaned = stripIntroducedBold(original, candidate).trim();

  if (!cleaned) return reject('빈 응답');

  // validateContent의 본문 최소 길이(500자) 하한을 깨뜨리면 저장 단계에서 터진다
  if (cleaned.length < HUMANIZE_CONFIG.minContentLength) {
    return reject(`윤문본이 최소 길이 미달 (${cleaned.length}자)`);
  }

  const { rate, tokenization } = changeRateDetailed(original, cleaned, { ignoreMarkup: true });

  // 어절 강등은 임계값과 척도가 어긋난다 — 반려하되 사유에 드러내 원인을 추적할 수 있게 한다
  const scale = tokenization === 'word' ? ' (어절 단위 비교 — 본문 과대)' : '';

  if (rate >= CHANGE_RATE_ABORT) {
    return reject(`과윤문 — 변경률 ${(rate * 100).toFixed(1)}%${scale}`, rate);
  }

  // 철칙 #1: 헤딩 구조는 불변. 품질 점수의 가독성 항목도 여기에 걸려 있다
  const headingsBefore = countHeadings(original);
  const headingsAfter = countHeadings(cleaned);
  if (headingsBefore !== headingsAfter) {
    return reject(`헤딩 구조 변경 (${headingsBefore} → ${headingsAfter})`, rate);
  }

  // 철칙 #1: 수치 보존. 단위가 붙은 값과 맨 숫자를 다르게 다룬다.
  //
  // 맨 숫자(1, 2, 3…)에 개수 비교를 걸면 목록 마커·서수 정리 같은 정당한 윤문이
  // 전부 반려된다(실측: 3편 중 2편 반려 + 서킷브레이커 개방). 맨 숫자는 "값이
  // 사라졌는가"만 본다(집합 비교, 기존 동작). 단위가 붙은 값은 개수까지 본다 —
  // 단위 변조와 중복 삭제가 실제 위험이기 때문이다.
  const beforeTokens = parseFigureTokens(original);
  const afterTokens = parseFigureTokens(cleaned);

  // 한 자리 맨 숫자(1~9)는 유실 검사에서 뺀다. 대부분 서수·목록 번호이고,
  // 문장으로 풀어 쓰는 정당한 윤문이 전부 반려됐다(실측 3편 중 2편).
  // RSI 30·70처럼 정보를 담은 값은 두 자리 이상이라 그대로 보호된다.
  const informative = (t: { unit: string; value: number }) => !t.unit && t.value >= 10;
  const bareBefore = new Set(beforeTokens.filter(informative).map((t) => t.value));
  const bareAfter = new Set(afterTokens.filter((t) => !t.unit).map((t) => t.value));
  const lostBare = [...bareBefore].filter((v) => !bareAfter.has(v));
  if (lostBare.length > 0) {
    return reject(`수치 유실 (${lostBare.slice(0, 5).join(', ')})`, rate);
  }

  const unitKey = (t: { unit: string; value: number }) => `${t.value}${t.unit}`;
  const unitBefore = new Map<string, number>();
  for (const t of beforeTokens.filter((x) => x.unit)) unitBefore.set(unitKey(t), (unitBefore.get(unitKey(t)) ?? 0) + 1);
  const unitAfter = new Map<string, number>();
  for (const t of afterTokens.filter((x) => x.unit)) unitAfter.set(unitKey(t), (unitAfter.get(unitKey(t)) ?? 0) + 1);

  const lostUnit = [...unitBefore.entries()].filter(([k, n]) => (unitAfter.get(k) ?? 0) < n).map(([k]) => k);
  if (lostUnit.length > 0) {
    return reject(`수치 유실·단위 변형 (${lostUnit.slice(0, 5).join(', ')})`, rate);
  }
  // 없던 수치가 생기는 것은 윤문이 아니라 창작이다. YMYL에서는 지어낸 통계가 된다.
  const invented = [...unitAfter.keys()].filter((k) => !unitBefore.has(k));
  if (invented.length > 0) {
    return reject(`원문에 없던 수치 추가 (${invented.slice(0, 5).join(', ')})`, rate);
  }
  // 개수 증가도 창작이다. 기존 값을 재사용해 새 사실을 만드는 경로가 있다:
  //   원문 "매출은 10% 증가했습니다"
  //   윤문 "매출은 10% 증가했고 영업이익도 10% 증가했습니다"
  // 키가 원문에 있다는 이유로 통과하던 구멍이다.
  const duplicated = [...unitAfter.entries()]
    .filter(([k, n]) => n > (unitBefore.get(k) ?? 0))
    .map(([k]) => k);
  if (duplicated.length > 0) {
    return reject(`수치 반복 추가 (${duplicated.slice(0, 5).join(', ')})`, rate);
  }
  // 정보성 맨 숫자(두 자리 이상)의 신규 등장도 막는다 — "목표 지수는 85입니다" 같은 창작.
  const newBare = [...bareAfter].filter((v) => v >= 10 && !bareBefore.has(v));
  if (newBare.length > 0) {
    return reject(`원문에 없던 수치 추가 (${newBare.slice(0, 5).join(', ')})`, rate);
  }

  // SEO: 키워드 빈도가 품질 점수 기준(3회) 아래로 떨어지면 안 된다
  const keywordBefore = countKeyword(original, targetKeyword);
  const keywordAfter = countKeyword(cleaned, targetKeyword);
  if (keywordAfter < Math.min(keywordBefore, HUMANIZE_CONFIG.minKeywordCount)) {
    return reject(`키워드 빈도 하락 (${keywordBefore} → ${keywordAfter})`, rate);
  }

  // 분량 붕괴 방지 — 품질 점수의 길이 항목 보호
  const wordsBefore = countWords(original);
  const wordsAfter = countWords(cleaned);
  if (wordsAfter < wordsBefore * (1 - HUMANIZE_CONFIG.maxWordLossRatio)) {
    return reject(`분량 과다 축소 (${wordsBefore} → ${wordsAfter} 어절)`, rate);
  }

  // AI 티 델타 — 윤문의 존재 이유가 AI 문체 제거이므로 계량 축이 악화하면 반려.
  // 절대 임계는 쓰지 않는다(사람 글과 AI 글의 절대값 분포가 겹친다는 걸 실측으로 확인).
  const worse = humanizeMadeItWorse(measureAiTell(original), measureAiTell(cleaned));
  if (worse) {
    return reject(`AI 티 악화 — ${worse}`, rate);
  }

  return {
    accepted: true,
    text: cleaned,
    changeRate: rate,
    reason: rate >= CHANGE_RATE_WARN ? `변경률 경고 ${(rate * 100).toFixed(1)}%${scale}` : null,
  };
}

// --- 실행 ---

/** 윤문 활성화 여부 — `BLOG_HUMANIZE=off`로 끌 수 있다 */
function isEnabled(): boolean {
  return process.env.BLOG_HUMANIZE !== 'off';
}

/**
 * 윤문 결과 상태.
 *
 * `unchanged`가 따로 있는 이유: 문자열 비교로 성공/실패를 추론하면 "고칠 게 없어
 * 그대로 돌려준 정상 응답"이 반려와 구분되지 않는다. 호출부(pipeline)는 반려를
 * 서킷브레이커로 세므로, 그 오인이 두 번 겹치면 그날 파이프라인 전체가 멈춘다.
 */
export type HumanizeStatus = 'accepted' | 'error' | 'rejected' | 'skipped' | 'unchanged';

export interface HumanizeResult {
  readonly reason?: string;
  readonly status: HumanizeStatus;
  readonly text: string;
}

/**
 * 본문 1건 윤문 — 판정과 결과를 함께 돌려준다.
 *
 * @param content - 윤문 대상 마크다운 본문
 * @param targetKeyword - SEO 타겟 키워드
 */
export async function humanizeWithVerdict(content: string, targetKeyword: string): Promise<HumanizeResult> {
  if (!isEnabled()) {
    console.log('[Humanize] 비활성화됨 (BLOG_HUMANIZE=off) — 원문 유지');
    return { status: 'skipped', text: content, reason: 'BLOG_HUMANIZE=off' };
  }

  if (content.length < HUMANIZE_CONFIG.minContentLength) {
    console.log(`[Humanize] 본문이 짧아 건너뜀 (${content.length}자)`);
    return { status: 'skipped', text: content, reason: `본문 ${content.length}자` };
  }

  const start = Date.now();

  try {
    const response = await generateText({
      prompt: buildHumanizePrompt({ content, targetKeyword }),
      config: {
        temperature: HUMANIZE_CONFIG.temperature,
        responseMimeType: 'text/plain',
      },
      timeout: HUMANIZE_CONFIG.timeout,
    });

    if (!response) {
      console.warn('[Humanize] 빈 응답 — 원문 유지');
      return { status: 'error', text: content, reason: '빈 응답' };
    }

    const verdict = evaluateHumanization(content, extractHumanized(response), targetKeyword);
    const elapsed = Date.now() - start;

    if (!verdict.accepted) {
      console.warn(`[Humanize] 반려 (${elapsed}ms): ${verdict.reason} — 원문 유지`);
      return { status: 'rejected', text: content, reason: verdict.reason ?? undefined };
    }

    const rate = `${(verdict.changeRate * 100).toFixed(1)}%`;
    if (verdict.reason) {
      console.warn(`[Humanize] 채택 (${elapsed}ms, 변경률 ${rate}): ${verdict.reason}`);
    } else {
      console.log(`[Humanize] 채택 (${elapsed}ms, 변경률 ${rate})`);
    }

    // 모델이 고칠 게 없다고 판단해 원문을 그대로 돌려준 경우다. 정상 성공이다.
    if (verdict.text === content) {
      return { status: 'unchanged', text: content, reason: '변경 없음(원문이 이미 통과)' };
    }
    return { status: 'accepted', text: verdict.text, reason: verdict.reason ?? undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Humanize] 실패 (${Date.now() - start}ms): ${message} — 원문 유지`);
    return { status: 'error', text: content, reason: message };
  }
}

/** 본문만 필요한 호출부용 얇은 래퍼 */
export async function humanizeText(content: string, targetKeyword: string): Promise<string> {
  return (await humanizeWithVerdict(content, targetKeyword)).text;
}

/**
 * 생성된 콘텐츠의 본문을 윤문한 새 객체 반환
 *
 * 제목·메타 필드는 SEO 키워드 배치가 걸려 있어 건드리지 않는다.
 *
 * @param content - 생성된 블로그 콘텐츠
 * @param targetKeyword - SEO 타겟 키워드
 */
export interface HumanizeOutcome {
  /** 윤문본이 채택됐는가. false면 content는 원문 그대로다. */
  readonly accepted: boolean;
  /** 실패 원인 구분 — 호출부가 시스템 장애와 콘텐츠 반려를 다르게 다룬다 */
  readonly status: HumanizeStatus;
  /** 의도적 스킵(BLOG_HUMANIZE=off, 본문 최소길이 미달) — 실패가 아니므로 발행을 막지 않는다 */
  readonly skipped: boolean;
  readonly content: GeneratedContent;
}

/**
 * 판정을 그대로 올려보낸다. 예전에는 `humanized !== content.content` 문자열 비교로
 * 채택 여부를 추론했는데, 그러면 정상적인 "변경 없음"이 반려로 잡혀 서킷브레이커가
 * 열린다. 상태값을 그대로 쓰면 그 오인이 없다.
 */
export async function humanizeGeneratedContent(
  content: GeneratedContent,
  targetKeyword: string
): Promise<HumanizeOutcome> {
  // 운영자가 명시적으로 끈 경우(BLOG_HUMANIZE=off)와 본문이 짧아 윤문 대상이 아닌 경우는
  // "실패"가 아니라 "스킵"이다 — 이걸 실패로 치면 킬스위치가 파이프라인 전체를 세운다.
  const verdict = await humanizeWithVerdict(content.content, targetKeyword);

  if (verdict.status === 'skipped') return { accepted: false, skipped: true, status: verdict.status, content };
  // unchanged는 성공이다 — 원문을 그대로 쓰되 실패로 세지 않는다
  if (verdict.status === 'unchanged') return { accepted: true, skipped: false, status: verdict.status, content };
  if (verdict.status === 'accepted') {
    return { accepted: true, skipped: false, status: verdict.status, content: { ...content, content: verdict.text } };
  }
  return { accepted: false, skipped: false, status: verdict.status, content };
}
