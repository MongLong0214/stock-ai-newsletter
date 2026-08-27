#!/usr/bin/env tsx
/**
 * 네이버 inside 트랙 초안 생성 — TLI 실데이터에서
 *
 *   npm run naver:draft                    # .naver-blog/draft.json 생성
 *   npm run naver:draft -- --out path.json
 *
 * 자사 블로그 파이프라인(Gemini 생성)과 다른 경로다. 여기서는 LLM으로 글을
 * 쓰지 않고 **이미 계산된 TLI 수치를 서술**한다. 이유:
 *   - 네이버는 발행 후 잦은 수정을 문서 신뢰도 감점으로 본다 — 사실만 쓰면 고칠 일이 없다
 *   - AI 생성 산문은 저품질 필터의 표적이고, 수치 서술은 그렇지 않다
 *   - inside 트랙의 목적은 outside(자사 도메인) 데이터 페이지로 보내는 것이다
 */

import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });

import { credentialsFromEnv, fetchKeywordVolumes } from '@/lib/naver-searchad';
import { captureThemeImages } from './capture-images';
import { composeRanking, composeSimilar, type ComparisonRow, type RankingRow } from './compose-variants';
import { THEME_COOLDOWN_DAYS, typeForHistory, type PostType } from './post-types';
import { isThemeOnCooldown, readHistory, recordTheme } from './session';

const SITE = 'https://stockmatrix.co.kr';
/** 이 미만 검색량이면 네이버에 써도 읽힐 가능성이 낮다 */
const MIN_VOLUME = 200;

interface Mover {
  change: number;
  currentScore: number;
  currentStage: string;
  name: string;
  themeId: string;
}

interface Stock {
  market: string;
  name: string;
  symbol: string;
}

interface ThemeDetail {
  name: string;
  score: {
    components: { activity: number; interest: number; newsMomentum: number; volatility: number };
    raw: { baseline30dAvg: number; newsLastWeek: number; newsThisWeek: number; recent7dAvg: number };
    stageKo: string;
    updatedAt: string;
    value: number;
  };
  comparisons?: ComparisonRow[];
  recentNews?: { date?: string; press?: string; title: string }[];
  /** 상세 API가 주는 실제 필드 — 목록 API의 topStocks와 다르다 */
  stockCount?: number;
  stocks?: Stock[];
}

/** 종목명 목록. 본문·태그·제목이 같은 소스를 봐야 개수가 어긋나지 않는다. */
export const stockNames = (theme: ThemeDetail): string[] =>
  (theme.stocks ?? []).map((s) => s.name).filter(Boolean);

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

/** 발행 포맷 규격 — FORMAT-SPEC.md */
export const FORMAT = {
  bodyMax: 2500,
  bodyMin: 1500,
  minImages: 4,
  tagsMax: 12,
  tagsMin: 8,
  titleMax: 45,
  titleMin: 25,
} as const;

/** 인용구 박스(소제목) 표시. publish.ts가 이 접두를 보고 스마트에디터 인용구로 변환한다. */
export const QUOTE_PREFIX = '>> ';

/** 상승/하락 방향에 따른 색상 마커. publish.ts가 서식으로 바꾼다. */
const up = (t: string) => `[[r:${t}]]`;
const down = (t: string) => `[[b:${t}]]`;
const b = (t: string) => `**${t}**`;

/** 제목 — 규격 A) [테마명] 관련주 TOP N — [단계] 진입, 점수 NN점 (YYYY.MM) */
export function composeTitle(theme: ThemeDetail, stockCount: number): string {
  const [y, m] = theme.score.updatedAt.split('-');
  const base = stockCount > 0
    ? `${theme.name} 관련주 TOP ${stockCount} — ${theme.score.stageKo} 단계, 점수 ${theme.score.value}점 (${y}.${m})`
    : `${theme.name} 테마 ${theme.score.stageKo} 단계 — 점수 ${theme.score.value}점 (${y}.${m})`;
  // 45자 초과 시 단계 표기를 덜어낸다 (키워드·숫자는 유지)
  return base.length <= FORMAT.titleMax
    ? base
    : `${theme.name} 관련주 TOP ${stockCount} — 점수 ${theme.score.value}점 (${y}.${m})`;
}

/**
 * 본문 — FORMAT-SPEC 5블록 고정.
 * 수치를 그대로 서술하고 해석·전망·권유는 넣지 않는다(YMYL). 서식만 규격에 맞춘다.
 */
export function composeBody(theme: ThemeDetail, themeId: string, change: number): string {
  const s = theme.score;
  const c = s.components;
  const r = s.raw;
  const stocks = stockNames(theme);
  const newsDown = r.newsThisWeek < r.newsLastWeek;
  const interestUp = r.recent7dAvg >= r.baseline30dAvg;
  const changeText = change >= 0 ? up(`+${change}점`) : down(`${change}점`);

  const blocks: string[] = [];

  // [1] 후킹 도입부 — 제목 키워드를 첫 문장에 반복
  blocks.push(
    `${theme.name} 테마가 이번 주 ${b(`${s.value}점`)}을 기록하며 '${s.stageKo}' 단계에 들어섰습니다. ` +
    `최근 7일 변화는 ${changeText}인데, 이 흐름을 어떤 종목이 이끌고 있는지 데이터로 확인해 보겠습니다.`,
  );

  // [2] 점수 현황
  blocks.push(`${QUOTE_PREFIX}점수 현황`);
  blocks.push(
    `${theme.name} 생명주기 점수는 ${b(`${s.value}점`)}(100점 만점), 전주 대비 ${changeText}입니다. ` +
    `기준일은 ${s.updatedAt}입니다. 단계는 초기·성장·${b('정점')}·쇠퇴·휴면 다섯 구간 중 ` +
    `${b(s.stageKo)} 구간에 해당합니다.`,
  );

  // [3] 왜 오르는가 — 차별화 데이터
  blocks.push(`${QUOTE_PREFIX}점수를 만든 네 가지 요소`);
  blocks.push(
    `점수를 구성하는 네 요소 중 ${b(`검색 관심도가 ${pct(c.interest)}`)}로 가장 높습니다. ` +
    `뉴스 모멘텀 ${b(pct(c.newsMomentum))}, 활동성 ${b(pct(c.activity))}, ` +
    `변동성은 ${b(pct(c.volatility))} 수준입니다.`,
  );
  blocks.push(
    `이번 주 관련 기사는 ${b(`${r.newsThisWeek}건`)}으로 지난주 ${r.newsLastWeek}건보다 ` +
    `${newsDown ? down('줄었습니다') : up('늘었습니다')}. ` +
    `검색 관심도의 7일 평균(${r.recent7dAvg.toFixed(1)})은 30일 평균(${r.baseline30dAvg.toFixed(1)})을 ` +
    `${interestUp ? up('웃돕니다') : down('밑돕니다')}.`,
  );

  // [3-2] 지표별 의미 — 해석이 아니라 지표 정의 설명(사실)
  blocks.push(
    `각 요소가 무엇을 재는지 짚어두면 숫자를 읽기 쉽습니다. ${b('검색 관심도')}는 네이버 데이터랩에서 ` +
    `해당 테마 키워드가 얼마나 검색되는지를, ${b('뉴스 모멘텀')}은 최근 기사량이 이전 기간 대비 ` +
    `어떻게 변했는지를 봅니다. ${b('활동성')}은 관련 종목의 거래 상황을, ${b('변동성')}은 주가가 ` +
    `얼마나 크게 움직였는지를 나타냅니다.`,
  );

  // [4] 관련종목
  if (stocks.length) {
    blocks.push(`${QUOTE_PREFIX}관련종목 ${stocks.length}개`);
    const numerals = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
    blocks.push(
      `이 테마로 묶이는 종목은 아래 ${stocks.length}개입니다. 시장 구분과 함께 정리했습니다.\n` +
      (theme.stocks ?? []).slice(0, 8)
        .map((st, i) => `${numerals[i]} ${b(st.name)} (${st.market} ${st.symbol})`)
        .join('\n'),
    );
    blocks.push(
      `종목별 현재가·등락률·거래량과 PER·PBR 같은 지표는 위 이미지의 표에서 확인할 수 있습니다. ` +
      `이 목록은 테마 편입 기준에 따라 자동으로 갱신되며, 편입·제외 이력도 함께 관리됩니다.`,
    );
  }

  // [4-2] 단계의 뜻 — 사실 설명
  blocks.push(`${QUOTE_PREFIX}생명주기 단계는 무엇을 뜻하나`);
  blocks.push(
    `생명주기 단계는 점수의 절대값과 최근 추세를 함께 보고 ${b('초기')}·${b('성장')}·${b('정점')}·` +
    `${b('쇠퇴')}·${b('휴면')} 다섯 구간 중 하나로 분류한 값입니다. 같은 점수라도 오르는 중인지 ` +
    `내리는 중인지에 따라 다른 단계가 될 수 있습니다. 현재 ${theme.name}은 ${b(s.stageKo)} 구간입니다.`,
  );

  // [4-3] 데이터 갱신 주기 — 분량이 데이터에 좌우되므로 고정 설명으로 하한을 받친다.
  // 규격(1,500자)은 발행 전 검증에서 강제되며, 여기 문장은 해석이 아니라 사실 설명이다.
  blocks.push(`${QUOTE_PREFIX}데이터는 어떻게 갱신되나`);
  blocks.push(
    `점수는 매일 자동으로 다시 계산됩니다. 네이버 데이터랩에서 테마 키워드의 검색 추이를, ` +
    `네이버 뉴스에서 관련 기사 건수를, KRX에서 관련 종목의 시세와 거래량을 수집한 뒤 ` +
    `네 요소를 가중 합산합니다. 가중치는 과거 데이터로 조정했고 산출 과정은 공개되어 있습니다.`,
  );
  blocks.push(
    `수집 범위는 최근 30일이며, 7일 이동평균과 30일 기준선을 비교해 방향을 판단합니다. ` +
    `데이터가 부족한 테마는 점수를 내지 않고 비활성으로 둡니다. 오늘 기준 활성 테마만 ` +
    `순위에 포함되며, 이 글의 수치는 모두 ${s.updatedAt} 집계분입니다.`,
  );

  // [5] 마무리 — 요약·고지·출처·CTA
  blocks.push(`${QUOTE_PREFIX}정리`);
  blocks.push(
    `${theme.name} 테마는 검색 관심도 ${pct(c.interest)}, 뉴스 모멘텀 ${pct(c.newsMomentum)} 수준에서 ` +
    `${s.stageKo} 구간을 지나고 있습니다.`,
  );
  blocks.push(
    '이 점수는 네이버 데이터랩 검색 트렌드와 뉴스 건수, KRX 시세를 매일 자동 집계해 계산한 참고용 ' +
    '데이터입니다. 특정 종목의 매수·매도를 권하는 것이 아니며, 투자 판단과 그 결과는 투자자 본인의 책임입니다.',
  );
  blocks.push(`사실 확인에 활용한 데이터: 네이버 데이터랩, KRX 시세 (기준일 ${s.updatedAt})`);
  blocks.push('실시간 점수와 관련주 전체 목록은 여기서 확인할 수 있습니다.');
  blocks.push(`${SITE}/themes/${themeId}`);

  return blocks.join('\n\n');
}

/** 태그 — 종목명 40% + 테마명 20% + 일반 키워드 40%, 8~12개 */
export function composeTags(theme: ThemeDetail): string[] {
  const clean = (t: string) => t.replace(/[^가-힣A-Za-z0-9]/g, '');
  const themeTag = clean(theme.name);
  const tags = [
    `${themeTag}관련주`,
    themeTag,
    ...stockNames(theme).slice(0, 5).map(clean),
    '테마주', '주식데이터', '관련주정리', '종목분석',
  ].filter((t) => t.length >= 2);

  return [...new Set(tags)].slice(0, FORMAT.tagsMax);
}

interface DraftPayload {
  body: string;
  images: string[];
  outsideUrl: string;
  tags: string[];
  title: string;
}

/** 규격 검증 후 파일로 낸다 — 위반은 발행 전에 잡는다 */
function writeDraft(outPath: string, draft: DraftPayload): void {
  const plain = draft.body.replace(/>> |\*\*|\[\[[rb]:|\]\]/g, '');
  const violations: string[] = [];
  if (draft.title.length < FORMAT.titleMin || draft.title.length > FORMAT.titleMax) {
    violations.push(`제목 ${draft.title.length}자 (규격 ${FORMAT.titleMin}~${FORMAT.titleMax})`);
  }
  if (plain.length < FORMAT.bodyMin || plain.length > FORMAT.bodyMax) {
    violations.push(`본문 ${plain.length}자 (규격 ${FORMAT.bodyMin}~${FORMAT.bodyMax})`);
  }
  if (draft.tags.length < FORMAT.tagsMin || draft.tags.length > FORMAT.tagsMax) {
    violations.push(`태그 ${draft.tags.length}개 (규격 ${FORMAT.tagsMin}~${FORMAT.tagsMax})`);
  }
  if (violations.length) throw new Error(`FORMAT-SPEC 위반: ${violations.join(' / ')}`);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf-8');
  console.log(`초안 생성: ${outPath}`);
  console.log(`  제목: ${draft.title} (${draft.title.length}자)`);
  console.log(`  본문: ${plain.length}자 / 태그 ${draft.tags.length}개 / 이미지 ${draft.images.length}장`);
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${SITE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()).data;
}

async function main(): Promise<void> {
  const outIdx = process.argv.indexOf('--out');
  const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : '.naver-blog/draft.json';

  // 발행 회차로 유형을 정한다 — 같은 템플릿이 이틀 연속 나오지 않게
  const postType: PostType = (process.argv.includes('--type')
    ? process.argv[process.argv.indexOf('--type') + 1]
    : typeForHistory(readHistory().length)) as PostType;
  console.log(`글 유형: ${postType}`);

  const changes = await getJson<{ movers: { rising: Mover[] } }>('/api/tli/changes?period=1d');
  const rising = [...(changes.movers?.rising ?? [])].sort((a, b) => b.currentScore - a.currentScore);
  if (rising.length === 0) throw new Error('오늘 상승 테마 없음 — 발행 소재가 없다');

  // 랭킹 글은 개별 테마가 아니라 전체 집계를 쓴다
  if (postType === 'ranking') {
    const rows: RankingRow[] = rising.map((m) => ({
      change: m.change,
      name: m.name,
      score: m.currentScore,
      stageKo: m.currentStage,
    }));
    const asOf = new Date().toISOString().slice(0, 10);
    const composed = composeRanking(rows, asOf, SITE);
    const images = await captureThemeImages(rising[0].themeId, join(dirname(outPath), 'images'));
    if (images.length < FORMAT.minImages) {
      throw new Error(`이미지 ${images.length}장 — 최소 ${FORMAT.minImages}장 필요`);
    }
    writeDraft(outPath, { ...composed, outsideUrl: `${SITE}/themes`, images: images.map((i) => i.path) });
    return;
  }

  // 검색량 검증: 네이버에서 실제로 검색되는 테마만 쓴다
  const creds = credentialsFromEnv();
  let chosen: Mover | undefined;

  if (creds) {
    for (let i = 0; i < rising.length; i += 5) {
      const batch = rising.slice(i, i + 5);
      const volumes = await fetchKeywordVolumes(creds, batch.map((m) => m.name)).catch(() => []);
      const norm = (k: string) => k.replace(/\s+/g, '').toUpperCase();
      chosen = batch.find((m) =>
        (volumes.find((v) => norm(v.keyword) === norm(m.name))?.total ?? 0) >= MIN_VOLUME &&
        !isThemeOnCooldown(m.themeId, Date.now(), THEME_COOLDOWN_DAYS),
      );
      if (chosen) break;
      await new Promise((r) => setTimeout(r, 350));
    }
    if (!chosen) throw new Error(`상승 테마 ${rising.length}개 전부 검색량 ${MIN_VOLUME} 미만 — 오늘은 쓰지 않는다`);
  } else {
    console.warn('[Draft] NAVER_AD_* 없음 — 검색량 검증 생략, 점수 최상위 테마 사용');
    chosen = rising.find((m) => !isThemeOnCooldown(m.themeId, Date.now(), THEME_COOLDOWN_DAYS)) ?? rising[0];
  }

  const theme = await getJson<ThemeDetail>(`/api/tli/themes/${chosen.themeId}`);
  const stocks = stockNames(theme);
  const themeUrl = `${SITE}/themes/${chosen.themeId}`;

  // 이미지 캡처 — FORMAT-SPEC상 0장은 발행 차단 조건
  const images = await captureThemeImages(chosen.themeId, join(dirname(outPath), 'images'));
  if (images.length < FORMAT.minImages) {
    throw new Error(`이미지 ${images.length}장 — 최소 ${FORMAT.minImages}장 필요. 발행하지 않는다.`);
  }
  const imagePaths = images.map((i) => i.path);

  // 유사 패턴 글 — 비교 데이터가 있을 때만. 없으면 theme으로 떨어진다.
  if (postType === 'similar' && (theme.comparisons?.length ?? 0) > 0) {
    const composed = composeSimilar(
      theme.name,
      theme.score.value,
      theme.score.stageKo,
      theme.comparisons!,
      theme.score.updatedAt,
      themeUrl,
    );
    writeDraft(outPath, { ...composed, outsideUrl: themeUrl, images: imagePaths });
    recordTheme(chosen.themeId, Date.now(), THEME_COOLDOWN_DAYS);
    return;
  }

  writeDraft(outPath, {
    title: composeTitle(theme, stocks.length),
    tags: composeTags(theme),
    body: composeBody(theme, chosen.themeId, chosen.change),
    outsideUrl: themeUrl,
    images: imagePaths,
  });
  recordTheme(chosen.themeId, Date.now(), THEME_COOLDOWN_DAYS);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
