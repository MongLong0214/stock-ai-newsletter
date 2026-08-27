/**
 * 네이버 세션 1회 캡처.
 *
 *   npm run naver:login
 *
 * 브라우저가 뜨면 사람이 직접 로그인한다(2FA·기기등록 포함). 로그인이 끝나면
 * 엔터를 눌러 세션을 저장한다. 이후 발행 스크립트는 이 세션을 재사용하므로
 * 로그인 자동화가 필요 없다.
 */

import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';
import { ensureStateDir, SESSION_PATH } from './session';

async function main(): Promise<void> {
  ensureStateDir();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ locale: 'ko-KR' });
  const page = await context.newPage();

  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });

  console.log('\n브라우저에서 네이버에 로그인하세요.');
  console.log('로그인 상태 유지를 켜두면 세션이 오래 갑니다.');
  console.log('완료되면 이 터미널에서 엔터를 누르세요.\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('로그인 완료 후 엔터: ');
  rl.close();

  // NID_AUT는 HttpOnly 쿠키라 document.cookie로는 보이지 않는다 — context에서 직접 읽는다
  const cookies = await context.cookies('https://naver.com');
  const loggedIn = cookies.some((c) => c.name === 'NID_AUT');
  if (!loggedIn) {
    await browser.close();
    console.error('\n로그인이 확인되지 않았습니다(NID_AUT 쿠키 없음). 다시 실행하세요.');
    process.exit(1);
  }

  await context.storageState({ path: SESSION_PATH });
  await browser.close();

  console.log(`\n세션 저장: ${SESSION_PATH}`);
  console.log('이 파일은 로그인 자격증명입니다. 커밋하지 마세요(.gitignore에 등록됨).');
  console.log('세션이 만료되면 이 명령을 다시 실행하면 됩니다.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
