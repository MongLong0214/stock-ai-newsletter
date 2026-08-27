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
import { composeEvergreen } from './compose-evergreen';
import { composeNews, composeRanking, composeSimilar, filterNewsItems, type ComparisonRow } from './compose-variants';
import { checkFormat, FORMAT, QUOTE_PREFIX } from './format';
import { evergreenIndexForDate, THEME_COOLDOWN_DAYS, TYPE_PLANS, typeForDate, type PostType } from './post-types';
import { isThemeOnCooldown, readThemeHistory } from './session';

const SITE = 'https://stockmatrix.co.kr';
/** 이 미만 검색량이면 네이버에 써도 읽힐 가능성이 낮다 */
const MIN_VOLUME = 200;

/**
 * 발행 후보 테마.
 *
 * 출처를 /api/tli/changes(movers)에서 /api/tli/scores/ranking으로 바꿨다. changes는
 * rising을 **10개로 잘라서** 반환하므로(app/api/tli/changes/route.ts:154) 후보가 10개뿐이고,
 * 5/7 유형이 개별 테마를 쓰는 매일 발행 + 14일 쿨다운에서는 열흘이면 전부 쿨다운에 걸려
 * 매일 실패한다. ranking은 단계별 최대 50개씩 주므로 후보가 수백 개다.
 */
interface Candidate {
  /** 7일 변화. changes의 1일 변화를 쓰던 것을 본문 문구('최근 7일 변화')에 맞췄다. */
  change7d: number;
  name: string;
  score: number;
  stageKo: string;
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

/** 본문에 실제로 나열하는 종목 수 상한. 제목의 TOP N도 이 값을 넘지 않는다. */
export const MAX_LISTED_STOCKS = 8;

/**
 * 본문에 실제로 싣는 종목 목록.
 *
 * 제목은 stocks.length로 "TOP 12"라 쓰고 본문은 slice(0, 8)만 나열해 개수가 어긋났다.
 * 제목·소제목·태그·목록이 전부 이 배열 하나를 본다.
 */
export const listedStocks = (theme: ThemeDetail): Stock[] =>
  (theme.stocks ?? []).filter((s) => s.name).slice(0, MAX_LISTED_STOCKS);

/** 종목명 목록. 본문·태그·제목이 같은 소스를 봐야 개수가 어긋나지 않는다. */
export const stockNames = (theme: ThemeDetail): string[] =>
  listedStocks(theme).map((s) => s.name);

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export { FORMAT, QUOTE_PREFIX } from './format';

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
  const totalStocks = (theme.stocks ?? []).length;
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
    const scope = totalStocks > stocks.length
      ? `이 테마로 묶이는 종목 ${totalStocks}개 중 상위 ${stocks.length}개입니다.`
      : `이 테마로 묶이는 종목은 아래 ${stocks.length}개입니다.`;
    blocks.push(
      `${scope} 시장 구분과 함께 정리했습니다.\n` +
      listedStocks(theme)
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
  /** 발행 성공 시에만 쿨다운을 기록하도록 publish.ts로 넘긴다 */
  themeId: string;
  title: string;
}

/** 규격 검증 후 파일로 낸다 — 위반은 발행 전에 잡는다 */
function writeDraft(outPath: string, draft: DraftPayload): void {
  const plain = draft.body.replace(/>> |\*\*|\[\[[rb]:|\]\]/g, '');
  const violations = checkFormat(draft, { fileExists: existsSync });
  if (violations.length) throw new Error(`FORMAT-SPEC 위반: ${violations.join(' / ')}`);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf-8');
  console.log(`초안 생성: ${outPath}`);
  console.log(`  제목: ${draft.title} (${draft.title.length}자)`);
  console.log(`  본문: ${plain.length}자 / 태그 ${draft.tags.length}개 / 이미지 ${draft.images.length}장`);
}

/**
 * 타임아웃 없는 fetch는 CI에서 잡이 무한 대기한다.
 *
 * 60초인 이유: /api/tli/scores/ranking은 단계별 상위 50개를 위해 활성 테마 전체의
 * 점수·종목·뉴스를 배치 집계한다. 캐시가 식은 첫 호출이 30초를 넘길 수 있다.
 */
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${SITE}${path}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()).data;
}

interface RankingItem {
  change7d?: number;
  id: string;
  name: string;
  score: number;
  stageKo: string;
}

const STAGE_BUCKETS = ['emerging', 'growth', 'peak', 'decline', 'reigniting'] as const;

/** 검색량 조회 비용 상한 — 5개씩 6배치 */
const VOLUME_CHECK_MAX = 30;
/** 뉴스 유형 최소 기사 수. 미만이면 theme으로 떨어진다. */
const MIN_NEWS = 5;

/** 단계별 버킷을 합쳐 점수순 후보 목록으로 만든다. reigniting은 다른 단계와 겹치므로 id로 중복 제거. */
async function fetchCandidates(): Promise<Candidate[]> {
  const ranking = await getJson<Partial<Record<(typeof STAGE_BUCKETS)[number], RankingItem[]>>>(
    '/api/tli/scores/ranking?limit=50',
  );
  const byId = new Map<string, Candidate>();
  for (const bucket of STAGE_BUCKETS) {
    for (const t of ranking[bucket] ?? []) {
      if (!t?.id || !t.name || byId.has(t.id)) continue;
      byId.set(t.id, {
        change7d: t.change7d ?? 0,
        name: t.name,
        score: t.score ?? 0,
        stageKo: t.stageKo,
        themeId: t.id,
      });
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

/**
 * 이미지 출처 테마.
 *
 * 랭킹·상시 글도 자사 페이지 캡처를 쓰므로 테마를 하나 고른다. 쿨다운을 무시하면
 * 다음 날 그 테마의 개별 글이 나올 때 이미지 6장이 그대로 겹쳐 "동일 문서 반복"이 된다.
 */
function pickImageTheme(candidates: readonly Candidate[], now: number): Candidate {
  const fresh = candidates.find((c) => !isThemeOnCooldown(c.themeId, now, THEME_COOLDOWN_DAYS));
  if (fresh) return fresh;

  // 전원 쿨다운이면 1위를 재사용하던 것을 고쳤다 — 그러면 같은 이미지 6장이 반복된다.
  // 가장 오래전에 쓴 테마를 고르면 간격이 최대가 된다.
  const history = readThemeHistory();
  const lastUsed = (id: string) => Date.parse(history[id] ?? '') || 0;
  return [...candidates].sort((a, b) => lastUsed(a.themeId) - lastUsed(b.themeId))[0];
}

async function capture(themeId: string, outPath: string): Promise<string[]> {
  const images = await captureThemeImages(themeId, join(dirname(outPath), 'images'));
  if (images.length < FORMAT.minImages) {
    throw new Error(`이미지 ${images.length}장 — 최소 ${FORMAT.minImages}장 필요. 발행하지 않는다.`);
  }
  return images.map((i) => i.path);
}

/** 쿨다운 통과 + 네이버 실검색량 확인. 상승 테마를 먼저 본다. */
async function pickTheme(candidates: readonly Candidate[], now: number): Promise<Candidate> {
  const fresh = candidates.filter((c) => !isThemeOnCooldown(c.themeId, now, THEME_COOLDOWN_DAYS));
  if (fresh.length === 0) {
    throw new Error(`후보 ${candidates.length}개 전부 ${THEME_COOLDOWN_DAYS}일 쿨다운 — 오늘은 쓰지 않는다`);
  }
  const ordered = [...fresh].sort(
    (a, b) => Number(b.change7d > 0) - Number(a.change7d > 0) || b.score - a.score,
  );

  const creds = credentialsFromEnv();
  if (!creds) {
    // fail-open이던 자리다. 시크릿이 비거나 이름이 틀리면 "실측 검색량 200 이상"이라는
    // 약속이 조용히 사라지고, 아무도 검색하지 않는 테마 글이 매일 올라간다.
    throw new Error(
      'NAVER_AD_* 자격증명이 없습니다 — 검색량을 검증할 수 없어 발행하지 않습니다.\n' +
        '.env.local 또는 GitHub Secrets에 NAVER_AD_CREDS(JSON) 또는 ' +
        'NAVER_AD_CUSTOMER_ID/NAVER_AD_API_KEY/NAVER_AD_SECRET_KEY를 설정하세요.',
    );
  }

  const norm = (k: string) => k.replace(/\s+/g, '').toUpperCase();
  const scanned = Math.min(ordered.length, VOLUME_CHECK_MAX);
  for (let i = 0; i < scanned; i += 5) {
    const batch = ordered.slice(i, i + 5);
    const volumes = await fetchKeywordVolumes(creds, batch.map((c) => c.name)).catch((e: unknown) => {
      console.warn(`[Draft] 검색량 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    });
    const hit = batch.find(
      (c) => (volumes.find((v) => norm(v.keyword) === norm(c.name))?.total ?? 0) >= MIN_VOLUME,
    );
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(`후보 ${scanned}개 전부 검색량 ${MIN_VOLUME} 미만 — 오늘은 쓰지 않는다`);
}

async function main(): Promise<void> {
  const outIdx = process.argv.indexOf('--out');
  const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : '.naver-blog/draft.json';
  const now = Date.now();

  // KST 날짜로 유형을 정한다 — 상태 복원이 실패해도 로테이션은 맞는다
  const requested = process.argv.includes('--type')
    ? process.argv[process.argv.indexOf('--type') + 1]
    : typeForDate(now);
  if (!(requested in TYPE_PLANS)) throw new Error(`알 수 없는 글 유형: ${requested}`);
  const postType = requested as PostType;
  console.log(`글 유형: ${postType}`);

  const candidates = await fetchCandidates();
  if (candidates.length === 0) throw new Error('점수가 산출된 테마 없음 — 발행 소재가 없다');
  const asOf = new Date(now).toISOString().slice(0, 10);

  // 랭킹·상시 글은 개별 테마가 아니라 전체 집계를 쓴다. 이미지만 한 테마에서 가져온다.
  if (postType === 'ranking' || postType === 'evergreen') {
    const imageTheme = pickImageTheme(candidates, now);
    const images = await capture(imageTheme.themeId, outPath);

    const composed = postType === 'ranking'
      ? composeRanking(
          candidates.map((c) => ({ change: c.change7d, name: c.name, score: c.score, stageKo: c.stageKo })),
          asOf,
          SITE,
        )
      : composeEvergreen(evergreenIndexForDate(now), {
          asOf,
          risers7d: candidates.filter((c) => c.change7d > 0).length,
          sampledThemes: candidates.length,
          topName: candidates[0].name,
          topScore: candidates[0].score,
          topStageKo: candidates[0].stageKo,
        }, SITE);

    writeDraft(outPath, {
      body: composed.body,
      images,
      outsideUrl: postType === 'ranking' ? `${SITE}/themes` : `${SITE}/themes/methodology`,
      tags: composed.tags,
      themeId: imageTheme.themeId,
      title: composed.title,
    });
    return;
  }

  const chosen = await pickTheme(candidates, now);
  const theme = await getJson<ThemeDetail>(`/api/tli/themes/${chosen.themeId}`);
  const themeUrl = `${SITE}/themes/${chosen.themeId}`;
  const images = await capture(chosen.themeId, outPath);

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
    writeDraft(outPath, { ...composed, outsideUrl: themeUrl, images, themeId: chosen.themeId });
    return;
  }

  // 뉴스 글 — 기사가 충분할 때만
  // 정제 후 건수로 판정한다 — 원시 5건이 전부 광고성이면 기사 0건짜리 뉴스 글이 된다
  const news = filterNewsItems(theme.recentNews ?? []);
  if (postType === 'news' && news.length >= MIN_NEWS) {
    const composed = composeNews(
      theme.name,
      theme.score.value,
      theme.score.stageKo,
      news,
      theme.score.raw.newsThisWeek,
      theme.score.raw.newsLastWeek,
      theme.score.updatedAt,
      themeUrl,
    );
    writeDraft(outPath, { ...composed, outsideUrl: themeUrl, images, themeId: chosen.themeId });
    return;
  }
  // 데이터가 모자라 유형을 못 쓰면 theme이 아니라 ranking으로 떨어뜨린다.
  // theme은 이미 로테이션의 3/7이라, 폴백까지 theme으로 보내면 같은 템플릿이 몰린다.
  if (postType === 'news' || postType === 'similar') {
    const reason = postType === 'news' ? `기사 ${news.length}건 (최소 ${MIN_NEWS})` : '비교 데이터 없음';
    console.warn(`[Draft] ${reason} — ranking 유형으로 대체`);
    const composed = composeRanking(
      candidates.map((c) => ({ change: c.change7d, name: c.name, score: c.score, stageKo: c.stageKo })),
      asOf,
      SITE,
    );
    writeDraft(outPath, {
      body: composed.body,
      images,
      outsideUrl: `${SITE}/themes`,
      tags: composed.tags,
      themeId: chosen.themeId,
      title: composed.title,
    });
    return;
  }

  writeDraft(outPath, {
    title: composeTitle(theme, stockNames(theme).length),
    tags: composeTags(theme),
    body: composeBody(theme, chosen.themeId, chosen.change7d),
    outsideUrl: themeUrl,
    images,
    themeId: chosen.themeId,
  });
}

// 직접 실행일 때만 돈다. 이 모듈은 FORMAT·compose* 를 내보내므로 테스트가 import하는데,
// 가드가 없으면 import만으로 main()이 돌아 실제 API를 치고 process.exit(1)로 러너를 죽인다.
// endsWith인 이유: includes('make-draft')는 make-draft.test.ts에서도 참이 된다.
if (process.argv[1]?.endsWith('make-draft.ts')) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
