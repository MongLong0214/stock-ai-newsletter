import { describe, expect, it } from 'vitest';
import {
  detectAccountBlock,
  describeAccountBlock,
  accountBlockError,
  isAccountBlocked,
} from '../account-state';
import { classifyFailure } from '../session-sync';

/**
 * 픽스처만 쓴다 — 이 테스트는 네이버에 접촉하지 않는다.
 * 화면 문구는 2026-09-03 실측 기준.
 */
const PROTECTION_PAGE = {
  text: '아이디(isaac0214)를 보호하고 있습니다 회원님의 아이디가 도용될 우려가 있어 보호조치 되었습니다',
  url: 'https://nid.naver.com/user2/help/idSafetyRelease?menu=idsafety',
};
/**
 * 2026-09-03 11:2x **실측** 캡차 화면.
 *
 * 초판 패턴은 `추가 인증`만 알아서 이 화면을 session-expired로 오진했고, 그 처방이
 * "직접 로그인하세요"였다 — 감시 중인 계정에 재로그인을 유도하는, 이 모듈이 막으려던
 * 실패 모드 그 자체다. 추측 문구가 아니라 관측값이므로 이 픽스처를 약화시키지 말 것.
 */
const CAPTCHA_PAGE = {
  text:
    '보안을 위해 추가 확인을 해주세요 해당 영수증은 가상으로 제작된 것으로, '
    + '실제 영수증 사진이 아니에요. 모든 물건의 총 구매 금액은 얼마입니까? '
    + '정답을 입력해 주세요 새로고침 음성듣기 확인',
  url: 'https://nid.naver.com/nidlogin.login',
};

/** 2026-09-03 **실측** 보호조치 화면 */
const PROTECTION_PAGE_REAL = {
  text:
    '회원님의 아이디를 보호하고 있습니다. 개인정보보호 및 도용으로 인한 피해를 예방하기 위해 '
    + '아이디(isaac0214)를 보호하고 있습니다. 아이디는 언제 보호되나요? '
    + '아이디/비밀번호 판매사이트 등에서 정보노출이 확인된 경우 스팸메일 발송, '
    + '불법 게시물 작성 등의 행위가 신고 또는 발견된 경우',
  url: 'https://nid.naver.com/user2/help/idSafetyRelease?m=viewIdSafetyInfo',
};

/** 정상 로그인 폼 — 이건 session-expired로 남아야 한다(오탐 방지) */
const NORMAL_LOGIN_FORM = {
  text: '네이버 로그인 아이디 비밀번호 로그인 상태 유지 IP보안 아이디 찾기 비밀번호 찾기 회원가입',
  url: 'https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fblog.naver.com',
};

/** nid 도메인이지만 로그인 폼도 아니고 알려진 차단 문구도 없는 화면 */
const UNKNOWN_NID_PAGE = {
  text: '잠시만 기다려 주세요 처리 중입니다',
  url: 'https://nid.naver.com/some/unseen/path',
};
const RESTRICTED_PAGE = {
  text: '스팸메일 발송, 불법 게시물 작성 등의 행위가 신고 또는 발견되어 이용이 제한되었습니다',
  url: 'https://blog.naver.com/stock-matrix',
};
const EXPIRED_PAGE = {
  text: '네이버 로그인 아이디 비밀번호 로그인 상태 유지',
  url: 'https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fblog.naver.com',
};
const HEALTHY_EDITOR = {
  text: '제목 본문 발행 저장 사진 인용구 링크 맞춤법',
  url: 'https://blog.naver.com/stock-matrix/postwrite',
};

describe('detectAccountBlock', () => {
  it('보호조치를 감지한다', () => {
    expect(detectAccountBlock(PROTECTION_PAGE)?.kind).toBe('protection');
  });

  it('캡차·추가 인증을 감지한다', () => {
    expect(detectAccountBlock(CAPTCHA_PAGE)?.kind).toBe('captcha');
  });

  it('이용제한을 감지한다', () => {
    expect(detectAccountBlock(RESTRICTED_PAGE)?.kind).toBe('restricted');
  });

  it('정상 에디터는 null', () => {
    expect(detectAccountBlock(HEALTHY_EDITOR)).toBeNull();
  });

  /**
   * 2026-09-03 사고의 핵심 회귀.
   *
   * 보호조치·캡차 화면은 세션 만료와 같은 nid.naver.com에 뜬다. 세션 만료로 오진하면
   * "다시 로그인하세요"를 안내하고, 감시 중인 계정에 재로그인을 유도해 보호조치가
   * 재발한다(실제로 그렇게 2회차가 발생했다).
   */
  it('nid.naver.com이라도 보호조치·캡차를 세션 만료로 오진하지 않는다', () => {
    expect(detectAccountBlock(PROTECTION_PAGE)?.kind).not.toBe('session-expired');
    expect(detectAccountBlock(CAPTCHA_PAGE)?.kind).not.toBe('session-expired');
    // 로그인 URL이면서 캡차 문구가 같이 있는 화면은 캡차로 봐야 한다
    expect(detectAccountBlock({ ...CAPTCHA_PAGE, url: EXPIRED_PAGE.url })?.kind).toBe('captcha');
  });

  it('아무 신호도 없는 순수 로그인 페이지만 세션 만료다', () => {
    expect(detectAccountBlock(EXPIRED_PAGE)?.kind).toBe('session-expired');
  });

  it('모든 차단은 재시도 불가로 표시된다', () => {
    for (const probe of [PROTECTION_PAGE, CAPTCHA_PAGE, RESTRICTED_PAGE, EXPIRED_PAGE]) {
      expect(detectAccountBlock(probe)?.retryable).toBe(false);
    }
  });
});

describe('안내 문구', () => {
  it('자동 재시도 금지를 명시한다', () => {
    const block = detectAccountBlock(PROTECTION_PAGE)!;
    expect(describeAccountBlock(block)).toContain('자동 재시도하지 않습니다');
  });

  it('보호조치 안내는 해제 직후 자동화 재개를 경고한다', () => {
    const block = detectAccountBlock(PROTECTION_PAGE)!;
    expect(block.action).toContain('해제 직후');
  });

  it('캡차 안내는 자동으로 풀지 않는다고 명시한다', () => {
    expect(detectAccountBlock(CAPTCHA_PAGE)!.action).toContain('자동으로 캡차를 풀지 않습니다');
  });
});

describe('classifyFailure — 계정 차단은 재시도하지 않는다', () => {
  it('계정 차단 에러는 blocked', () => {
    const message = accountBlockError(detectAccountBlock(PROTECTION_PAGE)!).message;
    expect(isAccountBlocked(message)).toBe(true);
    expect(classifyFailure(message)).toBe('blocked');
  });

  it('네트워크 오류는 여전히 transient', () => {
    expect(classifyFailure('page.goto: net::ERR_CONNECTION_RESET')).toBe('transient');
  });
});

describe('실측 픽스처 회귀 (2026-09-03)', () => {
  it('실측 캡차 화면을 captcha로 잡는다 — session-expired 오진 금지', () => {
    const block = detectAccountBlock(CAPTCHA_PAGE);
    expect(block?.kind).toBe('captcha');
    // 오진 시 나오던 처방이 절대 다시 나오면 안 된다
    expect(block?.action).not.toMatch(/naver:login/);
  });

  it('실측 보호조치 화면을 protection으로 잡는다', () => {
    expect(detectAccountBlock(PROTECTION_PAGE_REAL)?.kind).toBe('protection');
  });

  it('정상 로그인 폼은 session-expired로 남는다 (오탐 방지)', () => {
    const block = detectAccountBlock(NORMAL_LOGIN_FORM);
    expect(block?.kind).toBe('session-expired');
    expect(block?.action).toContain('naver:login');
  });
});

describe('미지 차단 화면의 안전한 기본값', () => {
  /**
   * 차단 화면 문구를 전부 열거하는 건 불가능하다(캡차가 한 글자 차이로 빠진 것이 증거).
   * 그러므로 모르는 nid 화면의 기본값이 안전해야 한다 — "로그인하세요"는 가장 위험한 처방이다.
   */
  it('로그인 폼 신호가 없는 nid 화면은 unknown-block', () => {
    expect(detectAccountBlock(UNKNOWN_NID_PAGE)?.kind).toBe('unknown-block');
  });

  it('unknown-block은 계정 확인을 로그인보다 먼저 안내한다', () => {
    const block = detectAccountBlock(UNKNOWN_NID_PAGE)!;
    const action = block.action;
    expect(action).toContain('계정 상태를 먼저 확인');
    // 순서가 중요하다: 계정 확인이 로그인보다 앞에 와야 한다
    expect(action.indexOf('계정 상태를 먼저 확인')).toBeLessThan(action.indexOf('로그인하세요'));
  });

  it('unknown-block도 재시도 금지이고 blocked로 분류된다', () => {
    const block = detectAccountBlock(UNKNOWN_NID_PAGE)!;
    expect(block.retryable).toBe(false);
    expect(classifyFailure(accountBlockError(block).message)).toBe('blocked');
  });

  it('네이버가 아닌 정상 페이지는 여전히 null', () => {
    expect(detectAccountBlock(HEALTHY_EDITOR)).toBeNull();
  });
});
