import { describe, expect, it } from 'vitest';

import { humanizeMadeItWorse, measureAiTell } from '../ai-tell-metrics';

const MONOTONE = '시장이 상승했다. 지수가 올랐다. 거래량이 늘었다. 투자가 증가했다. 심리가 개선됐다.';
const DIVERSE = '시장이 상승했다. 지수가 올랐어요. 거래량은 어땠을까? 투자가 늘었기 때문이다. 심리도 개선되는 중.';

describe('measureAiTell', () => {
  it("'~다' 4연속 이상을 스트릭으로 센다", () => {
    expect(measureAiTell(MONOTONE).daStreaks).toBe(1);
    expect(measureAiTell(DIVERSE).daStreaks).toBe(0);
  });

  it('이중 피동 표층형을 잡는다', () => {
    expect(measureAiTell('이는 긍정적으로 평가되어진다.').doublePassiveCount).toBe(1);
    expect(measureAiTell('이는 긍정적으로 평가된다.').doublePassiveCount).toBe(0);
  });

  it('결산 상투구를 센다', () => {
    expect(measureAiTell('결론적으로 시장은 상승했다. 이를 통해 알 수 있다.').conclusionPivotCount).toBe(2);
  });

  it('종결 다양성: 단조로울수록 낮다', () => {
    const mono = measureAiTell(MONOTONE).endingDiversity;
    const div = measureAiTell(DIVERSE).endingDiversity;
    expect(div).toBeGreaterThan(mono);
  });
});

describe('humanizeMadeItWorse — 윤문 전후 델타만 본다 (절대 임계 없음)', () => {
  it('악화가 없으면 null', () => {
    expect(humanizeMadeItWorse(measureAiTell(MONOTONE), measureAiTell(DIVERSE))).toBeNull();
  });

  it('윤문이 이중 피동을 새로 만들면 반려 사유를 돌려준다', () => {
    const before = measureAiTell('이는 평가된다.');
    const after = measureAiTell('이는 평가되어진다.');
    expect(humanizeMadeItWorse(before, after)).toContain('이중 피동');
  });

  it('윤문이 문장을 단조롭게 만들면 반려한다', () => {
    const worse = humanizeMadeItWorse(measureAiTell(DIVERSE), measureAiTell(MONOTONE));
    expect(worse).not.toBeNull();
  });

  it('원문이 이미 깨끗한 축은 0→0으로 통과한다 (개선을 강제하지 않는다)', () => {
    const clean = measureAiTell('시장 얘기다. 그런데 재밌지 않은가?');
    expect(humanizeMadeItWorse(clean, clean)).toBeNull();
  });
});
