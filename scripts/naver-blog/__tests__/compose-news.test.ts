import { describe, expect, it } from 'vitest';
import { composeNews } from '../compose-variants';
import { FORMAT } from '../make-draft';

const plain = (s: string) => s.replace(/>> |\*\*|\[\[[rb]:|\]\]/g, '');
const news = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-08-${String(10 + (i % 17)).padStart(2, '0')}`,
    press: ['한국경제', '매일경제', '연합뉴스', '서울경제'][i % 4],
    title: `면세점 업황 회복 신호 ${i}, 중국 단체관광 재개 영향 분석`,
  }));

const compose = (items: Parameters<typeof composeNews>[3], thisWeek = 23, lastWeek = 15) =>
  composeNews('면세점', 62, '성장', items, thisWeek, lastWeek, '2026-08-27', 'https://stockmatrix.co.kr/themes/x');

describe('composeNews', () => {
  it('기사 수와 무관하게 FORMAT-SPEC을 만족한다', () => {
    for (const n of [5, 8, 14, 50]) {
      const { body, tags, title } = compose(news(n));
      const len = plain(body).length;
      expect(title.length, `${n}건 제목`).toBeGreaterThanOrEqual(FORMAT.titleMin);
      expect(title.length, `${n}건 제목`).toBeLessThanOrEqual(FORMAT.titleMax);
      expect(len, `${n}건 본문`).toBeGreaterThanOrEqual(FORMAT.bodyMin);
      expect(len, `${n}건 본문`).toBeLessThanOrEqual(FORMAT.bodyMax);
      expect(tags.length).toBeGreaterThanOrEqual(FORMAT.tagsMin);
      expect(tags.length).toBeLessThanOrEqual(FORMAT.tagsMax);
    }
  });

  it('중복 제목을 한 번만 싣는다', () => {
    const dup = [...news(3), ...news(3)];
    const body = compose(dup).body;
    expect(body.match(/면세점 업황 회복 신호 0/g)?.length).toBe(1);
  });

  it('광고성 헤드라인은 인용하지 않는다', () => {
    const items = [{ title: '무료 상담 급등주 추천주 지금 신청' }, ...news(6)];
    expect(compose(items).body).not.toContain('급등주');
  });

  it('매체 정보가 없어도 발행 규격을 지킨다', () => {
    const { body } = compose(news(8).map((n) => ({ title: n.title })));
    expect(plain(body).length).toBeGreaterThanOrEqual(FORMAT.bodyMin);
    expect(body).toContain('매체 정보가 표기되지 않았습니다');
  });

  it('날짜가 깨져 있으면 표기를 생략하고 넘어간다', () => {
    const { body } = compose(news(6).map((n) => ({ ...n, date: 'not-a-date' })));
    expect(body).not.toContain('NaN');
    expect(plain(body).length).toBeGreaterThanOrEqual(FORMAT.bodyMin);
  });

  it('기사량 감소를 감소로 서술한다', () => {
    expect(compose(news(6), 4, 9).body).toContain('기사량이 줄었습니다');
    expect(compose(news(6), 9, 4).body).toContain('기사량이 늘었습니다');
  });
});
