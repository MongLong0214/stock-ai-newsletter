import { describe, expect, it } from 'vitest';
import { summarizePageShapes } from '@/scripts/tli/collectors/naver-finance-themes';

/**
 * 네이버에 접속하지 않는다 — 전부 픽스처다.
 *
 * 2026-09-10 회귀: 게이트 4종이 239/239 테마에 동시에 떴지만 전부 "행 0개"의 파생이라
 * 원인을 좁혀주지 못했고, 붕괴 메시지가 "셀렉터 파손 가능성"이라고 단정해 조사가
 * 잘못된 방향으로 갔다. 실제로는 HTTP 200 + 테이블 전무(차단·점검 페이지)였다.
 */
const blockedPage = (overrides: Partial<{ bytes: number; status: number; tableCount: number; title: string }> = {}) => ({
  bytes: 1_240,
  status: 200,
  tableCount: 0,
  title: '네이버 :: 세상의 모든 지식, 네이버',
  ...overrides,
});

const brokenSelectorPage = () => ({
  bytes: 84_000,
  status: 200,
  tableCount: 1,
  title: '테마별 시세 : 네이버 금융',
});

describe('summarizePageShapes', () => {
  it('표본이 없으면 그렇게 말한다', () => {
    expect(summarizePageShapes([])).toContain('지문 없음');
  });

  it('테이블이 전무하면 차단·점검 페이지를 지목한다', () => {
    const summary = summarizePageShapes([blockedPage(), blockedPage(), blockedPage()]);
    expect(summary).toContain('차단·점검 페이지');
    // 셀렉터 파손을 단정하면 안 된다 — 그게 2026-09-10 조사를 오도했다
    expect(summary).not.toMatch(/셀렉터 파손 가능성이 크다/);
  });

  it('테이블이 남아 있으면 셀렉터·컬럼 변경을 지목한다', () => {
    const summary = summarizePageShapes([brokenSelectorPage(), brokenSelectorPage()]);
    expect(summary).toContain('셀렉터·컬럼 구조 변경');
    expect(summary).not.toContain('차단·점검 페이지');
  });

  it('두 해석이 서로 다르다 — 로그만 보고 갈릴 수 있어야 한다', () => {
    expect(summarizePageShapes([blockedPage()])).not.toBe(summarizePageShapes([brokenSelectorPage()]));
  });

  it('HTTP 상태·본문 크기·title을 남긴다', () => {
    const summary = summarizePageShapes([blockedPage(), blockedPage({ bytes: 1_260 })]);
    expect(summary).toContain('200');
    expect(summary).toContain('1,240');
    expect(summary).toContain('1,260');
    expect(summary).toContain('네이버 :: 세상의 모든 지식');
  });

  it('빈 title도 표기한다', () => {
    expect(summarizePageShapes([blockedPage({ title: '' })])).toContain('(빈 제목)');
  });

  it('상태코드가 섞이면 함께 센다', () => {
    const summary = summarizePageShapes([blockedPage(), blockedPage({ status: 503 })]);
    expect(summary).toContain('200');
    expect(summary).toContain('503');
  });
});
