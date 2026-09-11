import { describe, expect, it } from 'vitest';
import { summarizeResponseShapes } from '@/scripts/tli/collectors/naver-finance-themes';

/**
 * 네이버에 접속하지 않는다 — 전부 픽스처다.
 *
 * 2026-09-10 회귀: `finance.naver.com/sise/sise_group_detail.naver`가
 * `stock.naver.com`으로 이전되면서 239/239 테마가 게이트 실패했는데, 로그에는
 * "행 0개"의 파생 게이트 4종만 찍혀 원인이 리다이렉트라는 사실이 드러나지 않았다.
 * 그래서 진단의 1순위는 리다이렉트 여부다.
 */
const migrated = (over: Partial<{ bytes: number; finalUrl: string; redirected: boolean; status: number; stockCount: number }> = {}) => ({
  bytes: 122_473,
  finalUrl: 'https://stock.naver.com/market/stock/kr/theme/579',
  redirected: true,
  status: 200,
  stockCount: 0,
  ...over,
});

const emptyButSameUrl = () => ({
  bytes: 320,
  finalUrl: 'https://m.stock.naver.com/api/stocks/theme/579?page=1&pageSize=100',
  redirected: false,
  status: 200,
  stockCount: 0,
});

describe('summarizeResponseShapes', () => {
  it('표본이 없으면 그렇게 말한다', () => {
    expect(summarizeResponseShapes([])).toContain('지문 없음');
  });

  it('리다이렉트가 있으면 엔드포인트 이전·차단을 지목한다', () => {
    const summary = summarizeResponseShapes([migrated(), migrated(), migrated()]);
    expect(summary).toContain('리다이렉트됐다');
    expect(summary).toContain('엔드포인트 이전');
    // 200을 받았다는 이유로 정상이라 오해하지 않게 한다
    expect(summary).toContain('요청한 리소스가 아니다');
  });

  it('최종 URL을 남긴다 — 이게 있었으면 즉시 드러났다', () => {
    expect(summarizeResponseShapes([migrated()])).toContain('stock.naver.com/market/stock/kr/theme/579');
  });

  it('리다이렉트가 없으면 스키마·빈 응답 쪽으로 보낸다', () => {
    const summary = summarizeResponseShapes([emptyButSameUrl(), emptyButSameUrl()]);
    expect(summary).toContain('리다이렉트는 없다');
    expect(summary).not.toContain('엔드포인트 이전');
  });

  it('두 해석이 서로 다르다 — 로그만 보고 갈릴 수 있어야 한다', () => {
    expect(summarizeResponseShapes([migrated()])).not.toBe(summarizeResponseShapes([emptyButSameUrl()]));
  });

  it('HTTP 상태·응답 크기·종목 수를 남긴다', () => {
    const summary = summarizeResponseShapes([migrated(), migrated({ bytes: 122_500, status: 503 })]);
    expect(summary).toContain('200');
    expect(summary).toContain('503');
    expect(summary).toContain('122,473');
  });
});
