/**
 * 유형별 본문 생성 — theme 외 3종
 *
 * 공통 원칙(make-draft.ts와 동일): 계산된 수치를 서술하고 해석·전망·매수매도 권유는
 * 넣지 않는다. 유형을 나누는 목적은 문장 구조를 다르게 하는 것이지 주장을 늘리는
 * 것이 아니다.
 */

export const QUOTE = '>> ';
const b = (t: string) => `**${t}**`;

export interface RankingRow {
  change: number;
  name: string;
  score: number;
  stageKo: string;
}

export interface ComparisonRow {
  currentDay: number;
  pastPeakDay: number;
  pastTheme: string;
  pastTotalDays: number;
  similarity: number;
}

const numerals = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

/** 주간 랭킹 — 개별 테마가 아니라 시장 전체 흐름을 다룬다 */
export function composeRanking(rows: readonly RankingRow[], asOf: string, siteUrl: string): {
  body: string;
  tags: string[];
  title: string;
} {
  const top = rows.slice(0, 10);
  const risers = rows.filter((r) => r.change > 0).length;
  const fallers = rows.filter((r) => r.change < 0).length;
  const [y, m] = asOf.split('-');

  const blocks = [
    `한국 주식시장 테마 중 단계별 상위 ${b(`${rows.length}개`)}의 생명주기 점수를 모았습니다. ` +
      `최근 7일 기준 점수가 오른 테마가 ${b(`${risers}개`)}, 내린 테마가 ${b(`${fallers}개`)}, ` +
      `변화가 없는 테마가 ${b(`${rows.length - risers - fallers}개`)}입니다. 기준일은 ${asOf}입니다.`,

    `${QUOTE}점수 상위 ${top.length}개 테마`,
    top
      .map((r, i) => {
        const arrow = r.change > 0 ? `▲${r.change}` : r.change < 0 ? `▼${Math.abs(r.change)}` : '—';
        return `${numerals[i]} ${b(r.name)} ${r.score}점 (${r.stageKo}, ${arrow})`;
      })
      .join('\n'),

    `${QUOTE}상위 3개 테마 상세`,
    // 목록만 있으면 분량도 정보도 얕다 — 상위 3개는 풀어 쓴다
    ...top.slice(0, 3).map((r, i) =>
      `${numerals[i]} ${b(r.name)}\n` +
      `점수 ${b(`${r.score}점`)}, 단계는 ${b(r.stageKo)}입니다. ` +
      `최근 7일 변화는 ${r.change >= 0 ? `+${r.change}` : `${r.change}`}점으로, ` +
      `${r.change > 0 ? '관심이 늘고 있는' : r.change < 0 ? '관심이 줄고 있는' : '큰 변화가 없는'} 구간입니다.`,
    ),

    `${QUOTE}단계는 어떻게 나뉘나`,
    '초기는 관심이 막 생기기 시작한 구간, 성장은 검색과 뉴스가 함께 늘어나는 구간입니다. ' +
      '정점은 점수가 가장 높은 지점이고, 쇠퇴는 관심이 줄어드는 구간, 휴면은 활동이 ' +
      '거의 없는 상태를 뜻합니다.',
    '단계는 절대 점수만으로 정해지지 않습니다. 같은 60점이라도 오르는 중이면 성장, ' +
      '내리는 중이면 쇠퇴로 분류될 수 있습니다. 점수의 높낮이보다 어느 방향으로 ' +
      '움직이는지가 단계를 가릅니다.',

    `${QUOTE}점수는 무엇을 재나`,
    '생명주기 점수는 네이버 검색 관심도, 뉴스 모멘텀, 관련 종목의 활동성과 변동성 네 가지를 ' +
      '가중 합산한 0~100 사이 값입니다. 절대값과 최근 추세를 함께 보고 초기·성장·정점·쇠퇴·휴면 ' +
      '다섯 단계 중 하나로 분류합니다.',
    '같은 점수라도 오르는 중인지 내리는 중인지에 따라 다른 단계가 될 수 있습니다. ' +
      '점수가 높다고 좋은 것도, 낮다고 나쁜 것도 아닙니다 — 테마가 시장의 관심을 받는 ' +
      '주기 어디쯤에 있는지를 나타내는 값입니다.',

    `${QUOTE}점수는 어떻게 갱신되나`,
    '네이버 데이터랩에서 테마 키워드의 검색 추이를, 네이버 뉴스에서 관련 기사 건수를, ' +
      'KRX에서 관련 종목의 시세와 거래량을 매일 수집합니다. 수집 범위는 최근 30일이며, ' +
      '7일 이동평균과 30일 기준선을 비교해 방향을 판단합니다.',
    '데이터가 부족한 테마는 점수를 내지 않고 비활성으로 둡니다. 이 순위에는 오늘 기준 ' +
      '활성 테마만 포함됩니다. 가중치는 과거 데이터로 조정했고 산출 과정은 공개되어 있습니다.',

    `${QUOTE}정리`,
    `${asOf} 기준 최근 7일 상승 ${risers}개 / 하락 ${fallers}개입니다. 상위권은 ` +
      `${top.slice(0, 3).map((r) => r.name).join(', ')} 순이며, 전체 ${rows.length}개 테마의 ` +
      '점수와 관련주는 아래 페이지에서 확인할 수 있습니다.',
    '이 점수는 네이버 데이터랩 검색 트렌드와 뉴스 건수, KRX 시세를 매일 자동 집계해 계산한 ' +
      '참고용 데이터입니다. 특정 종목의 매수·매도를 권하는 것이 아니며, 투자 판단과 그 결과는 ' +
      '투자자 본인의 책임입니다.',
    `사실 확인에 활용한 데이터: 네이버 데이터랩, KRX 시세 (기준일 ${asOf})`,
    `${siteUrl}/themes`,
  ];

  return {
    title: `주식 테마 점수 랭킹 TOP ${top.length} — 상승 ${risers}개 (${y}.${m})`,
    body: blocks.join('\n\n'),
    tags: [
      '테마주랭킹', '주식테마', '테마주',
      ...top.slice(0, 5).map((r) => r.name.replace(/[^가-힣A-Za-z0-9]/g, '')),
      '주식데이터', '관련주정리', '종목분석',
    ].filter((t) => t.length >= 2).slice(0, 12),
  };
}

/** 유사 패턴 비교 — 과거 사이클과 대조. 서술 구조가 랭킹·테마와 다르다 */
export function composeSimilar(
  themeName: string,
  score: number,
  stageKo: string,
  rows: readonly ComparisonRow[],
  asOf: string,
  themeUrl: string,
): { body: string; tags: string[]; title: string } {
  const top = rows.slice(0, 3);
  const best = top[0];
  const [y, m] = asOf.split('-');

  const blocks = [
    `${themeName} 테마가 지금 그리는 점수 곡선과 닮은 과거 사례를 찾았습니다. ` +
      `현재 점수는 ${b(`${score}점`)}, 단계는 ${b(stageKo)}이며 첫 관심 발생일로부터 ` +
      `${b(`${best.currentDay}일째`)}입니다.`,

    `${QUOTE}가장 닮은 과거 테마`,
    `유사도가 가장 높은 사례는 ${b(best.pastTheme)}으로, 곡선 유사도 ` +
      `${b(`${(best.similarity * 100).toFixed(0)}%`)}입니다. 이 테마는 관심 발생 후 ` +
      `${b(`${best.pastPeakDay}일째`)}에 정점을 찍었고, 한 사이클이 ${best.pastTotalDays}일 동안 이어졌습니다.`,

    `${QUOTE}비교 대상 ${top.length}건`,
    // 한 줄 나열이 아니라 사례별로 풀어 쓴다 — 목록만 있으면 분량도 정보도 얕다
    ...top.map((r, i) =>
      `${numerals[i]} ${b(r.pastTheme)} · 유사도 ${b(`${(r.similarity * 100).toFixed(0)}%`)}\n` +
      `이 테마는 관심 발생 후 ${b(`${r.pastPeakDay}일째`)}에 점수가 가장 높았고, ` +
      `한 사이클이 ${b(`${r.pastTotalDays}일`)} 동안 이어졌습니다. ` +
      `현재 ${themeName}이 지나온 ${r.currentDay}일과 비교하면 ` +
      `${r.currentDay > r.pastPeakDay ? '과거 정점 시점을 이미 지난 위치' : '아직 과거 정점 시점 이전'}입니다.`,
    ),

    `${QUOTE}유사도는 어떻게 재나`,
    '점수 곡선의 모양을 비교합니다. 두 테마가 관심을 받기 시작한 시점을 0일로 맞춘 뒤, ' +
      '이후 점수가 오르내린 궤적이 얼마나 겹치는지를 계산합니다. 절대 점수가 아니라 ' +
      '변화의 형태를 보므로 규모가 다른 테마끼리도 비교됩니다.',
    '유사도가 높다고 같은 결과가 나온다는 뜻은 아닙니다. 과거에 비슷한 모양을 그린 ' +
      '사례가 있었다는 사실만을 나타냅니다. 테마마다 재료도 참여 종목도 다르므로, ' +
      '곡선이 닮았다는 것과 앞으로 같은 길을 간다는 것은 별개입니다.',

    `${QUOTE}사이클 일수는 무엇을 뜻하나`,
    `정점 일수는 관심이 처음 발생한 날부터 점수가 가장 높았던 날까지의 간격입니다. ` +
      `${b(best.pastTheme)}의 경우 ${best.pastPeakDay}일이 걸렸고, 이후 관심이 잦아들 때까지 ` +
      `총 ${best.pastTotalDays}일이 소요됐습니다.`,
    `현재 ${themeName}은 ${best.currentDay}일째를 지나고 있습니다. 이 숫자는 진행 상황을 ` +
      '나타내는 관측값이며, 남은 기간을 예측하는 값이 아닙니다. 과거 사례의 일수는 ' +
      '그 테마가 실제로 그랬다는 기록일 뿐입니다.',

    `${QUOTE}점수는 무엇으로 계산되나`,
    '생명주기 점수는 네이버 검색 관심도, 뉴스 모멘텀, 관련 종목의 활동성과 변동성 ' +
      '네 가지를 가중 합산한 0~100 사이 값입니다. 매일 자동으로 다시 계산되며, ' +
      '수집 범위는 최근 30일입니다.',
    '검색 관심도는 네이버 데이터랩에서 테마 키워드가 얼마나 검색되는지를, 뉴스 모멘텀은 ' +
      '최근 기사량이 이전 기간 대비 어떻게 변했는지를 봅니다. 활동성은 관련 종목의 거래 ' +
      '상황을, 변동성은 주가가 얼마나 크게 움직였는지를 나타냅니다.',

    `${QUOTE}비교는 어디에 쓰나`,
    '개별 테마의 점수만 보면 그 숫자가 높은 편인지 낮은 편인지 판단하기 어렵습니다. ' +
      '과거에 비슷한 곡선을 그린 테마가 어떤 경로를 지났는지 함께 보면 현재 위치를 ' +
      '가늠하는 참고가 됩니다.',
    '다만 이것은 통계적 유사성이지 인과관계가 아닙니다. 두 테마의 재료·참여 종목·' +
      '시장 환경이 모두 다르므로, 비교는 맥락을 더하는 용도로만 쓰는 것이 맞습니다.',

    `${QUOTE}정리`,
    `${themeName}은 ${asOf} 기준 ${score}점, ${stageKo} 구간이며 ${best.pastTheme}과 ` +
      `${(best.similarity * 100).toFixed(0)}% 유사한 곡선을 그리고 있습니다. ` +
      `비교 대상 ${top.length}건의 과거 사이클은 각각 ${top.map((r) => `${r.pastTotalDays}일`).join(', ')}이었습니다.`,
    '유사 패턴은 과거에 비슷한 모양이 있었다는 기록이지 앞으로의 방향을 알려주는 신호가 ' +
      '아닙니다. 테마별 점수 추이와 관련주는 아래 페이지에서 직접 확인할 수 있습니다.',
    '이 점수는 네이버 데이터랩 검색 트렌드와 뉴스 건수, KRX 시세를 매일 자동 집계해 계산한 ' +
      '참고용 데이터입니다. 특정 종목의 매수·매도를 권하는 것이 아니며, 투자 판단과 그 결과는 ' +
      '투자자 본인의 책임입니다.',
    `사실 확인에 활용한 데이터: 네이버 데이터랩, KRX 시세 (기준일 ${asOf})`,
    themeUrl,
  ];

  const clean = (t: string) => t.replace(/[^가-힣A-Za-z0-9]/g, '');
  return {
    title: `${themeName} 테마, 과거 ${best.pastTheme}과 ${(best.similarity * 100).toFixed(0)}% 유사 (${y}.${m})`,
    body: blocks.join('\n\n'),
    tags: [
      `${clean(themeName)}관련주`, clean(themeName),
      ...top.map((r) => clean(r.pastTheme)),
      '테마주', '유사패턴', '주식데이터', '종목분석', '테마분석',
    ].filter((t) => t.length >= 2).slice(0, 12),
  };
}

export interface NewsItem {
  date?: string;
  press?: string;
  title: string;
}

/**
 * 광고·투자권유성 헤드라인은 인용하지 않는다.
 *
 * 인용이라도 본문에 실리면 YMYL 관점에서는 같은 글에 실린 문장이다. 원문이
 * 언론사 기사가 아니라 홍보성 배포자료인 경우가 대부분이라 걸러도 손실이 없다.
 */
const AD_HEADLINE_RE = /(추천주|리딩|무료\s*수익|수익률\s*\d|매수\s*타이밍|급등주|비법|필독|주식\s*카페|무료\s*상담)/;

const normTitle = (t: string) => t.replace(/[^가-힣A-Za-z0-9]/g, '');

/** ISO 날짜 → MM.DD. 파싱 실패하면 빈 문자열(표기 생략). */
const shortDate = (raw?: string): string => {
  const t = Date.parse(raw ?? '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * 뉴스 흐름 — 날짜·매체가 매일 바뀌므로 같은 문장이 재생산되지 않는 유일한 유형이다.
 *
 * 기사 제목과 매체·날짜만 인용하고 본문은 옮기지 않는다. 해석·전망도 넣지 않는다.
 */
/**
 * 인용 가능한 기사만 남긴다. 광고성 제목과 중복을 걷어낸다.
 *
 * 호출부(make-draft)가 최소 건수를 판정할 때도 이 함수를 써야 한다. 원시 배열로 세면
 * 5건 중 5건이 광고성이어도 뉴스 유형에 진입해 "최근 기사 0건" 글이 나온다.
 */
export function filterNewsItems(news: readonly NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return news
    .filter((n) => n.title?.trim() && !AD_HEADLINE_RE.test(n.title))
    .filter((n) => {
      const key = normTitle(n.title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

export function composeNews(
  themeName: string,
  score: number,
  stageKo: string,
  news: readonly NewsItem[],
  thisWeek: number,
  lastWeek: number,
  asOf: string,
  themeUrl: string,
): { body: string; tags: string[]; title: string } {
  const picked = filterNewsItems(news);

  const presses = [...new Set(picked.map((n) => n.press).filter((p): p is string => Boolean(p)))];
  const diff = thisWeek - lastWeek;
  const [y, m] = asOf.split('-');

  const blocks = [
    `${themeName} 테마의 최근 기사를 모았습니다. 이번 주 관련 기사는 ${b(`${thisWeek}건`)}으로 ` +
      `지난주 ${lastWeek}건 대비 ${b(diff >= 0 ? `+${diff}건` : `${diff}건`)}입니다. ` +
      `${asOf} 기준 이 테마의 생명주기 점수는 ${b(`${score}점`)}, 단계는 ${b(stageKo)}입니다.`,

    `${QUOTE}최근 기사 ${picked.length}건`,
    picked
      .map((n, i) => {
        const meta = [n.press, shortDate(n.date)].filter(Boolean).join(' · ');
        return `${numerals[i]} ${b(n.title.trim())}${meta ? `\n${meta}` : ''}`;
      })
      .join('\n\n'),

    `${QUOTE}기사량은 어떻게 변했나`,
    `뉴스 모멘텀은 최근 7일 기사 건수를 그 이전 기간과 비교한 값입니다. ` +
      `${themeName}은 이번 주 ${b(`${thisWeek}건`)}, 지난주 ${b(`${lastWeek}건`)}으로 ` +
      `${diff > 0 ? '기사량이 늘었습니다' : diff < 0 ? '기사량이 줄었습니다' : '기사량이 같습니다'}. ` +
      `건수 자체보다 이전 기간 대비 얼마나 달라졌는지를 봅니다.`,
    '기사량이 늘었다는 것은 그 테마가 언론에서 다뤄지는 빈도가 높아졌다는 사실만을 ' +
      '뜻합니다. 기사의 논조나 내용은 반영하지 않습니다. 같은 사안을 여러 매체가 ' +
      '동시에 다루면 건수가 급증할 수 있고, 그 뒤 조용해지면 다시 빠르게 줄어듭니다.',

    `${QUOTE}어느 매체가 다뤘나`,
    presses.length
      ? `위 기사를 보도한 매체는 ${b(presses.slice(0, 6).join(', '))}${presses.length > 6 ? ` 외 ${presses.length - 6}곳` : ''}입니다. ` +
        `매체가 여러 곳으로 퍼져 있으면 특정 매체의 연속 보도가 아니라 사안 자체가 ` +
        `다뤄지고 있다는 뜻으로 읽을 수 있습니다.`
      : '수집된 기사에 매체 정보가 표기되지 않았습니다. 매체 표기는 원문 제공 형식에 ' +
        '따라 달라지며, 없더라도 건수 집계에는 영향을 주지 않습니다.',
    '기사 수집은 네이버 뉴스 검색 결과를 기준으로 하며, 테마 키워드와 관련 종목명이 ' +
      '함께 등장하는 기사를 대상으로 합니다. 광고성·홍보성 배포자료로 판단되는 항목은 ' +
      '목록에서 제외했습니다.',

    `${QUOTE}뉴스가 점수에 반영되는 방식`,
    '생명주기 점수는 네이버 검색 관심도, 뉴스 모멘텀, 관련 종목의 활동성과 변동성 ' +
      '네 가지를 가중 합산한 0~100 사이 값입니다. 뉴스 모멘텀은 그중 하나이며, ' +
      '기사량 하나로 점수가 정해지지는 않습니다.',
    '기사량이 늘어도 검색 관심도가 따라오지 않으면 점수 상승 폭은 제한적입니다. ' +
      '반대로 기사량이 줄어도 검색이 유지되면 점수는 완만하게 내려갑니다. ' +
      '네 요소가 서로 다른 방향을 가리키는 구간이 실제로 자주 나타납니다.',

    `${QUOTE}기사를 읽을 때`,
    '기사 제목은 사안을 압축한 표현이라 그 자체로 판단 근거가 되기 어렵습니다. ' +
      '위 목록은 어떤 사안이 언제 어느 매체에서 다뤄졌는지를 보여주는 색인이며, ' +
      '제목만으로 내용을 단정하지 않도록 원문 확인을 권합니다.',
    '같은 테마라도 기사마다 다루는 종목과 사안이 다릅니다. 테마 단위 집계는 ' +
      '개별 종목의 사정을 담지 못하므로, 종목별 내용은 각 기사와 공시를 직접 ' +
      '확인하는 것이 정확합니다.',

    `${QUOTE}정리`,
    `${asOf} 기준 ${themeName}의 이번 주 기사는 ${thisWeek}건, 지난주는 ${lastWeek}건입니다. ` +
      `생명주기 점수는 ${score}점이며 ${stageKo} 구간에 있습니다. ` +
      `기사 목록과 점수 추이는 아래 페이지에서 함께 볼 수 있습니다.`,
    '이 점수는 네이버 데이터랩 검색 트렌드와 뉴스 건수, KRX 시세를 매일 자동 집계해 계산한 ' +
      '참고용 데이터입니다. 특정 종목의 매수·매도를 권하는 것이 아니며, 투자 판단과 그 결과는 ' +
      '투자자 본인의 책임입니다.',
    `사실 확인에 활용한 데이터: 네이버 뉴스, 네이버 데이터랩 (기준일 ${asOf})`,
    themeUrl,
  ];

  const clean = (t: string) => t.replace(/[^가-힣A-Za-z0-9]/g, '');
  return {
    title: `${themeName} 관련 뉴스 ${picked.length}건 — 이번 주 기사 ${thisWeek}건 (${y}.${m})`,
    body: blocks.join('\n\n'),
    tags: [
      `${clean(themeName)}관련주`, clean(themeName), `${clean(themeName)}뉴스`,
      ...presses.slice(0, 3).map(clean),
      '테마주', '주식뉴스', '종목분석', '주식데이터', '관련주정리',
    ].filter((t) => t.length >= 2).slice(0, 12),
  };
}
