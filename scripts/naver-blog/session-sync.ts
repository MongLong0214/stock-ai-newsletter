#!/usr/bin/env tsx
/**
 * 세션 유지·갱신 — 로그인은 사람이, 그 뒤는 전부 자동으로.
 *
 *   npm run naver:session         # 검증 + 키프얼라이브 (CI 첫 단계)
 *   npm run naver:session:push    # 검증 후 GitHub 시크릿 강제 갱신 (로컬 → CI 전파)
 *
 * `--push`는 인증 쿠키가 **회전했을 때만** 시크릿을 쓴다. 이 비교는 로컬 파일의
 * before/after라서 CI에서는 정확하지만(세션이 시크릿에서 복원되므로 시작 시점에
 * 로컬 == 시크릿), 로컬에서는 **시크릿이 낡았는지 알 수 없다**(시크릿 값은 읽을 수 없다).
 * 그래서 로컬에서 전파할 때는 `--force`가 필요하고, `naver:login`과
 * `naver:session:push`가 그것을 붙여 준다.
 *
 * 로그인 자동화는 하지 않는다(계정 위험). 자동화하는 것은 **세션 수명 관리**다.
 *
 * ## 세션은 왜 죽었나 (2026-09-03 실측)
 *
 * `NID_AUT`·`NID_SES`는 **절대 만료가 없는 세션 쿠키**다. 수명은 서버가 활동 기준으로
 * 정한다. 실제 타임라인:
 *
 *   8/27 로그인 → 8/28~8/31 CI가 매일 사용 → 같은 쿠키값으로 5일 생존
 *   9/1~9/2 CI가 방화벽 429로 draft 단계에서 즉사 → 네이버를 아예 건드리지 않음
 *   9/3 세션 사망 (`blog.naver.com/MyBlog`로 떨어짐)
 *
 * 즉 **미사용 3일이 원인**이다. 그래서 발행이 실패하는 날에도 세션은 건드려야 한다 —
 * 특히 "후보 전부 검색량 미달 → 오늘은 쓰지 않는다"는 **설계된 정상 종료**라서
 * 발행 없는 날이 주기적으로 생긴다. 그런 날 세션이 썩으면 사람이 또 로그인해야 한다.
 *
 * 그래서 이 스크립트를 draft 생성 **앞**에 둔다. 뒤 단계가 어떻게 실패하든 네이버는
 * 매일 한 번 접촉되고, 세션이 죽었으면 캡처·초안 비용을 쓰기 전에 즉시 멈춘다.
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium, type Browser } from 'playwright';
import {
  detectBlogIdFromUrl,
  resolveBlogId,
} from './draft-model';
import { ensureSession, ensureStateDir, SESSION_PATH } from './session';
import { accountBlockError, detectAccountBlock, isAccountBlocked } from './account-state';

const SECRET_NAME = 'NAVER_SESSION_B64';
/** 네이버가 흔들릴 때 사람을 부르지 않는다 — 일시 오류는 재시도로 흡수한다. */
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 4_000, 12_000];

/** 로그인 상태를 담는 쿠키. 이 셋 중 하나라도 바뀌면 시크릿을 갱신해야 한다. */
const AUTH_COOKIES = ['NID_AUT', 'NID_SES', 'nid_inf'] as const;

interface StorageState {
  cookies?: Array<{ domain: string; name: string; value: string }>;
}

/**
 * 인증 쿠키의 지문. **값은 절대 로그·argv에 남기지 않으므로** 해시만 쓴다.
 * 값이 회전(rotate)했는지 비교하는 용도다.
 */
export function authFingerprint(state: StorageState): string {
  const parts = AUTH_COOKIES.map((name) => {
    const hit = (state.cookies ?? []).find((c) => c.name === name && /naver/.test(c.domain));
    return `${name}=${hit ? createHash('sha256').update(hit.value).digest('hex').slice(0, 16) : '-'}`;
  });
  return parts.join(' ');
}

export function hasAuthCookies(state: StorageState): boolean {
  return (state.cookies ?? []).some((c) => c.name === 'NID_AUT' && /naver/.test(c.domain));
}

export type FailureKind = 'blocked' | 'expired' | 'transient';

/**
 * 사람을 불러야 하는 실패와 재시도로 풀리는 실패를 가른다.
 *
 * 이 구분이 핵심이다. 네이버가 잠깐 흔들린 것을 "세션 만료"로 보고하면 Isaac이
 * 필요 없는 로그인을 하게 되고, 반대로 만료를 일시 오류로 보면 재시도만 반복하다
 * 발행이 조용히 밀린다.
 */
export function classifyFailure(message: string): FailureKind {
  // 계정 차단(보호조치·캡차·이용제한)은 재시도로 절대 풀리지 않고, 재시도 자체가
  // 접근 빈도를 늘려 상황을 악화시킨다. 가장 먼저 갈라낸다.
  if (isAccountBlocked(message)) return 'blocked';
  if (/세션이 만료|nid\.naver\.com|세션 계정|로그인이 필요|NID_AUT 쿠키 없음/.test(message)) {
    return 'expired';
  }
  return 'transient';
}

/** 세션이 실제로 글을 쓸 수 있는 상태인지 — 쿠키 존재만으로 판단하지 않는다. */
async function probeSession(browser: Browser): Promise<string> {
  const context = await browser.newContext({
    locale: 'ko-KR',
    storageState: SESSION_PATH,
    viewport: { width: 1280, height: 800 },
  });
  try {
    const page = await context.newPage();

    // 1) 세션 주인 확인. 만료되면 blog.naver.com/MyBlog로 떨어진다(실측).
    await page.goto('https://blog.naver.com/MyBlog.naver', {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
    // 보호조치·캡차·이용제한을 **세션 만료보다 먼저** 판정한다. 순서를 바꾸면
    // 보호조치를 "재로그인하세요"로 오진해 감시 중인 계정에 접근을 더한다.
    const firstBlock = detectAccountBlock({
      text: await page.locator('body').innerText().catch(() => ''),
      url: page.url(),
    });
    if (firstBlock) throw accountBlockError(firstBlock);

    const detected = detectBlogIdFromUrl(page.url());
    const blogId = resolveBlogId(detected, process.env.NAVER_BLOG_ID);

    // 2) 에디터까지 열리는지 본다. MyBlog 통과만으로는 발행 가능을 보장하지 못한다 —
    //    쿠키가 남아 있어도 글쓰기 권한 단계에서 로그인으로 튕기는 경우가 있다.
    await page.goto(`https://blog.naver.com/${blogId}/postwrite`, {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    const editorBlock = detectAccountBlock({
      text: await page.locator('body').innerText().catch(() => ''),
      url: page.url(),
    });
    if (editorBlock) throw accountBlockError(editorBlock);
    // 에디터 프레임은 **이름**으로 찾는다(id 셀렉터로는 안 잡힌다 — publish.ts getEditor와 동일).
    const deadline = Date.now() + 20_000;
    let frame = null as ReturnType<typeof page.frame>;
    while (Date.now() < deadline) {
      frame = page.frame({ name: 'mainFrame' })
        ?? page.frames().find((f) => f.url().includes('postwrite'))
        ?? null;
      if (frame) break;
      await page.waitForTimeout(500);
    }
    // 프레임 부재는 만료가 아니다(만료는 위 nid 리다이렉트로 이미 걸렀다) —
    // 네이버 구조 변경일 수 있으므로 만료라고 단정하지 않는다.
    if (!frame) throw new Error('에디터 프레임을 찾지 못했습니다 (셀렉터 재보정 필요)');

    // 3) 회전된 쿠키를 저장한다. 네이버가 NID_SES를 갱신해 주면 이걸 보관해야
    //    다음 실행이 더 오래 산다.
    await context.storageState({ path: SESSION_PATH });
    chmodSync(SESSION_PATH, 0o600);
    return blogId;
  } finally {
    await context.close();
  }
}

async function verifyWithRetry(): Promise<{ blogId: string; changed: boolean }> {
  const before = existsSync(SESSION_PATH)
    ? authFingerprint(JSON.parse(readFileSync(SESSION_PATH, 'utf-8')) as StorageState)
    : '';

  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (BACKOFF_MS[attempt - 1]) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
    }
    const browser = await chromium.launch({ headless: true });
    try {
      const blogId = await probeSession(browser);
      const after = authFingerprint(JSON.parse(readFileSync(SESSION_PATH, 'utf-8')) as StorageState);
      return { blogId, changed: before !== after };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // 만료·계정차단은 재시도해도 절대 풀리지 않는다 — 사람을 부른다.
      // 특히 계정차단에서 재시도하면 접근 빈도가 늘어 상황이 악화된다.
      if (classifyFailure(lastError) !== 'transient') break;
      console.warn(`[Naver] 세션 확인 ${attempt}/${MAX_ATTEMPTS} 실패(일시 오류로 판단): ${lastError}`);
    } finally {
      await browser.close();
    }
  }
  throw new Error(lastError);
}

/**
 * 시크릿을 쓸 권한이 있는지. 없으면 실패가 아니라 **건너뜀**이다.
 *
 * CI에서 PAT(GH_SECRET_PAT)을 아직 안 넣었을 때 이 단계가 매 실행 빨간 X를 남기면
 * 진짜 실패와 구분이 안 된다. 권한 없음은 조용히 넘기고, 권한이 있는데 쓰기가
 * 실패한 경우만 에러로 올린다.
 */
function canWriteSecrets(): boolean {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return true;
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** base64를 argv에 절대 싣지 않는다(프로세스 목록 노출). stdin으로만 넘긴다. */
function pushSecret(): void {
  const b64 = readFileSync(SESSION_PATH).toString('base64');
  try {
    execFileSync('gh', ['secret', 'set', SECRET_NAME], {
      input: b64,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch (error) {
    throw new Error(
      `${SECRET_NAME} 갱신 실패. 로컬은 \`gh auth login\`, CI는 GH_TOKEN(시크릿 쓰기 권한 PAT)이 필요합니다.\n`
      + `원인: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  console.log(`${SECRET_NAME} 갱신 완료 (${b64.length}자)`);
}

async function main(): Promise<void> {
  const push = process.argv.includes('--push');
  const force = process.argv.includes('--force');

  ensureStateDir();
  if (!ensureSession()) {
    console.error(
      `세션이 없습니다. \`npm run naver:login\`을 먼저 실행하세요 (CI는 ${SECRET_NAME} 시크릿).`,
    );
    process.exit(1);
  }
  if (!hasAuthCookies(JSON.parse(readFileSync(SESSION_PATH, 'utf-8')) as StorageState)) {
    console.error('세션에 NID_AUT 쿠키가 없습니다 — 로그인이 저장되지 않았습니다. npm run naver:login 재실행.');
    process.exit(1);
  }

  let result: { blogId: string; changed: boolean };
  try {
    result = await verifyWithRetry();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kind = classifyFailure(message);
    if (kind === 'blocked') {
      console.error(
        [
          message,
          '',
          '자동 발행을 켜지 마세요. 계정 상태가 정상으로 확인된 뒤 Isaac이 명시적으로 재개해야 합니다.',
        ].join('\n'),
      );
      process.exit(1);
    }
    if (kind === 'expired') {
      console.error(
        [
          `세션 만료 — 사람이 한 번 로그인해야 합니다: ${message}`,
          '',
          '  npm run naver:login      # 로그인하면 시크릿까지 자동 갱신됩니다',
          '',
          '로그인 자동화는 하지 않습니다(캡차·2FA·기기등록이 계정을 위험하게 만듭니다).',
        ].join('\n'),
      );
    } else {
      console.error(`세션 확인 실패(일시 오류 ${MAX_ATTEMPTS}회): ${message}`);
    }
    process.exit(1);
  }

  console.log(`세션 정상 — 블로그 ${result.blogId} / 인증 쿠키 ${result.changed ? '회전됨' : '변화 없음'}`);

  if (!push) return;
  if (!result.changed && !force) {
    console.log(`${SECRET_NAME} 갱신 생략 (쿠키 변화 없음). 강제하려면 --force.`);
    return;
  }
  if (!canWriteSecrets()) {
    console.log(
      `${SECRET_NAME} 갱신 건너뜀 — 시크릿 쓰기 권한이 없습니다.\n`
      + '  CI: GH_SECRET_PAT 시크릿(시크릿 쓰기 권한 PAT)을 넣으면 세션이 자동 갱신됩니다.\n'
      + '  로컬: gh auth login 후 npm run naver:session:push',
    );
    return;
  }
  pushSecret();
}

if (process.argv[1]?.includes('session-sync')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
