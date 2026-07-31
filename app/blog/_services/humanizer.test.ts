import { describe, it, expect } from 'vitest';
import { evaluateHumanization, extractHumanized, extractFigures } from './humanizer';
import { changeRate, changeRateDetailed, stripSummaryBlock } from '../_utils/change-rate';
import { HUMANIZE_BEGIN, HUMANIZE_END } from '../_prompts/humanize';
import { calculateQualityScore } from './content-generator';
import type { CompetitorAnalysis, GeneratedContent } from '../_types/blog';

const KEYWORD = '주식 기술적 분석';

/** 가드의 길이·키워드 하한을 통과하는 기본 본문 */
function buildBody(overrides: { filler?: string } = {}): string {
  const filler = overrides.filler ?? '이 지표는 매수 시점을 판단하는 데 쓰입니다. ';
  return [
    `## ${KEYWORD} 기초`,
    '',
    `${KEYWORD}은 차트를 읽는 방법입니다. RSI가 30 아래면 과매도입니다.`,
    filler.repeat(20).trim(),
    '',
    `## ${KEYWORD} 실전`,
    '',
    `${KEYWORD}에서 MACD는 12일과 26일 이동평균을 씁니다.`,
    filler.repeat(20).trim(),
  ]
    .join('\n')
    .trim();
}

describe('extractHumanized', () => {
  it('센티널 사이의 본문만 잘라낸다', () => {
    const response = `알겠습니다.\n${HUMANIZE_BEGIN}\n## 제목\n\n본문입니다.\n${HUMANIZE_END}\n끝났습니다.`;
    expect(extractHumanized(response)).toBe('## 제목\n\n본문입니다.');
  });

  it('센티널이 없으면 전문을 쓴다', () => {
    expect(extractHumanized('## 제목\n\n본문입니다.')).toBe('## 제목\n\n본문입니다.');
  });

  it('전체를 감싼 코드 펜스를 벗긴다', () => {
    expect(extractHumanized('```markdown\n## 제목\n\n본문\n```')).toBe('## 제목\n\n본문');
  });

  it('본문 안의 코드 블록은 보존한다', () => {
    const body = '## 제목\n\n```js\nconst a = 1;\n```\n\n설명입니다.';
    expect(extractHumanized(`${HUMANIZE_BEGIN}\n${body}\n${HUMANIZE_END}`)).toBe(body);
  });

  it('HUMANIZE-SUMMARY 메타 블록을 제거한다', () => {
    const response = '## 제목\n\n본문\n\n<!-- HUMANIZE-SUMMARY v1.6.1\ngrade: A\n-->';
    expect(extractHumanized(response)).toBe('## 제목\n\n본문');
  });

  it('닫는 센티널이 없어도 여는 센티널을 남기지 않는다', () => {
    // 출력 토큰 소진이나 모델 누락으로 END가 잘린 응답
    const response = `${HUMANIZE_BEGIN}\n## 제목\n\n본문입니다. RSI는 30입니다.`;
    expect(extractHumanized(response)).toBe('## 제목\n\n본문입니다. RSI는 30입니다.');
  });

  it('여는 센티널이 없어도 닫는 센티널을 남기지 않는다', () => {
    const response = `## 제목\n\n본문입니다.\n${HUMANIZE_END}`;
    expect(extractHumanized(response)).toBe('## 제목\n\n본문입니다.');
  });

  it('센티널을 여러 번 뱉어도 본문에 남기지 않는다', () => {
    const response = `${HUMANIZE_BEGIN}\n## 제목\n${HUMANIZE_BEGIN}\n본문\n${HUMANIZE_END}`;
    const out = extractHumanized(response);
    expect(out).not.toContain(HUMANIZE_BEGIN);
    expect(out).not.toContain(HUMANIZE_END);
  });
});

describe('changeRate', () => {
  it('동일 텍스트는 0', () => {
    expect(changeRate('같은 문장입니다.', '같은 문장입니다.')).toBe(0);
  });

  it('전면 교체는 1에 가깝다', () => {
    expect(changeRate('가나다라마바사', 'ABCDEFG')).toBeGreaterThan(0.9);
  });

  it('부분 수정은 중간값', () => {
    const before = '이 지표를 통해 매수 시점을 판단할 수 있습니다.';
    const after = '이 지표로 매수 시점을 판단합니다.';
    const rate = changeRate(before, after);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(0.5);
  });

  it('실제 기사 분량에서는 어절 단위로 강등되지 않는다', () => {
    // 실측 기사는 한글 2,700~4,300자. 여유를 크게 두고 12,000자로 확인한다.
    // 강등되면 같은 편집의 변경률이 두 배 가까이 뛰어 정상 윤문이 과윤문으로 반려된다.
    const unit = '이 지표를 통해 매수 시점을 판단할 수 있습니다. 결론적으로 RSI가 30 아래라면 과매도입니다. ';
    const before = unit.repeat(Math.ceil(12_000 / unit.length));
    const after = before.replaceAll('통해', '로').replaceAll('결론적으로 ', '');

    const result = changeRateDetailed(before, after, { ignoreMarkup: true });

    expect(result.tokenization).toBe('char');
    expect(result.rate).toBeLessThan(0.3);
  });

  it('메타 블록은 변경률에 반영하지 않는다', () => {
    const body = '본문 그대로입니다.';
    expect(changeRate(body, `${body}\n\n<!-- HUMANIZE-SUMMARY\ngrade: A\n-->`)).toBe(0);
  });

  it('ignoreMarkup이면 헤딩 기호 차이를 무시한다', () => {
    const before = '## 제목\n\n- 항목 하나';
    const after = '제목\n\n항목 하나';
    expect(changeRate(before, after, { ignoreMarkup: true })).toBe(0);
    expect(changeRate(before, after)).toBeGreaterThan(0);
  });
});

describe('stripSummaryBlock', () => {
  it('블록이 없으면 원문 그대로', () => {
    expect(stripSummaryBlock('본문')).toBe('본문');
  });
});

describe('extractFigures', () => {
  it('수치를 뽑아낸다', () => {
    expect(extractFigures('RSI가 30이고 거래량은 1,500주입니다.')).toEqual(
      new Set(['30', '1500'])
    );
  });

  it('목록 마커는 수치로 세지 않는다', () => {
    expect(extractFigures('1) 첫째\n2) 둘째')).toEqual(new Set());
  });
});

describe('evaluateHumanization', () => {
  it('정상 윤문본을 채택한다', () => {
    const original = buildBody();
    const candidate = original.replace(/판단하는 데 쓰입니다/g, '판단할 때 씁니다');

    const verdict = evaluateHumanization(original, candidate, KEYWORD);

    expect(verdict.accepted).toBe(true);
    expect(verdict.text).toBe(candidate);
    expect(verdict.reason).toBeNull();
  });

  it('빈 응답을 반려한다', () => {
    const original = buildBody();
    const verdict = evaluateHumanization(original, '', KEYWORD);

    expect(verdict.accepted).toBe(false);
    expect(verdict.text).toBe(original);
    expect(verdict.reason).toBe('빈 응답');
  });

  it('최소 길이 미달을 반려한다', () => {
    const original = buildBody();
    const verdict = evaluateHumanization(original, '너무 짧은 본문입니다.', KEYWORD);

    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toMatch(/최소 길이 미달/);
  });

  it('헤딩 개수가 바뀌면 반려한다', () => {
    const original = buildBody();
    const candidate = original.replace(`## ${KEYWORD} 실전`, `${KEYWORD} 실전`);

    const verdict = evaluateHumanization(original, candidate, KEYWORD);

    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toMatch(/헤딩 구조 변경/);
  });

  it('수치가 유실되면 반려한다', () => {
    const original = buildBody();
    const candidate = original.replace('RSI가 30 아래면', 'RSI가 낮으면');

    const verdict = evaluateHumanization(original, candidate, KEYWORD);

    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toMatch(/수치 유실/);
  });

  it('키워드 빈도가 하한 아래로 떨어지면 반려한다', () => {
    const original = buildBody();
    const candidate = original.replaceAll(KEYWORD, '차트 읽기');

    const verdict = evaluateHumanization(original, candidate, KEYWORD);

    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toMatch(/키워드 빈도 하락/);
  });

  it('분량이 과다 축소되면 반려한다', () => {
    const original = buildBody();
    const candidate = buildBody({ filler: '이 지표는 매수에 씁니다. ' });

    const verdict = evaluateHumanization(original, candidate, KEYWORD);

    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toMatch(/분량 과다 축소/);
  });

  it('군더더기를 걷어낸 수준의 축소(20%대)는 채택한다', () => {
    const original = buildBody();
    const candidate = buildBody({ filler: '이 지표는 매수 시점에 씁니다. ' });

    const verdict = evaluateHumanization(original, candidate, KEYWORD);

    expect(verdict.accepted).toBe(true);
  });

  it('과윤문(변경률 50% 이상)을 반려한다', () => {
    const original = buildBody();
    // 헤딩·수치·키워드는 남기되 본문을 전부 다른 문장으로 교체
    const candidate = [
      `## ${KEYWORD} 기초`,
      '',
      `${KEYWORD} 30 완전히 다른 서술로 갈아엎은 문장입니다. `.repeat(20),
      '',
      `## ${KEYWORD} 실전`,
      '',
      `${KEYWORD} 12 26 또 다른 서술로 갈아엎은 문장입니다. `.repeat(20),
    ].join('\n');

    const verdict = evaluateHumanization(original, candidate, KEYWORD);

    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toMatch(/과윤문/);
  });

  it('원문에 없던 볼드를 제거하고 채택한다', () => {
    const original = buildBody();
    const candidate = original.replace(`${KEYWORD}은 차트를`, `**${KEYWORD}**은 차트를`);

    const verdict = evaluateHumanization(original, candidate, KEYWORD);

    expect(verdict.accepted).toBe(true);
    expect(verdict.text).not.toContain('**');
  });

  it('닫는 센티널이 잘린 응답을 채택해도 마커가 발행되지 않는다', () => {
    // 가드는 전부 통과한다: 헤딩 수 동일, 수치 보존, 어절 손실 적음, 변경률 낮음.
    // 파싱이 마커를 남기면 그대로 본문에 실려 발행된다.
    const original = buildBody();
    const response = `${HUMANIZE_BEGIN}\n${original.replace(/판단하는 데 쓰입니다/g, '판단할 때 씁니다')}`;

    const verdict = evaluateHumanization(original, extractHumanized(response), KEYWORD);

    expect(verdict.accepted).toBe(true);
    expect(verdict.text).not.toContain(HUMANIZE_BEGIN);
    expect(verdict.text).not.toContain('<<<');
  });

  it('변경률 30% 이상이면 채택하되 경고를 남긴다', () => {
    const original = buildBody();
    const candidate = buildBody({ filler: '이 지표로 매도 타이밍을 가늠할 때 사용합니다. ' });

    const verdict = evaluateHumanization(original, candidate, KEYWORD);

    expect(verdict.accepted).toBe(true);
    expect(verdict.changeRate).toBeGreaterThanOrEqual(0.3);
    expect(verdict.changeRate).toBeLessThan(0.5);
    expect(verdict.reason).toMatch(/변경률 경고/);
  });
});

describe('calculateQualityScore — 윤문 후 재계산 근거', () => {
  const analysis = { averageWordCount: 1000 } as CompetitorAnalysis;

  function buildContent(bodyWordCount: number): GeneratedContent {
    return {
      title: `${KEYWORD} 완전 정복 가이드`,
      description: '설명',
      metaTitle: `${KEYWORD} 가이드`,
      metaDescription: `${KEYWORD}를 다루는 글입니다.`,
      content: buildBody() + '\n\n' + '지표 '.repeat(bodyWordCount),
      headings: [],
      faqItems: [{ question: 'Q', answer: 'A' }, { question: 'Q2', answer: 'A2' }, { question: 'Q3', answer: 'A3' }],
      suggestedTags: [],
      citations: [
        { sourceUrl: 'https://example.com/a', sourceExcerpt: '근거 발췌문 열 글자 이상입니다.', claim: '검증된 첫 번째 주장 문장입니다.' },
        { sourceUrl: 'https://example.com/b', sourceExcerpt: '두 번째 근거 발췌문도 충분히 깁니다.', claim: '검증된 두 번째 주장 문장입니다.' },
      ],
    };
  }

  it('어절이 줄면 점수가 떨어진다 — 윤문 전 점수를 그대로 쓰면 부풀려진다', () => {
    // 분량 가드는 30% 감소까지 허용하고, 길이 항목은 30점짜리다
    const full = buildContent(1300);
    const trimmed = buildContent(950);

    const scoreBefore = calculateQualityScore(full, KEYWORD, analysis);
    const scoreAfter = calculateQualityScore(trimmed, KEYWORD, analysis);

    expect(scoreAfter).toBeLessThan(scoreBefore);
  });
});
