import { describe, expect, it } from 'vitest';
import { composeEvergreen, EVERGREEN_TOPIC_COUNT } from '../compose-evergreen';
import { FORMAT } from '../make-draft';
import { stripFormat } from '../draft-model';

const ctx = {
  sampledThemes: 238,
  asOf: '2026-08-27',
  risers7d: 41,
  topName: '폐기물처리',
  topScore: 62,
  topStageKo: '성장',
};

const plain = (s: string) => stripFormat(s);

describe('composeEvergreen', () => {
  it('모든 주제가 FORMAT-SPEC을 만족한다', () => {
    for (let i = 0; i < EVERGREEN_TOPIC_COUNT; i++) {
      const { body, tags, title } = composeEvergreen(i, ctx, 'https://stockmatrix.co.kr');
      const len = plain(body).length;
      expect(title.length, `${title} 제목 길이`).toBeGreaterThanOrEqual(FORMAT.titleMin);
      expect(title.length, `${title} 제목 길이`).toBeLessThanOrEqual(FORMAT.titleMax);
      expect(len, `${title} 본문 길이`).toBeGreaterThanOrEqual(FORMAT.bodyMin);
      expect(len, `${title} 본문 길이`).toBeLessThanOrEqual(FORMAT.bodyMax);
      expect(tags.length).toBeGreaterThanOrEqual(FORMAT.tagsMin);
      expect(tags.length).toBeLessThanOrEqual(FORMAT.tagsMax);
    }
  });

  it('주제가 7종이라 재등장 간격이 7주다', () => {
    const slugs = Array.from({ length: EVERGREEN_TOPIC_COUNT }, (_, i) => composeEvergreen(i, ctx, '').slug);
    expect(new Set(slugs).size).toBe(EVERGREEN_TOPIC_COUNT);
    expect(composeEvergreen(EVERGREEN_TOPIC_COUNT, ctx, '').slug).toBe(slugs[0]);
  });

  it('음수 인덱스에서도 유효한 주제를 고른다', () => {
    expect(composeEvergreen(-1, ctx, '').slug).toBe(composeEvergreen(EVERGREEN_TOPIC_COUNT - 1, ctx, '').slug);
  });

  it('본문에 오늘 수치가 들어간다 — 같은 주제라도 발행일마다 달라진다', () => {
    const a = composeEvergreen(0, ctx, 'https://x').body;
    const b = composeEvergreen(0, { ...ctx, sampledThemes: 240, risers7d: 55, topScore: 70 }, 'https://x').body;
    expect(a).not.toBe(b);
  });

  it('투자 권유 문구를 넣지 않는다', () => {
    for (let i = 0; i < EVERGREEN_TOPIC_COUNT; i++) {
      const body = composeEvergreen(i, ctx, '').body.replace(/특정 종목의 매수·매도를 권하는 것이 아니며/g, '');
      expect(body).not.toMatch(/추천(?:합니다|드립니다)|매수하세요|사야|유망주/);
    }
  });
});
