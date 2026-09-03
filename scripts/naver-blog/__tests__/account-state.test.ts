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
const CAPTCHA_PAGE = {
  text: '보안문자 이미지에 보이는 문자를 입력해 주세요',
  url: 'https://nid.naver.com/nidlogin.login',
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
