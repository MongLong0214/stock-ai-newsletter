import { describe, expect, it } from 'vitest';
import { publishFailureDetail } from '../publish';

/**
 * 2026-09-03 회귀 테스트.
 *
 * `outcome === 'error'`가 성격이 다른 두 실패를 한 문구로 묶었다. 실제로 발생한 것은
 * 전면 에러 페이지(서버측 거부, 원인은 계정 보호조치)인데 메시지는 "문서가 너무 크거나
 * 이미지 처리 실패"를 가리켰다. 그 오도로 문서 크기·이미지를 몇 시간 조사했다.
 */
describe('publishFailureDetail', () => {
  it('전면 에러 페이지는 문서 원인을 단정하지 않는다', () => {
    const message = publishFailureDetail('page-error');
    expect(message).not.toMatch(/문서가 너무 크|이미지 처리 실패/);
    expect(message).toContain('문서 문제가 아닐 가능성');
  });

  it('전면 에러 페이지는 계정 상태를 먼저 의심하게 한다', () => {
    const message = publishFailureDetail('page-error');
    expect(message).toContain('계정 상태를 먼저 확인');
    expect(message).toMatch(/보호조치/);
  });

  it('에디터 팝업 오류는 문서 원인을 조사하게 한다', () => {
    const message = publishFailureDetail('editor-error');
    expect(message).toMatch(/문서 크기|이미지 개수/);
  });

  it('두 실패의 문구가 서로 다르다', () => {
    expect(publishFailureDetail('editor-error')).not.toBe(publishFailureDetail('page-error'));
  });

  it('둘 다 게시되지 않았음을 분명히 말한다', () => {
    for (const outcome of ['editor-error', 'page-error'] as const) {
      expect(publishFailureDetail(outcome)).toContain('게시되지 않았습니다');
    }
  });

  // timeout은 결과 미확인이다 — 게시 안 됐다고 단정하면 중복 발행을 부른다
  it('timeout은 게시 여부를 단정하지 않는다', () => {
    const message = publishFailureDetail('timeout');
    expect(message).not.toContain('게시되지 않았습니다');
    expect(message).toContain('직접 확인');
  });
});
