import { describe, expect, it } from 'vitest';
import { assertNoCtaTail, planBodyActions } from '../publish-plan';
import type { ImagePlacement } from '../draft-model';

const place = (id: string, afterBlock: string): ImagePlacement => ({
  id,
  afterBlock,
  caption: `${id} 캡션`,
  capturedAt: '2026-08-26T00:00:00.000Z',
  path: `/tmp/${id}.png`,
  sha256: 'abc',
  sourceSection: id,
});

describe('본문 배치', () => {
  it('슬롯 위치에 이미지를 넣고 CTA를 마지막에 둔다', () => {
    const body = [
      '도입 문단입니다.',
      '{{image:1-hero}}',
      '>> 점수 현황',
      '점수 설명',
      '{{image:2-stocks}}',
      '>> 정리',
      '요약',
      'https://stockmatrix.co.kr/themes/x',
    ].join('\n\n');

    const actions = planBodyActions(body, [place('1-hero', 'intro'), place('2-stocks', 'stocks')]);
    expect(actions.map((a) => a.kind)).toEqual([
      'paragraph', 'image', 'quote', 'paragraph', 'image', 'quote', 'paragraph', 'oglink',
    ]);
    expect(actions.at(-1)).toMatchObject({ kind: 'oglink' });
    assertNoCtaTail(actions);
  });

  it('캡처되지 않은 슬롯은 건너뛰고, 남은 이미지를 끝에 붙이지 않는다', () => {
    const body = [
      '도입',
      '{{image:1-hero}}',
      '{{image:3-trend}}',
      '본문',
      'https://stockmatrix.co.kr/themes/x',
    ].join('\n\n');

    const actions = planBodyActions(body, [place('1-hero', 'intro')]);
    expect(actions.filter((a) => a.kind === 'image')).toHaveLength(1);
    expect(() => planBodyActions(body, [place('1-hero', 'intro'), place('4-pattern', 'end')])).toThrow(
      /배치되지 않은 이미지/,
    );
  });

  it('CTA 뒤 이미지 3장 연속 삽입을 거부한다', () => {
    const body = [
      '도입',
      'https://stockmatrix.co.kr/themes/x',
      '{{image:4-pattern}}',
      '{{image:5-outlook}}',
      '{{image:6-news}}',
    ].join('\n\n');
    expect(() =>
      planBodyActions(body, [place('4-pattern', 'end'), place('5-outlook', 'end'), place('6-news', 'end')]),
    ).toThrow();
  });

  it('인용구는 제목 한 줄만 액션으로 남긴다', () => {
    const body = ['>> 점수 현황', '점수 설명 본문', 'https://stockmatrix.co.kr/x'].join('\n\n');
    const actions = planBodyActions(body, []);
    expect(actions[0]).toEqual({ kind: 'quote', text: '점수 현황' });
    expect(actions[1]).toEqual({ kind: 'paragraph', text: '점수 설명 본문' });
  });
});
