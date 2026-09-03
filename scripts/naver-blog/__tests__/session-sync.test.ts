import { describe, expect, it } from 'vitest';
import { authFingerprint, classifyFailure, hasAuthCookies } from '../session-sync';

const state = (cookies: Array<{ domain?: string; name: string; value: string }>) => ({
  cookies: cookies.map((c) => ({ domain: c.domain ?? '.naver.com', name: c.name, value: c.value })),
});

describe('authFingerprint', () => {
  it('같은 쿠키면 같은 지문, 회전하면 달라진다', () => {
    const a = authFingerprint(state([{ name: 'NID_AUT', value: 'aaa' }, { name: 'NID_SES', value: 'bbb' }]));
    const same = authFingerprint(state([{ name: 'NID_AUT', value: 'aaa' }, { name: 'NID_SES', value: 'bbb' }]));
    const rotated = authFingerprint(state([{ name: 'NID_AUT', value: 'aaa' }, { name: 'NID_SES', value: 'ZZZ' }]));
    expect(a).toBe(same);
    expect(a).not.toBe(rotated);
  });

  // 지문은 로그로 나간다 — 쿠키 원문이 섞이면 자격증명이 CI 로그에 남는다
  it('쿠키 값 원문을 담지 않는다', () => {
    const fp = authFingerprint(state([{ name: 'NID_AUT', value: 'super-secret-cookie' }]));
    expect(fp).not.toContain('super-secret-cookie');
  });

  it('없는 쿠키는 빈 표시로 남긴다', () => {
    expect(authFingerprint(state([]))).toContain('NID_AUT=-');
  });

  it('네이버 도메인이 아닌 동명 쿠키는 세지 않는다', () => {
    const other = authFingerprint(state([{ domain: '.example.com', name: 'NID_AUT', value: 'x' }]));
    expect(other).toContain('NID_AUT=-');
  });
});

describe('hasAuthCookies', () => {
  it('NID_AUT 유무로 판단한다', () => {
    expect(hasAuthCookies(state([{ name: 'NID_AUT', value: 'x' }]))).toBe(true);
    expect(hasAuthCookies(state([{ name: 'NNB', value: 'x' }]))).toBe(false);
  });
});

describe('classifyFailure', () => {
  // 이 구분이 핵심이다. 일시 오류를 만료로 보면 필요 없는 로그인을 시키고,
  // 만료를 일시 오류로 보면 재시도만 반복하다 발행이 조용히 밀린다.
  it('만료 신호는 expired', () => {
    for (const m of [
      '세션이 만료되었습니다 (에디터가 로그인 페이지로 리다이렉트)',
      'redirected to https://nid.naver.com/nidlogin.login',
      '세션 계정(MyBlog)이 발행 대상(stock-matrix)과 다릅니다',
      '로그인이 필요합니다',
    ]) {
      expect(classifyFailure(m), m).toBe('expired');
    }
  });

  it('네트워크·타임아웃은 transient', () => {
    for (const m of [
      'page.goto: net::ERR_CONNECTION_RESET',
      'Timeout 30000ms exceeded',
      'browserType.launch: Target closed',
      'net::ERR_NAME_NOT_RESOLVED',
    ]) {
      expect(classifyFailure(m), m).toBe('transient');
    }
  });
});
