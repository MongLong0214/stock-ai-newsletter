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
import { dirname, resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });

import { credentialsFromEnv, fetchKeywordVolumes } from '@/lib/naver-searchad';

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

interface ThemeDetail {
  name: string;
  score: {
    components: { activity: number; interest: number; newsMomentum: number; volatility: number };
    raw: { baseline30dAvg: number; newsLastWeek: number; newsThisWeek: number; recent7dAvg: number };
    stageKo: string;
    updatedAt: string;
    value: number;
  };
  topStocks?: string[];
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

/** 수치를 그대로 서술한다 — 해석·전망·권유를 넣지 않는다 (YMYL) */
export function composeBody(theme: ThemeDetail, themeId: string, change: number): string {
  const s = theme.score;
  const c = s.components;
  const r = s.raw;
  const newsDir = r.newsThisWeek >= r.newsLastWeek ? '늘었습니다' : '줄었습니다';
  const interestDir = r.recent7dAvg >= r.baseline30dAvg ? '웃돕니다' : '밑돕니다';

  const parts = [
    `${theme.name} 테마의 생명주기 점수가 ${s.value}점(100점 만점)입니다. 최근 7일 변화는 ${change >= 0 ? '+' : ''}${change}점이고, 단계는 '${s.stageKo}' 구간입니다. 기준일은 ${s.updatedAt}입니다.`,
    `점수를 구성하는 네 요소는 검색 관심도 ${pct(c.interest)}, 뉴스 모멘텀 ${pct(c.newsMomentum)}, 활동성 ${pct(c.activity)}, 변동성 ${pct(c.volatility)} 수준입니다.`,
    `뉴스는 이번 주 ${r.newsThisWeek}건으로 지난주 ${r.newsLastWeek}건보다 ${newsDir}. 검색 관심도의 7일 평균(${r.recent7dAvg.toFixed(1)})은 30일 평균(${r.baseline30dAvg.toFixed(1)})을 ${interestDir}.`,
  ];

  if (theme.topStocks?.length) {
    parts.push(`이 테마로 묶이는 종목은 ${theme.topStocks.slice(0, 6).join(', ')} 등입니다.`);
  }

  parts.push(
    '이 점수는 네이버 데이터랩 검색 트렌드와 뉴스 건수, KRX 시세를 매일 자동 집계해 계산한 참고용 데이터입니다. 특정 종목의 매수·매도를 권하는 것이 아니며, 투자 판단과 그 결과는 투자자 본인의 책임입니다.',
    '점수 산출 방식과 가중치는 아래 페이지에 공개되어 있습니다.',
  );

  return parts.join('\n\n');
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${SITE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()).data;
}

async function main(): Promise<void> {
  const outIdx = process.argv.indexOf('--out');
  const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : '.naver-blog/draft.json';

  const changes = await getJson<{ movers: { rising: Mover[] } }>('/api/tli/changes?period=1d');
  const rising = [...(changes.movers?.rising ?? [])].sort((a, b) => b.currentScore - a.currentScore);
  if (rising.length === 0) throw new Error('오늘 상승 테마 없음 — 발행 소재가 없다');

  // 검색량 검증: 네이버에서 실제로 검색되는 테마만 쓴다
  const creds = credentialsFromEnv();
  let chosen: Mover | undefined;

  if (creds) {
    for (let i = 0; i < rising.length; i += 5) {
      const batch = rising.slice(i, i + 5);
      const volumes = await fetchKeywordVolumes(creds, batch.map((m) => m.name)).catch(() => []);
      const norm = (k: string) => k.replace(/\s+/g, '').toUpperCase();
      chosen = batch.find((m) => (volumes.find((v) => norm(v.keyword) === norm(m.name))?.total ?? 0) >= MIN_VOLUME);
      if (chosen) break;
      await new Promise((r) => setTimeout(r, 350));
    }
    if (!chosen) throw new Error(`상승 테마 ${rising.length}개 전부 검색량 ${MIN_VOLUME} 미만 — 오늘은 쓰지 않는다`);
  } else {
    console.warn('[Draft] NAVER_AD_* 없음 — 검색량 검증 생략, 점수 최상위 테마 사용');
    chosen = rising[0];
  }

  const theme = await getJson<ThemeDetail>(`/api/tli/themes/${chosen.themeId}`);
  const draft = {
    title: `${theme.name} 테마 생명주기 점수 ${theme.score.value}점 — ${theme.score.updatedAt} 기준`,
    tags: [theme.name, '테마주', '주식데이터'].slice(0, 10),
    body: composeBody(theme, chosen.themeId, chosen.change),
    outsideUrl: `${SITE}/themes/${chosen.themeId}`,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf-8');
  console.log(`초안 생성: ${outPath}`);
  console.log(`  테마: ${theme.name} (${theme.score.value}점, ${chosen.change >= 0 ? '+' : ''}${chosen.change})`);
  console.log(`  제목: ${draft.title}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
