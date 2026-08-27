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
/** 테마별 마지막 발행 시각 — 같은 테마 재발행 쿨다운용 */
const THEME_LOG_PATH = join(NAVER_STATE_DIR, 'theme-history.json');

/**
 * 주간 발행 상한 — 매일 1편 기준 7건.
 *
 * 빈도 자체는 문제가 아니다. 네이버 C-Rank는 꾸준한 발행을 활동성 신호로 보고,
 * 상위 블로그는 대부분 매일 쓴다. 위험한 것은 같은 템플릿의 반복이므로
 * post-types.ts의 5종 로테이션과 테마 쿨다운으로 그쪽을 막는다.
 *
 * 이 상한은 폭주 방지용이다 — 스케줄이 중복 실행되거나 수동 실행이 겹쳐도
 * 하루치를 크게 넘지 못하게 한다.
 */
export const WEEKLY_PUBLISH_LIMIT = Number(process.env.NAVER_WEEKLY_LIMIT) || 7;

/** 테스트용 우회. NAVER_SKIP_LIMIT=1이면 상한 검사를 건너뛴다(발행 기록은 그대로 남긴다). */
const skipLimit = () => process.env.NAVER_SKIP_LIMIT === '1';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function ensureStateDir(): void {
  if (!existsSync(NAVER_STATE_DIR)) mkdirSync(NAVER_STATE_DIR, { recursive: true });
}

/**
 * 세션 확보. 로컬은 naver:login이 만든 파일, CI는 NAVER_SESSION_B64 시크릿에서 복원한다.
 *
 * CI 주의: 세션은 사람이 로그인한 IP·기기에서 만들어진다. GitHub Actions 러너는
 * 데이터센터 IP라 네이버가 세션 탈취 신호로 볼 수 있다 — 조용히 만료되거나
 * 재인증을 요구할 수 있으므로 publish 스크립트가 만료를 감지해 실패시킨다.
 */
export function ensureSession(): boolean {
  if (existsSync(SESSION_PATH)) return true;

  const encoded = process.env.NAVER_SESSION_B64;
  if (!encoded) return false;

  try {
    ensureStateDir();
    writeFileSync(SESSION_PATH, Buffer.from(encoded, 'base64').toString('utf-8'), 'utf-8');
    console.log('[Naver] NAVER_SESSION_B64에서 세션 복원');
    return true;
  } catch (error) {
    console.error('[Naver] 세션 복원 실패:', error);
    return false;
  }
}

export function hasSession(): boolean {
  return ensureSession();
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
  if (skipLimit()) {
    console.warn('[Naver] NAVER_SKIP_LIMIT=1 — 주간 상한 검사를 건너뜁니다(테스트 모드)');
    return true;
  }
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


/** 최근 발행한 테마 id → ISO 시각 */
export function readThemeHistory(): Record<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(THEME_LOG_PATH, 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** 쿨다운이 지나지 않은 테마인가 */
export function isThemeOnCooldown(themeId: string, now: number, cooldownDays: number): boolean {
  const last = readThemeHistory()[themeId];
  if (!last) return false;
  const t = Date.parse(last);
  return Number.isFinite(t) && now - t < cooldownDays * 24 * 60 * 60 * 1000;
}

/** 테마 발행 기록. 쿨다운의 2배가 지난 항목은 정리한다. */
export function recordTheme(themeId: string, now: number, cooldownDays: number): void {
  ensureStateDir();
  const keepMs = cooldownDays * 2 * 24 * 60 * 60 * 1000;
  const history = readThemeHistory();
  const kept: Record<string, string> = {};
  for (const [id, iso] of Object.entries(history)) {
    const t = Date.parse(iso);
    if (Number.isFinite(t) && now - t < keepMs) kept[id] = iso;
  }
  kept[themeId] = new Date(now).toISOString();
  writeFileSync(THEME_LOG_PATH, `${JSON.stringify(kept, null, 2)}\n`, 'utf-8');
}
