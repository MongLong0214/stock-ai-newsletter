import { describe, expect, it } from 'vitest';
import { checkFormat, FORMAT } from '../format';

const bolds = Array.from({ length: 10 }, (_, i) => `**항목${i}**`).join(' ');
const valid = {
  body: [
    `폐기물처리 관련주 5개를 묶은 테마 점수가 이번 주 45점을 기록했습니다. ${bolds}`,
    '>> 점수 현황',
    '점수 설명 '.repeat(80),
    '>> 네 가지 요소',
    '요소 설명 '.repeat(80),
    '>> 관련종목 5개',
    '종목 설명 '.repeat(80),
    '>> 정리',
    '이 점수는 참고용 데이터입니다. 특정 종목의 매수·매도를 권하는 것이 아니며, 투자 판단과 그 결과는 투자자 본인의 책임입니다.',
  ].join('\n\n'),
  images: ['a.png', 'b.png', 'c.png', 'd.png'],
  outsideUrl: 'https://stockmatrix.co.kr/themes/x',
  tags: Array.from({ length: 8 }, (_, i) => `태그${i}`),
  title: '폐기물처리 관련주 TOP 5 — 정점 단계, 점수 45점 (2026.08)',
};

describe('checkFormat', () => {
  it('규격을 만족하면 위반이 없다', () => {
    expect(checkFormat(valid)).toEqual([]);
  });

  it('이미지가 최소 장수보다 적으면 잡는다', () => {
    expect(checkFormat({ ...valid, images: ['a.png'] })).toContainEqual(
      expect.stringContaining(`이미지 1장 (최소 ${FORMAT.minImages})`),
    );
  });

  it('이미지 필드가 아예 없어도 잡는다 — 예전에는 검사 자체를 건너뛰었다', () => {
    expect(checkFormat({ ...valid, images: undefined })).toContainEqual(expect.stringContaining('이미지 0장'));
  });

  it('YMYL 고지문이 없으면 잡는다', () => {
    expect(checkFormat({ ...valid, body: '가'.repeat(1600) })).toContain('YMYL 고지문 없음');
  });

  it('허용되지 않은 outside 호스트를 잡는다', () => {
    expect(checkFormat({ ...valid, outsideUrl: 'https://example.com/x' })).toContainEqual(
      expect.stringContaining('허용되지 않은 outside 호스트'),
    );
  });

  it('이미지 파일이 실제로 없으면 잡는다', () => {
    expect(checkFormat(valid, { fileExists: () => false })).toContainEqual(
      expect.stringContaining('이미지 파일 없음'),
    );
  });

  it('태그 개수 범위를 강제한다', () => {
    expect(checkFormat({ ...valid, tags: ['하나'] })).toContainEqual(expect.stringContaining('태그 1개'));
  });
});
