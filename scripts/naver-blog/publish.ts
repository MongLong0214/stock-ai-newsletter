/**
 * 네이버 블로그 초안 자동 입력 (+ 선택적 발행)
 *
 *   npm run naver:publish -- drafts/2026-08-27-2차전지.json          # 기본: 채우고 멈춤
 *   npm run naver:publish -- drafts/....json --publish               # 실제 발행
 *   npm run naver:publish -- drafts/....json --publish --headless
 *
 * 기본이 dry-run인 이유: 스마트에디터 DOM은 예고 없이 바뀐다. 셀렉터가 깨진 채로
 * 발행까지 가면 빈 글이나 깨진 글이 그대로 올라간다. 채운 상태를 스크린샷으로 확인하고
 * 사람이 마지막 버튼을 누르는 것이 기본값이고, --publish는 명시적 선택이다.
 *
 * 초안 JSON 형식:
 *   { "title": "...", "tags": ["2차전지"], "body": "문단1\n\n문단2", "outsideUrl": "https://..." }
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Frame, type Page } from 'playwright';
import {
  canPublish,
  ensureStateDir,
  hasSession,
  NAVER_STATE_DIR,
  readHistory,
  recentPublishCount,
  recordPublish,
  SESSION_PATH,
  WEEKLY_PUBLISH_LIMIT,
} from './session';

/**
 * 스마트에디터 ONE 셀렉터.
 *
 * 여기 한 곳만 고치면 되도록 모아둔다. 네이버가 클래스명을 바꾸면 dry-run이
 * 스크린샷과 함께 실패하므로, 그때 이 표만 갱신하면 된다.
 */
const SEL = {
  editorFrame: '#mainFrame',
  recoveryCancel: '.se-popup-button-cancel',
  // 첫 사용 시 우측 도움말 패널이 발행 버튼을 덮는다 — 닫지 않으면 발행 클릭이 타임아웃난다
  helpClose: 'button[class*="close"], .se-help-panel-close-button, [aria-label="도움말 닫기"]',
  title: '.se-section-documentTitle .se-text-paragraph',
  body: '.se-section-text .se-text-paragraph',
  openPublish: 'button:has-text("발행")',
  tagInput: '#tag-input, .tag_input__rvUB5',
  confirmPublish: '.confirm_btn__WEaBq, button:has-text("발행"):visible',
} as const;

interface Draft {
  body: string;
  outsideUrl?: string;
  tags?: string[];
  title: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const draftPath = args.find((a) => !a.startsWith('--'));
  if (!draftPath) {
    console.error('초안 JSON 경로가 필요합니다. 예: npm run naver:publish -- drafts/foo.json');
    process.exit(1);
  }
  return {
    draftPath,
    publish: args.includes('--publish'),
    headless: args.includes('--headless'),
  };
}

function loadDraft(path: string): Draft {
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  if (typeof raw.title !== 'string' || !raw.title.trim()) throw new Error('초안에 title이 없습니다');
  if (typeof raw.body !== 'string' || !raw.body.trim()) throw new Error('초안에 body가 없습니다');
  return raw as Draft;
}

/** 본문 + outside 링크. inside(블로그)에서 outside(자기 도메인)로 보내는 것이 투트랙의 요점이다. */
function composeBody(draft: Draft): string {
  if (!draft.outsideUrl) return draft.body;
  return `${draft.body}\n\n실시간 점수와 관련주 전체 목록은 여기서 확인할 수 있습니다.\n${draft.outsideUrl}`;
}

async function getEditor(page: Page): Promise<Frame> {
  const frame = page.frame({ name: 'mainFrame' }) ?? page.frames().find((f) => f.url().includes('postwrite'));
  if (!frame) throw new Error('에디터 프레임을 찾지 못했습니다 (셀렉터 재보정 필요)');
  return frame;
}

/** 문단 단위로 입력한다. 에디터가 자체 문단 모델을 쓰기 때문에 값 주입 대신 키보드 입력을 쓴다. */
async function typeParagraphs(page: Page, text: string): Promise<void> {
  const paragraphs = text.split('\n\n').map((p) => p.trim()).filter(Boolean);
  for (const [i, paragraph] of paragraphs.entries()) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.type(paragraph, { delay: 12 });
    // URL로 끝나는 문단은 Enter로 마무리 — 스마트에디터가 자동으로 하이퍼링크 카드로 변환한다.
    // (평문 URL은 클릭이 안 되고, 링크 카드는 outside 유입 계측도 된다)
    if (/https?:\/\/\S+$/.test(paragraph)) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1_500); // oglink 카드 생성 대기
    }
  }
}

async function main(): Promise<void> {
  const { draftPath, publish, headless } = parseArgs();
  const draft = loadDraft(draftPath);
  const blogId = process.env.NAVER_BLOG_ID;

  if (!blogId) throw new Error('NAVER_BLOG_ID 환경변수가 필요합니다 (예: NAVER_BLOG_ID=myblog)');
  if (!hasSession()) throw new Error(`세션이 없습니다. 먼저 실행하세요: npm run naver:login`);

  const now = Date.now();
  const history = readHistory();
  if (publish && !canPublish(history, now)) {
    console.error(
      `주간 발행 상한 초과: 최근 7일 ${recentPublishCount(history, now)}건 / 상한 ${WEEKLY_PUBLISH_LIMIT}건.\n` +
        '네이버에서 볼륨은 스팸 신호다. 상한을 올리려면 session.ts의 WEEKLY_PUBLISH_LIMIT을 의도적으로 바꿔라.',
    );
    process.exit(1);
  }

  ensureStateDir();
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ storageState: SESSION_PATH, locale: 'ko-KR', viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  const shot = join(NAVER_STATE_DIR, `draft-${Date.now()}.png`);

  try {
    await page.goto(`https://blog.naver.com/${blogId}/postwrite`, { waitUntil: 'domcontentloaded' });

    // 세션이 만료되면 에디터 대신 로그인 페이지가 뜬다. 에디터를 찾기 전에 확인해야
    // "프레임을 찾지 못했습니다"가 아니라 진짜 원인이 보고된다.
    if (page.url().includes('nid.naver.com')) {
      throw new Error('세션이 만료되었습니다. npm run naver:login 을 다시 실행하고 NAVER_SESSION_B64를 갱신하세요.');
    }

    const editor = await getEditor(page);

    // "작성 중인 글이 있습니다" 복구 팝업 — "취소"로 새 글 시작 (임시저장분 무시).
    // 팝업은 frame 안에 있을 수도, 최상위 페이지에 있을 수도 있고, role이 button이
    // 아닐 수도 있다. 양쪽 스코프에서 텍스트+visible로 찾는다.
    await page.waitForTimeout(2_000); // 팝업은 로드 후 비동기로 뜬다
    for (const scope of [editor, page]) {
      const cancel = scope
        .locator('button, [role="button"], a')
        .filter({ hasText: /^\s*취소\s*$/ })
        .filter({ visible: true })
        .first();
      if ((await cancel.count()) > 0) {
        await cancel.click({ timeout: 3_000 }).catch(() => {});
        await page.waitForTimeout(500);
        break;
      }
    }

    await editor.locator(SEL.title).first().click();
    await page.keyboard.type(draft.title, { delay: 12 });

    await editor.locator(SEL.body).first().click();
    await typeParagraphs(page, composeBody(draft));

    await page.screenshot({ path: shot, fullPage: true });
    console.log(`입력 완료. 스크린샷: ${shot}`);

    if (!publish) {
      console.log('\ndry-run 입니다. 브라우저에서 확인 후 직접 발행하세요.');
      console.log('실제 발행까지 자동으로 하려면 --publish 를 붙이세요.');
      if (!headless) {
        console.log('창을 닫으면 종료됩니다.');
        await page.waitForEvent('close', { timeout: 0 });
      }
      return;
    }

    // 도움말/신기능 패널이 열려 있으면 발행 버튼을 가린다 — ESC와 닫기 버튼 둘 다 시도
    await page.keyboard.press('Escape').catch(() => {});
    const help = editor.locator(SEL.helpClose);
    if (await help.count()) await help.first().click({ timeout: 3_000 }).catch(() => {});

    // 에디터에는 보이지 않는 "발행" 텍스트 요소가 여럿 있다 — visible 필터가 필수
    const openBtn = editor
      .locator('button, [role="button"]')
      .filter({ hasText: /발행/ })
      .filter({ visible: true })
      .first();
    await openBtn.click({ timeout: 10_000 });

    if (draft.tags?.length) {
      const tagInput = editor.locator(SEL.tagInput).first();
      if (await tagInput.count()) {
        for (const tag of draft.tags.slice(0, 10)) {
          await tagInput.click();
          await page.keyboard.type(tag, { delay: 12 });
          await page.keyboard.press('Enter');
        }
      }
    }

    // 발행 설정 패널의 최종 확인 버튼 — 역시 visible 필터로
    const confirmBtn = editor
      .locator('button, [role="button"]')
      .filter({ hasText: /^\s*발행\s*$/ })
      .filter({ visible: true })
      .last();
    await confirmBtn.click({ timeout: 10_000 });
    await page.waitForURL(/blog\.naver\.com\/(?!.*postwrite)/, { timeout: 30_000 });

    recordPublish(Date.now());
    console.log(`발행 완료: ${page.url()}`);
    console.log(`최근 7일 ${recentPublishCount(readHistory(), Date.now())}건 / 상한 ${WEEKLY_PUBLISH_LIMIT}건`);
  } catch (error) {
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.error(`\n실패. 화면 상태: ${shot}`);
    console.error('셀렉터가 바뀐 경우 publish.ts 상단 SEL 표만 갱신하면 됩니다.');
    throw error;
  } finally {
    if (headless || publish) await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
