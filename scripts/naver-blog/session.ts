/**
 * 네이버 블로그 자동화 — 세션·발행량 관리
 *
 * 로그인은 자동화하지 않는다. 네이버 로그인은 봇 탐지가 가장 강한 지점이고
 * (캡차·신규기기 인증·2FA) 자동화하면 깨지기 쉬울뿐더러 계정 자체가 위험해진다.
 * 사람이 `npm run naver:login`으로 한 번 로그인해 세션을 저장하고,
 * 발행 스크립트는 그 세션을 재사용한다.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 세션·발행 기록 저장 위치. 자격증명이 들어있으므로 반드시 gitignore. */
export const NAVER_STATE_DIR = join(process.cwd(), '.naver-blog');
export const SESSION_PATH = join(NAVER_STATE_DIR, 'session.json');
const HISTORY_PATH = join(NAVER_STATE_DIR, 'publish-history.json');

/**
 * 주간 발행 상한.
 *
 * 자사 블로그는 하루 7건(DAILY_POST_COUNT)으로 돌지만 그 볼륨을 네이버로 가져가면
 * 스팸 신호가 된다 — 네이버가 글쓰기 API를 없앤 이유가 정확히 대량 자동 발행이었다.
 * 코드로 상한을 걸어 실수로도 넘지 못하게 한다.
 */
export const WEEKLY_PUBLISH_LIMIT = 3;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function ensureStateDir(): void {
  if (!existsSync(NAVER_STATE_DIR)) mkdirSync(NAVER_STATE_DIR, { recursive: true });
}

export function hasSession(): boolean {
  return existsSync(SESSION_PATH);
}

export function readHistory(): string[] {
  try {
    const parsed = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** 최근 7일 발행 건수. now를 주입받아 테스트 가능하게 둔다. */
export function recentPublishCount(history: string[], now: number): number {
  return history.filter((iso) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) && now - t < WEEK_MS;
  }).length;
}

export function canPublish(history: string[], now: number, limit = WEEKLY_PUBLISH_LIMIT): boolean {
  return recentPublishCount(history, now) < limit;
}

/** 발행 성공 시각을 기록하고, 7일보다 오래된 항목은 버린다. */
export function recordPublish(now: number): void {
  ensureStateDir();
  const kept = readHistory().filter((iso) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) && now - t < WEEK_MS;
  });
  kept.push(new Date(now).toISOString());
  mkdirSync(dirname(HISTORY_PATH), { recursive: true });
  writeFileSync(HISTORY_PATH, `${JSON.stringify(kept, null, 2)}\n`, 'utf-8');
}
