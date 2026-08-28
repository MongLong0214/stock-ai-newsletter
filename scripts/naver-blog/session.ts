/**
 * 네이버 블로그 자동화 — 세션·발행량 관리
 *
 * 로그인은 자동화하지 않는다. 네이버 로그인은 봇 탐지가 가장 강한 지점이고
 * (캡차·신규기기 인증·2FA) 자동화하면 깨지기 쉬울뿐더러 계정 자체가 위험해진다.
 * 사람이 `npm run naver:login`으로 한 번 로그인해 세션을 저장하고,
 * 발행 스크립트는 그 세션을 재사용한다.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 세션·발행 기록 저장 위치. 자격증명이 들어있으므로 반드시 gitignore. */
export const NAVER_STATE_DIR = join(process.cwd(), '.naver-blog');
export const SESSION_PATH = join(NAVER_STATE_DIR, 'session.json');
/**
 * 발행 기록 디렉토리 — 세션과 분리한다.
 *
 * CI가 이 디렉토리만 actions/cache로 실행 간에 넘긴다. session.json과 한 폴더에 두면
 * 로그인 쿠키가 캐시에 올라간다. 자격증명은 절대 캐시하지 않는다.
 */
export const PUBLISH_STATE_DIR = join(NAVER_STATE_DIR, 'state');
const HISTORY_PATH = join(PUBLISH_STATE_DIR, 'publish-history.json');
/** 테마별 마지막 발행 시각 — 같은 테마 재발행 쿨다운용 */
const THEME_LOG_PATH = join(PUBLISH_STATE_DIR, 'theme-history.json');

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

/**
 * 롤링 윈도우.
 *
 * 정확히 168시간으로 두면 매일 1편 + 상한 7편에서 경계가 충돌한다 — 7일 전 글이
 * 10:08에 발행되고 오늘 게이트가 10:06에 돌면 그 글이 아직 윈도우 안이라
 * 정상 8일째 발행이 거절된다. 러너 실행 시각 흔들림만으로 발생한다.
 * 6시간 여유를 둬 경계 충돌을 없애면서 폭주 방지 기능은 유지한다.
 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000 - 6 * 60 * 60 * 1000;

export function ensureStateDir(): void {
  if (!existsSync(NAVER_STATE_DIR)) mkdirSync(NAVER_STATE_DIR, { recursive: true, mode: 0o700 });
  if (!existsSync(PUBLISH_STATE_DIR)) mkdirSync(PUBLISH_STATE_DIR, { recursive: true });
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
    // 로그인 쿠키다. 공유 러너·공유 맥에서 다른 사용자가 읽지 못하게 소유자 전용으로 만든다.
    writeFileSync(SESSION_PATH, Buffer.from(encoded, 'base64').toString('utf-8'), { encoding: 'utf-8', mode: 0o600 });
    chmodSync(SESSION_PATH, 0o600);
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

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 날짜 문자열 — 하루 1편 판정용 */
const kstDate = (ms: number) => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);

/**
 * 같은 KST 날짜에 이미 발행했는가.
 *
 * 주간 상한만으로는 부족하다 — 이력이 2건인 날 크론 발행 후 workflow_dispatch를 두 번
 * 더 돌리면 각각 상한 7 미만이라 같은 날 3편이 공개된다. 매일 1편이 설계값이므로
 * 날짜 단위로 막는다.
 */
export function publishedToday(history: string[], now: number): boolean {
  const today = kstDate(now);
  return history.some((iso) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) && kstDate(t) === today;
  });
}

export function canPublish(history: string[], now: number, limit = WEEKLY_PUBLISH_LIMIT): boolean {
  if (skipLimit()) {
    console.warn('[Naver] NAVER_SKIP_LIMIT=1 — 주간 상한 검사를 건너뜁니다(테스트 모드)');
    return true;
  }
  if (publishedToday(history, now)) {
    console.warn('[Naver] 오늘(KST) 이미 발행했습니다 — 하루 1편입니다');
    return false;
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
  writeFileSync(HISTORY_PATH, `${JSON.stringify(kept, null, 2)}\n`, 'utf-8');
}


const PENDING_PATH = join(PUBLISH_STATE_DIR, 'pending-publish.json');

/**
 * 발행 시도 표식.
 *
 * 최종 발행 버튼을 누른 직후 네이버는 저장했는데 응답·프로세스가 끊기면
 * recordPublish가 실행되지 않는다. 그 상태에서 재실행하면 같은 글이 한 번 더 올라간다.
 * 클릭 **전에** 표식을 남기고 성공 시 지우면, 남아 있는 표식이 곧 "결과 미확인"이다.
 */
export function markPublishPending(title: string, now: number): void {
  ensureStateDir();
  writeFileSync(PENDING_PATH, `${JSON.stringify({ title, at: new Date(now).toISOString() }, null, 2)}\n`, 'utf-8');
}

export function readPublishPending(): { at: string; title: string } | null {
  try {
    const parsed = JSON.parse(readFileSync(PENDING_PATH, 'utf-8'));
    return typeof parsed?.title === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPublishPending(): void {
  try {
    if (existsSync(PENDING_PATH)) rmSync(PENDING_PATH);
  } catch (error) {
    console.warn('[Naver] 발행 표식 삭제 실패:', error);
  }
}

/**
 * 레포에 커밋되는 쿨다운 시드.
 *
 * GitHub Actions 캐시는 **피처 브랜치 → main으로 복원되지 않는다.** 그래서 브랜치에서
 * 쌓은 14일 쿨다운이 머지 직후의 main 크론에는 존재하지 않고, 방금 올린 테마가 다시
 * 1순위로 뽑힌다 — 같은 템플릿 반복이 네이버 저품질의 대표 트리거다.
 * 캐시 유실(7일 미사용 만료)에도 같은 문제가 생긴다.
 *
 * 이 파일이 그 경계를 메운다. 쿨다운(14일)보다 오래된 항목은 자연히 무시되므로
 * 시드가 낡아도 해롭지 않다.
 */
const SEED_PATH = join(process.cwd(), 'scripts', 'naver-blog', 'theme-history-seed.json');

function readSeed(): Record<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
    if (!parsed || typeof parsed !== 'object') return {};
    // `_`로 시작하는 키는 설명용이다
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([k, v]) => !k.startsWith('_') && typeof v === 'string'),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

/** 최근 발행한 테마 id → ISO 시각. 시드와 캐시 이력을 병합한다(더 최근 값이 이김). */
export function readThemeHistory(): Record<string, string> {
  let cached: Record<string, string> = {};
  try {
    const parsed = JSON.parse(readFileSync(THEME_LOG_PATH, 'utf-8'));
    if (parsed && typeof parsed === 'object') cached = parsed as Record<string, string>;
  } catch {
    cached = {};
  }

  const merged = { ...readSeed() };
  for (const [id, iso] of Object.entries(cached)) {
    const prev = Date.parse(merged[id] ?? '');
    const next = Date.parse(iso);
    if (!Number.isFinite(prev) || (Number.isFinite(next) && next > prev)) merged[id] = iso;
  }
  return merged;
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
