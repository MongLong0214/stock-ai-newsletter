/**
 * 계정 상태 감지 — 자동화가 상황을 악화시키지 않게 막는 장치.
 *
 * ## 왜 필요한가 (2026-09-03 사고)
 *
 * 계정에 보호조치가 걸렸는데 파이프라인은 그것을 **세션 만료로 오진**했다. 세션 만료의
 * 처방은 "다시 로그인하세요"다. 감시 중인 계정에 재로그인을 유도하면 접근이 늘고,
 * 실제로 같은 날 보호조치가 2회차로 재발했다.
 *
 * 보호조치·캡차 화면은 세션 만료와 **같은 도메인(nid.naver.com)** 에 뜬다. 그래서
 * URL만 보고 "로그인 페이지네 = 세션 만료"로 단정하면 반드시 오진한다.
 * 이 모듈의 판정 순서가 안전장치다 — 계정 차단 신호를 **먼저** 보고, 그 어느 것도
 * 아닐 때만 단순 세션 만료로 본다.
 *
 * ## 감지되면 절대 재시도하지 않는다
 *
 * 재시도는 접근 빈도를 늘려 상황을 악화시킨다. 사람을 부르고 즉시 끝낸다.
 */

export type AccountBlockKind = 'protection' | 'captcha' | 'restricted' | 'session-expired';

export interface AccountBlock {
  /** 사람이 해야 할 일 — 자동화가 할 수 있는 것은 없다 */
  action: string;
  kind: AccountBlockKind;
  /** 재시도 가능 여부. 계정 차단은 전부 false — 재시도가 상황을 악화시킨다. */
  retryable: false;
  summary: string;
}

/**
 * 보호조치 화면.
 *
 * 실측(2026-09-03): 로그인 시 "아이디(...)를 보호하고 있습니다" 화면이 떴고,
 * 해제 경로는 `nid.naver.com/user2/help/idSafetyRelease`였다.
 */
const PROTECTION_URL = /nid\.naver\.com\/user2\/help\/(idSafetyRelease|contactInfo)|\/user2\/help\/idSafety/i;
const PROTECTION_TEXT = /보호하고 있습니다|보호조치|계정이 보호|본인확인이 필요|안전하게 보호/;

/** 캡차·추가 인증. 사람이 풀어야 한다 — 자동으로 풀지 않는다(그게 이번 사고를 키웠다). */
const CAPTCHA_URL = /captcha|nidcaptcha/i;
const CAPTCHA_TEXT = /보안문자|자동입력 방지|자동입력방지|캡차|이미지에 보이는 문자|추가 인증/;

/** 이용제한·게시 제한. 발행을 시도해도 막히거나 계정을 더 위험하게 만든다. */
const RESTRICTED_TEXT = /이용이 제한|이용제한|사용이 제한|게시(물)? 작성이 제한|일시적으로 제한|스팸.*신고|블로그가 폐쇄/;

/** 단순 세션 만료 — 위 신호가 하나도 없을 때만 이걸로 본다. */
const LOGIN_URL = /nid\.naver\.com\/(nidlogin|login)/i;

export interface PageProbe {
  text: string;
  url: string;
}

/**
 * 계정 차단 신호를 판정한다. null이면 정상.
 *
 * 판정 순서가 곧 안전장치다: 보호조치 → 캡차 → 이용제한 → 세션만료.
 * 세션 만료를 먼저 보면 보호조치를 "재로그인하세요"로 오진한다.
 */
export function detectAccountBlock(probe: PageProbe): AccountBlock | null {
  const { text, url } = probe;

  if (PROTECTION_URL.test(url) || PROTECTION_TEXT.test(text)) {
    return {
      action:
        '네이버에 사람이 직접 접속해 본인확인으로 보호조치를 해제하세요. '
        + '해제 직후 자동화를 켜지 마세요 — 해제 후 재접근이 2회차 보호조치를 불렀습니다(2026-09-03 실측).',
      kind: 'protection',
      retryable: false,
      summary: '계정 보호조치가 걸려 있습니다',
    };
  }

  if (CAPTCHA_URL.test(url) || CAPTCHA_TEXT.test(text)) {
    return {
      action:
        '사람이 직접 로그인해 추가 인증을 통과하세요. 자동으로 캡차를 풀지 않습니다 — '
        + '감시 중인 계정에 자동 접근을 더하면 보호조치가 재발합니다.',
      kind: 'captcha',
      retryable: false,
      summary: '캡차 또는 추가 인증을 요구받았습니다',
    };
  }

  if (RESTRICTED_TEXT.test(text)) {
    return {
      action:
        '네이버 고객센터 안내를 사람이 확인하세요. 제한이 풀릴 때까지 자동 발행을 켜지 마세요.',
      kind: 'restricted',
      retryable: false,
      summary: '계정 또는 블로그 이용이 제한된 상태입니다',
    };
  }

  if (LOGIN_URL.test(url)) {
    return {
      action:
        'npm run naver:login 으로 사람이 직접 로그인하세요. '
        + '단 보호조치·캡차 화면이 함께 보이면 로그인을 반복하지 말고 계정 상태를 먼저 확인하세요.',
      kind: 'session-expired',
      retryable: false,
      summary: '세션이 만료되었습니다',
    };
  }

  return null;
}

/** 계정 차단 신호가 사람에게 보일 메시지. 자동 재시도 금지를 명시한다. */
export function describeAccountBlock(block: AccountBlock): string {
  return [
    `${block.summary} (${block.kind})`,
    '',
    `조치: ${block.action}`,
    '',
    '자동 재시도하지 않습니다 — 반복 접근은 계정 상태를 악화시킵니다.',
  ].join('\n');
}

/**
 * 에러 메시지에 심는 표식.
 *
 * 커스텀 Error 클래스를 쓰지 않는다(conventions.md 안티패턴 6). 대신 표식을 넣고
 * 호출부가 `isAccountBlocked()`로 재시도 루프에서 즉시 빠져나온다 —
 * session-sync의 classifyFailure가 이미 메시지 기반으로 분기하는 것과 같은 방식이다.
 */
export const ACCOUNT_BLOCK_MARKER = '[ACCOUNT_BLOCK]';

/** 계정 차단을 알리는 에러 메시지. 코드로 풀 수 없으므로 재시도하지 않는다. */
export function accountBlockError(block: AccountBlock): Error {
  return new Error(`${ACCOUNT_BLOCK_MARKER} ${describeAccountBlock(block)}`);
}

export function isAccountBlocked(message: string): boolean {
  return message.includes(ACCOUNT_BLOCK_MARKER);
}
