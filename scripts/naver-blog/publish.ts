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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Frame, type Page } from 'playwright';
import {
  canPublish,
  ensureStateDir,
  hasSession,
  NAVER_STATE_DIR,
  readHistory,
  recentPublishCount,
  clearPublishPending,
  markPublishPending,
  readPublishPending,
  recordPublish,
  recordTheme,
  SESSION_PATH,
  WEEKLY_PUBLISH_LIMIT,
} from './session';
import { THEME_COOLDOWN_DAYS } from './post-types';
import { checkFormat } from './format';

/**
 * 스마트에디터 ONE 셀렉터.
 *
 * 여기 한 곳만 고치면 되도록 모아둔다. 네이버가 클래스명을 바꾸면 dry-run이
 * 스크린샷과 함께 실패하므로, 그때 이 표만 갱신하면 된다.
 */
const SEL = {
  editorFrame: '#mainFrame',
  // 실측: 이 버튼 클릭 시 filechooser 이벤트가 발생하고 multiple=true다.
  // input[type=file]은 DOM에 없으므로 setInputFiles가 아니라 filechooser를 써야 한다.
  imageButton: '.se-image-toolbar-button',
  // 업로드 완료 판정 — 컴포넌트 존재가 아니라 네이버 CDN src가 붙었는지로 본다
  uploadedImage: '.se-component.se-image img[src*="pstatic.net"]',
  // 인용구는 2단계다: 툴바의 인용구 버튼 → 서브패널에서 스타일 선택.
  // 서브패널 버튼(se-insert-menu-sub-panel-button)은 패널이 열리기 전엔 invisible이다.
  quoteButton: '.se-quotation-toolbar-button, button:has-text("인용구")',
  quoteStyle: '.se-insert-menu-sub-panel-button',
  // 오글링크 팝업 실측 구조: 툴바 → input[type=url] → 검색 → 미리보기 → 확인
  oglinkButton: '.se-oglink-toolbar-button',
  oglinkInput: 'input.se-popup-oglink-input',
  oglinkSearch: 'button.se-popup-oglink-button',
  oglinkConfirm: 'button.se-popup-button-confirm',
  oglinkPreview: '.se-popup-oglink-preview',
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
  /** 캡처된 이미지 경로. FORMAT-SPEC상 최소 4장, 0장이면 발행 차단. */
  images?: string[];
  outsideUrl?: string;
  tags?: string[];
  /** 이 초안이 쓴 테마. 발행이 성공해야 쿨다운에 넣는다. */
  themeId?: string;
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

  // 규격 검사는 make-draft에만 있었다. publish를 직접 호출하거나 예전 draft.json을 넘기면
  // 이미지·태그·고지문·본문 길이 검사를 전부 건너뛰고 발행된다. 발행 엔트리에서 다시 막는다.
  const violations = checkFormat(raw as Draft, { fileExists: existsSync });
  if (violations.length) throw new Error(`FORMAT-SPEC 위반으로 발행 중단: ${violations.join(' / ')}`);

  return raw as Draft;
}

/** 본문 + outside 링크. inside(블로그)에서 outside(자기 도메인)로 보내는 것이 투트랙의 요점이다. */
function composeBody(draft: Draft): string {
  if (!draft.outsideUrl) return draft.body;
  return `${draft.body}\n\n실시간 점수와 관련주 전체 목록은 여기서 확인할 수 있습니다.\n${draft.outsideUrl}`;
}

/**
 * 에디터에 실제로 들어간 내용을 되읽어 초안과 대조한다.
 * null이면 통과, 문자열이면 실패 사유.
 */
async function verifyEditorContent(editor: Frame, draft: Draft, insertedImages: number): Promise<string | null> {
  // 이미지는 FORMAT-SPEC상 최소 4장이고 0장은 발행 차단 조건이다.
  // 부분 성공(4장 중 2장)도 미달로 본다 — 발행 후 수정은 문서 신뢰도 감점이라
  // 깨진 글을 남기는 것보다 그 회차를 거르는 편이 싸다.
  if (draft.images?.length) {
    const onPage = await countImages(editor);
    if (onPage < MIN_IMAGES) {
      return `이미지 ${onPage}장 (최소 ${MIN_IMAGES}장, 삽입 시도 ${insertedImages}회)`;
    }
  }

  const rendered = await editor.locator('.se-content, .se-viewer, body').first().innerText().catch(() => '');
  if (!rendered.trim()) return '에디터에서 텍스트를 읽지 못함';

  const norm = (t: string) => t.replace(/\s+/g, '');
  const flat = norm(rendered);

  // 제목: 앞 12자만 대조 — 에디터가 줄바꿈을 넣을 수 있다
  const titleHead = norm(stripMarkers(draft.title)).slice(0, 12);
  if (!flat.includes(titleHead)) return `제목 미입력 (기대: "${titleHead}...")`;

  // 본문: 첫 문단 앞 20자 (서식 마커는 타이핑되지 않으므로 제거하고 대조)
  const plainBody = stripMarkers(draft.body);
  const bodyHead = norm(plainBody).slice(0, 20);
  if (!flat.includes(bodyHead)) return `본문 미입력 (기대: "${bodyHead}...")`;

  // 본문 길이 — 문단 일부만 들어간 경우를 잡는다.
  // 비율만 보면 30%가 사라져도 통과하고, flat에는 에디터 UI 텍스트까지 섞여 더 후해진다.
  const expected = norm(plainBody).length;
  const got = flat.length;
  if (got < expected * 0.9) return `본문이 잘림 (기대 ${expected}자 이상, 실제 ${got}자)`;

  // 꼬리 앵커 — 비율보다 확실하다. 마지막 문단이 들어갔으면 중간이 통째로 빠지기 어렵다.
  // URL만 있는 문단은 오글링크 카드로 바뀌어 본문 텍스트에서 사라지므로 제외한다.
  const lastTextBlock = plainBody
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b && !/^https?:\/\/\S+$/.test(b))
    .at(-1);
  if (lastTextBlock) {
    const tail = norm(lastTextBlock).slice(0, 20);
    if (!flat.includes(tail)) return `본문 끝부분 누락 (기대: "${tail}...")`;
  }

  if (draft.outsideUrl) {
    // 오글링크 카드로 변환되면 URL이 본문 텍스트에 남지 않는다 — 카드의 href로도 인정한다.
    // 텍스트만 보면 정상 변환된 글이 '링크 누락'으로 반려된다(실측).
    const hasCard = await editor
      .locator(`.se-oglink a[href*="${new URL(draft.outsideUrl).host}"], .se-oglink-thumbnail`)
      .count()
      .catch(() => 0);
    if (!flat.includes(norm(draft.outsideUrl)) && hasCard === 0) {
      return 'outside 딥링크 누락 (평문·오글링크 카드 모두 없음)';
    }
  }

  return null;
}

async function getEditor(page: Page): Promise<Frame> {
  const frame = page.frame({ name: 'mainFrame' }) ?? page.frames().find((f) => f.url().includes('postwrite'));
  if (!frame) throw new Error('에디터 프레임을 찾지 못했습니다 (셀렉터 재보정 필요)');
  return frame;
}

/** make-draft가 넣는 마커 */
const QUOTE_PREFIX = '>> ';
/** FORMAT-SPEC §4 — 0장은 발행 차단, 부분 성공도 미달로 본다 */
const MIN_IMAGES = 4;
const BOLD_RE = /\*\*(.+?)\*\*/g;
const COLOR_RE = /\[\[([rb]):(.+?)\]\]/g;

/** 서식 마커를 제거한 순수 텍스트 — 검증 대조용 */
export function stripMarkers(text: string): string {
  return text
    .replace(new RegExp(QUOTE_PREFIX, 'g'), '')
    .replace(BOLD_RE, '$1')
    .replace(COLOR_RE, '$2');
}

/**
 * 한 문단을 입력한다. 볼드·색상 마커를 만나면 서식 토글 후 타이핑한다.
 *
 * 서식은 스마트에디터 단축키로 건다 — 툴바 버튼은 위치·클래스가 자주 바뀌지만
 * Ctrl/Cmd+B 같은 단축키는 안정적이다. 색상은 단축키가 없어 이번 범위에서
 * 적용하지 않고 볼드로 대체한다(강조 목적은 동일하게 달성된다).
 */
async function typeRich(page: Page, text: string): Promise<void> {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  // 색상 마커는 볼드로 강등 — 색상 적용은 툴바 조작이 필요해 실패 위험이 크다
  const normalized = text.replace(COLOR_RE, '**$2**');

  let cursor = 0;
  for (const match of normalized.matchAll(BOLD_RE)) {
    const before = normalized.slice(cursor, match.index);
    if (before) await page.keyboard.type(before, { delay: 8 });

    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.type(match[1], { delay: 8 });
    await page.keyboard.press(`${mod}+b`);

    cursor = (match.index ?? 0) + match[0].length;
  }
  const rest = normalized.slice(cursor);
  if (rest) await page.keyboard.type(rest, { delay: 8 });
}

/**
 * 본문 입력 + 이미지 삽입.
 *
 * 이미지는 문단 사이에 넣는다(FORMAT-SPEC: 300~400자마다 1장). 타이핑을 끝낸 뒤
 * 커서를 옮겨 삽입하는 방식은 커서 위치 제어가 불안정하므로, 타이핑 흐름 중간에
 * 그 자리에서 삽입한다 — 커서가 이미 정확한 위치에 있기 때문이다.
 */
async function typeBody(page: Page, editor: Frame, draft: Draft): Promise<number> {
  const paragraphs = draft.body.split('\n\n').map((p) => p.trim()).filter(Boolean);
  const images = [...(draft.images ?? [])];
  let inserted = 0;

  // 이미지를 넣을 문단 인덱스 — 첫 문단 뒤부터 균등 배치
  const slots = new Set<number>();
  if (images.length > 0 && paragraphs.length > 1) {
    const step = Math.max(1, Math.floor(paragraphs.length / images.length));
    for (let i = 0; i < images.length; i++) slots.add(Math.min(i * step, paragraphs.length - 1));
  }

  for (const [i, paragraph] of paragraphs.entries()) {
    if (i > 0) await page.keyboard.press('Enter');

    if (paragraph.startsWith(QUOTE_PREFIX)) {
      const applied = await applyQuoteBlock(page, editor);
      await page.keyboard.type(paragraph.slice(QUOTE_PREFIX.length), { delay: 8 });
      // 인용구 블록에서 빠져나온다 — Enter 두 번이 스마트에디터의 블록 종료 관용이다
      await page.keyboard.press('Enter');
      if (applied) {
        await page.keyboard.press('Enter');
        await refocusBody(editor);
      }
      continue;
    }

    // URL만 있는 문단은 오글링크 카드로 만든다. 타이핑 후 Enter로 유도하는 방식은
    // 이미지 삽입 뒤 포커스가 옮겨간 상태에서 변환이 일어나지 않았다(실측: oglink 0).
    // 툴바 팝업 경로는 결과를 확인할 수 있어 결정적이다.
    const urlOnly = paragraph.match(/^(https?:\/\/\S+)$/);
    if (urlOnly) {
      if (await insertOgLink(page, editor, urlOnly[1])) {
        await refocusBody(editor);
        continue;
      }
      // 실패하면 평문 URL이라도 남긴다 — 링크가 아예 없는 것보단 낫다
      await page.keyboard.type(paragraph, { delay: 8 });
      continue;
    }

    await typeRich(page, paragraph);

    if (slots.has(i) && images.length > 0) {
      const file = images.shift()!;
      await page.keyboard.press('Enter');
      if (await insertImage(page, editor, file)) inserted += 1;
      await refocusBody(editor);
      // 업로드를 초 단위로 연타하면 타이핑보다 강한 봇 신호가 된다
      await page.waitForTimeout(1_800);
    }
  }

  // 배치되지 못한 나머지는 본문 끝에 이어 붙인다 — 개수 미달로 발행이 막히지 않게
  for (const file of images) {
    await page.keyboard.press('Enter');
    if (await insertImage(page, editor, file)) inserted += 1;
    await refocusBody(editor);
    await page.waitForTimeout(1_800);
  }

  return inserted;
}

/**
 * 이미지 1장 삽입. 성공 여부를 돌려준다.
 *
 * input[type=file]이 DOM에 없으므로(실측) setInputFiles는 쓸 수 없다.
 * 사진 버튼 클릭 → filechooser 이벤트 → setFiles 경로가 유일하게 동작한다.
 * filechooser는 Page 레벨 이벤트라 input이 iframe 안에 있어도 page에서 받는다.
 */
async function insertImage(page: Page, editor: Frame, file: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const before = await countImages(editor);
    try {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10_000 }),
        editor.locator(SEL.imageButton).filter({ visible: true }).first().click({ timeout: 10_000 }),
      ]);
      await chooser.setFiles([file]);

      // 컴포넌트가 생겼다고 업로드가 끝난 게 아니다 — 네이버 CDN(pstatic) src가 붙어야 완료다
      await editor
        .locator(SEL.uploadedImage)
        .nth(before)
        .waitFor({ state: 'visible', timeout: 30_000 });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 타임아웃이어도 업로드가 끝났을 수 있다 — 개수가 늘었으면 성공으로 보고
      // 재시도하지 않는다. 안 그러면 같은 이미지가 중복 삽입된다(실측: 6장 → 16장).
      if ((await countImages(editor)) > before) {
        console.warn(`[Publish] 확인은 늦었지만 업로드됨 (${file})`);
        return true;
      }
      console.warn(`[Publish] 이미지 삽입 실패 ${attempt}/3 (${file}): ${message}`);
      if (attempt < 3) await page.waitForTimeout(attempt * 2_500);
    }
  }
  return false;
}

/**
 * 본문 편집 영역으로 포커스를 되돌린다.
 *
 * 이미지 삽입·인용구 토글 뒤 포커스가 툴바나 패널로 빠진다. 그대로 타이핑하면
 * 제목란이나 태그 입력으로 글자가 들어간다 — 되돌리기 어려운 실패다.
 */
/**
 * URL을 오글링크 카드로 삽입. 성공하면 true.
 *
 * 실측 구조: 툴바 버튼 → se-popup-oglink → input[type=url] → 검색 버튼 →
 * 미리보기 로드 → 확인 버튼(로드 전까지 disabled). 확인 버튼의 disabled가
 * 풀리는 것이 곧 미리보기 준비 완료 신호라 그것을 대기 조건으로 쓴다.
 */
async function insertOgLink(page: Page, editor: Frame, url: string): Promise<boolean> {
  try {
    await editor.locator(SEL.oglinkButton).first().click({ timeout: 8_000 });
    const input = editor.locator(SEL.oglinkInput).first();
    await input.waitFor({ state: 'visible', timeout: 8_000 });
    await input.fill(url);
    await editor.locator(SEL.oglinkSearch).first().click({ timeout: 5_000 });

    // 확인 버튼이 활성화될 때까지 = 미리보기 로드 완료
    const confirm = editor.locator(SEL.oglinkConfirm).first();
    await confirm.waitFor({ state: 'visible', timeout: 5_000 });
    // 팝업은 에디터 iframe 안에 있으므로 frame 컨텍스트에서 평가해야 한다
    await editor.waitForFunction(
      (sel) => {
        const btn = document.querySelector(sel);
        return btn instanceof HTMLButtonElement && !btn.disabled;
      },
      SEL.oglinkConfirm,
      { timeout: 20_000 },
    );
    await confirm.click({ timeout: 5_000 });
    await page.waitForTimeout(1_500);
    return true;
  } catch (error) {
    console.warn(`[Publish] 오글링크 실패 (${url}): ${error instanceof Error ? error.message : error}`);
    await page.keyboard.press('Escape').catch(() => {});
    return false;
  }
}

/**
 * 인용구 블록으로 전환. 성공하면 true.
 *
 * 실측 구조: 툴바의 「인용구」 버튼을 누르면 스타일 서브패널이 열리고,
 * 그 안의 se-insert-menu-sub-panel-button 중 하나를 골라야 실제로 적용된다.
 * 한 단계만 누르면 패널만 열린 채 텍스트가 평문으로 들어간다(실측: 인용구 0개).
 */
async function applyQuoteBlock(page: Page, editor: Frame): Promise<boolean> {
  try {
    const toolbarBtn = editor.locator(SEL.quoteButton).filter({ visible: true }).first();
    if ((await toolbarBtn.count()) === 0) return false;
    await toolbarBtn.click({ timeout: 5_000 });
    await page.waitForTimeout(400);

    // 첫 번째 스타일(기본 따옴표)을 고른다
    const style = editor.locator(SEL.quoteStyle).filter({ visible: true }).first();
    if ((await style.count()) === 0) {
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    }
    await style.click({ timeout: 5_000 });
    await page.waitForTimeout(400);
    return true;
  } catch {
    await page.keyboard.press('Escape').catch(() => {});
    return false;
  }
}

async function refocusBody(editor: Frame): Promise<void> {
  await editor.locator(SEL.body).last().click({ timeout: 5_000 }).catch(() => {});
}

async function countImages(editor: Frame): Promise<number> {
  return editor.locator('.se-component.se-image, .se-module-image img').count().catch(() => 0);
}

async function main(): Promise<void> {
  const { draftPath, publish, headless } = parseArgs();
  const draft = loadDraft(draftPath);
  if (!hasSession()) throw new Error(`세션이 없습니다. 먼저 실행하세요: npm run naver:login`);

  // 이전 실행이 발행 버튼을 누른 뒤 결과를 확인하지 못했다면, 그 글이 이미 올라갔을 수 있다.
  // 같은 제목으로 다시 실행하면 중복 게시가 된다 — 사람이 확인할 때까지 멈춘다.
  const pending = readPublishPending();
  if (pending && pending.title === draft.title) {
    throw new Error(
      `이전 실행(${pending.at})이 같은 제목으로 발행을 시도했지만 결과가 확인되지 않았습니다.\n` +
        '네이버 블로그에서 실제 게시 여부를 확인한 뒤 .naver-blog/state/pending-publish.json 을 지우고 다시 실행하세요.',
    );
  }
  if (pending) {
    console.warn(`[Naver] 이전 발행 표식(${pending.title})을 정리합니다 — 이번 초안과 다른 글입니다.`);
    clearPublishPending();
  }

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
    // 블로그 ID는 비밀이 아니고(공개 URL) 세션 주인이 곧 발행 대상이다 —
    // MyBlog 리다이렉트로 자동 감지해 설정 항목을 하나 줄인다.
    // NAVER_BLOG_ID가 있으면 그것을 우선한다(다계정 운영 시).
    let blogId = process.env.NAVER_BLOG_ID;
    if (!blogId) {
      await page.goto('https://blog.naver.com/MyBlog.naver', { waitUntil: 'domcontentloaded' });
      blogId = page.url().match(/blog\.naver\.com\/([A-Za-z0-9_-]+)/)?.[1];
      if (!blogId) throw new Error('세션에서 블로그 ID를 감지하지 못했습니다. NAVER_BLOG_ID를 설정하세요.');
      console.log(`블로그 ID 자동 감지: ${blogId}`);
    }

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
    const insertedImages = await typeBody(page, editor, draft);

    await page.screenshot({ path: shot, fullPage: true });
    console.log(`입력 완료. 스크린샷: ${shot}`);

    // 발행 전 내용 검증 — 자동 발행의 전제.
    // 셀렉터가 깨지면 클릭·타이핑이 조용히 빈 곳으로 가고, 그대로 발행하면 빈 글이 올라간다.
    // 실제로 스마트에디터 구조 변경으로 3회 깨진 적이 있다. 에디터에서 값을 되읽어
    // 초안과 대조한 뒤에만 발행 단계로 넘어간다.
    const verdict = await verifyEditorContent(editor, draft, insertedImages);
    if (verdict) {
      throw new Error(`발행 전 검증 실패 — ${verdict}. 빈 글이 올라가지 않도록 중단한다.`);
    }
    console.log('발행 전 검증 통과 (제목·본문·링크 확인)');

    if (!publish) {
      console.log('\ndry-run 입니다. 브라우저에서 확인 후 직접 발행하세요.');
      console.log('실제 발행까지 자동으로 하려면 --publish 를 붙이세요.');
      if (!headless) {
        console.log('창을 닫으면 종료됩니다.');
        await page.waitForEvent('close', { timeout: 0 });
      }
      return;
    }

    // 도움말 패널이 발행 버튼의 pointer events를 가로챈다(실측: se-help-title 조상 컨테이너).
    // ESC → 닫기 버튼 → DOM 제거 순으로 확실히 치운다.
    await page.keyboard.press('Escape').catch(() => {});
    const help = editor.locator(SEL.helpClose);
    if (await help.count()) await help.first().click({ timeout: 3_000 }).catch(() => {});
    // 실측 클래스: article.se-help-panel.se-is-on. 이게 발행 버튼 위를 덮는다.
    await editor
      .evaluate(() => {
        for (const el of document.querySelectorAll('.se-help-panel, .se-help-panel.se-is-on')) {
          if (el instanceof HTMLElement) {
            el.classList.remove('se-is-on');
            el.style.display = 'none';
            el.style.pointerEvents = 'none';
          }
        }
      })
      .catch(() => {});
    await page.waitForTimeout(300);

    // 에디터에는 보이지 않는 "발행" 텍스트 요소가 여럿 있다 — visible 필터가 필수
    const openBtn = editor
      .locator('button, [role="button"]')
      .filter({ hasText: /발행/ })
      .filter({ visible: true })
      .first();
    await openBtn.click({ timeout: 10_000 });

    if (draft.tags?.length) {
      const tagInput = editor.locator(SEL.tagInput).first();
      // 셀렉터가 바뀌면 조용히 건너뛰고 발행됐다. 태그 없는 글은 네이버에서 거의 노출되지 않는다.
      if ((await tagInput.count()) === 0) {
        throw new Error('태그 입력기를 찾지 못했습니다 (SEL.tagInput 재보정 필요) — 태그 없이 발행하지 않습니다');
      }
      const wanted = draft.tags.slice(0, 10);
      for (const tag of wanted) {
        await tagInput.click();
        await page.keyboard.type(tag, { delay: 12 });
        await page.keyboard.press('Enter');
      }
      // count()는 미매칭이면 0을 돌려준다 — 0을 "입력 실패"로 읽으면 네이버가 클래스명을
      // 바꾼 날 태그가 정상 입력됐는데도 발행이 멈춘다. 0은 "검증 불가"로 본다.
      const entered = await editor.locator('[class*="tag_item"], .tag_item__ISVjt').count().catch(() => 0);
      if (entered === 0) {
        console.warn('[Naver] 입력된 태그 수를 확인할 수 없습니다(클래스명 변경 가능) — 검증 생략');
      } else if (entered < wanted.length) {
        throw new Error(`태그가 ${entered}/${wanted.length}개만 입력됐습니다 — 발행하지 않습니다`);
      }
    }

    // 발행 설정 패널의 최종 확인 버튼 — 역시 visible 필터로
    const confirmBtn = editor
      .locator('button, [role="button"]')
      .filter({ hasText: /^\s*발행\s*$/ })
      .filter({ visible: true })
      .last();
    // 클릭 직후 응답이 끊기면 "올라갔는지 모르는" 상태가 된다. 표식을 먼저 남긴다.
    markPublishPending(draft.title, Date.now());
    await confirmBtn.click({ timeout: 10_000 });

    // 네이버가 "발행 오류 — 문서 처리 중 오류가 발생하였습니다" 팝업을 낼 수 있다.
    // URL 대기만 하면 30초 타임아웃으로 끝나 진짜 원인이 묻힌다.
    const failure = editor.locator('text=/발행 오류|처리 중 오류/').first();
    const outcome = await Promise.race([
      page.waitForURL(/blog\.naver\.com\/(?!.*postwrite)/, { timeout: 45_000 }).then(() => 'ok' as const),
      failure.waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'error' as const),
    ]).catch(() => 'timeout' as const);

    if (outcome !== 'ok') {
      const detail = outcome === 'error'
        ? '네이버가 발행 오류를 반환했습니다(문서가 너무 크거나 이미지 처리 실패).'
        : '발행 후 페이지 이동이 확인되지 않았습니다.';
      throw new Error(`${detail} 스크린샷을 확인하세요.`);
    }

    // 기록은 발행이 실제로 끝난 뒤에만. 초안 생성 시점에 기록하면 발행이 깨진 날도
    // 그 테마가 14일간 후보에서 빠져 소재만 잃는다.
    const publishedAt = Date.now();
    clearPublishPending();
    recordPublish(publishedAt);
    if (draft.themeId) recordTheme(draft.themeId, publishedAt, THEME_COOLDOWN_DAYS);
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
