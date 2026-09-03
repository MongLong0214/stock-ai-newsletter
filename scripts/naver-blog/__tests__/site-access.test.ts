import { afterEach, describe, expect, it } from 'vitest';
import { BYPASS_HEADER, describeSiteFailure, siteBypassHeaders } from '../site-access';

const original = process.env.STOCKMATRIX_BYPASS_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.STOCKMATRIX_BYPASS_SECRET;
  else process.env.STOCKMATRIX_BYPASS_SECRET = original;
});

describe('siteBypassHeaders', () => {
  it('비밀값이 있으면 우회 헤더를 붙인다', () => {
    process.env.STOCKMATRIX_BYPASS_SECRET = 's3cret';
    expect(siteBypassHeaders()).toEqual({ [BYPASS_HEADER]: 's3cret' });
  });

  it('비밀값이 없으면 헤더를 만들지 않는다 — 챌린지가 꺼진 환경도 돌아야 한다', () => {
    delete process.env.STOCKMATRIX_BYPASS_SECRET;
    expect(siteBypassHeaders()).toEqual({});
  });
});

describe('describeSiteFailure', () => {
  it('429는 방화벽 챌린지로 설명한다 — 비밀값 미설정을 지목한다', () => {
    delete process.env.STOCKMATRIX_BYPASS_SECRET;
    const message = describeSiteFailure('/api/tli/scores/ranking', 429);
    expect(message).toContain('방화벽 챌린지');
    expect(message).toContain('STOCKMATRIX_BYPASS_SECRET이 설정되지 않았습니다');
  });

  it('비밀값이 있는데도 429면 값 불일치를 지목한다', () => {
    process.env.STOCKMATRIX_BYPASS_SECRET = 'wrong';
    expect(describeSiteFailure('/x', 429)).toContain('일치하는지 확인');
  });

  it('429가 아니면 상태코드만 남긴다', () => {
    expect(describeSiteFailure('/x', 500)).toBe('/x → 500');
  });

  // 비밀값이 에러 메시지에 실려 CI 로그·이슈 본문으로 나가면 안 된다
  it('비밀값 자체를 메시지에 넣지 않는다', () => {
    process.env.STOCKMATRIX_BYPASS_SECRET = 'super-secret-value';
    expect(describeSiteFailure('/x', 429)).not.toContain('super-secret-value');
  });
});
