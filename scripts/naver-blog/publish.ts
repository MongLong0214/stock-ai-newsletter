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
import { checkFormat, FORMAT } from './format';
import {
  BLUE_HEX,
  detectBlogIdFromUrl,
  parseRich,
  QUOTE_PREFIX,
  RED_HEX,
  RESET_HEX,
  resolveBlogId,
  stripFormat,
  tagsToEnter,
  type DraftPayload,
} from './draft-model';
import { assertHashesMatch } from './run-store';
import { assertNoCtaTail, planBodyActions } from './publish-plan';

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
  boldButton: '.se-bold-toolbar-button, button[data-name="bold"]',
  colorButton: '.se-font-color-toolbar-button, .se-color-toolbar-button, button[data-name="font-color"]',
  textButton: '.se-text-toolbar-button, button[data-name="text"]',
  quotation: '.se-quotation, .se-component.se-quotation',
  categoryLayer: '[class*="category"], .select_category, [class*="Category"]',
} as const;

type Draft = DraftPayload;

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
  if (!Array.isArray(raw.imagePlacements) || raw.imagePlacements.length < FORMAT.minImages) {
    throw new Error('imagePlacements가 없습니다 — 초안을 재생성하라 (npm run naver:draft)');
  }

  const violations = checkFormat(raw as Draft, { fileExists: existsSync });
  if (violations.length) throw new Error(`FORMAT-SPEC 위반으로 발행 중단: ${violations.join(' / ')}`);

  assertHashesMatch(raw.imagePlacements.map((item: { path: string; sha256: string }) => ({
    path: item.path,
    sha256: item.sha256,
  })));

  return raw as Draft;
}

/** 본문은 초안에 이미 CTA URL을 포함한다. 여기서 한 번 더 붙이면 CTA 뒤에 문단이 생긴다. */

/**
 * 에디터에 실제로 들어간 내용을 되읽어 초안과 대조한다.
 * null이면 통과, 문자열이면 실패 사유.
 */
async function verifyEditorContent(editor: Frame, draft: Draft, insertedImages: number): Promise<string | null> {
  if (draft.images?.length) {
    const onPage = await countImages(editor);
    if (onPage < MIN_IMAGES) {
      return `이미지 ${onPage}장 (최소 ${MIN_IMAGES}장, 삽입 시도 ${insertedImages}회)`;
    }
    if (onPage > FORMAT.maxImages) {
      return `이미지 ${onPage}장 (최대 ${FORMAT.maxImages})`;
    }
  }

  const rendered = await editor.locator('.se-content, .se-viewer, body').first().innerText().catch(() => '');
  if (!rendered.trim()) return '에디터에서 텍스트를 읽지 못함';

  const norm = (t: string) => t.replace(/\s+/g, '');
  const flat = norm(rendered);

  // 길이 비교는 **본문 텍스트 컴포넌트만** 합산한다. 에디터 루트 전체를 재면
  // 제목·이미지 캡션·에디터 UI 문구가 길이를 보충해 중간 문단 누락을 가린다.
  const bodyOnly = norm(
    (await editor.locator('.se-component.se-text .se-text-paragraph').allInnerTexts().catch(() => [])).join(' '),
  );

  const titleHead = norm(stripMarkers(draft.title)).slice(0, 12);
  if (!flat.includes(titleHead)) return `제목 미입력 (기대: "${titleHead}...")`;

  const plainBody = stripMarkers(draft.body);
  const bodyHead = norm(plainBody).slice(0, 20);
  if (!flat.includes(bodyHead)) return `본문 미입력 (기대: "${bodyHead}...")`;

  const expected = norm(plainBody).length;
  // 인용구 소제목은 별도 컴포넌트라 bodyOnly에 안 들어갈 수 있다 — 둘 중 큰 값을 쓴다.
  const got = Math.max(bodyOnly.length, 0);
  if (got < expected * 0.9) {
    return `본문이 잘림 (기대 ${expected}자의 90% 이상, 실제 본문 컴포넌트 ${got}자)`;
  }

  // 문장부호 유실 검출.
  //
  // 색상 팔레트 팝업이 열린 채로 다음 문자를 타이핑하면 첫 글자가 먹힌다. 실측에서
  // 마침표 한 개가 사라져 두 문장이 한 줄로 붙은 채 공개됐다(logNo=224392242076).
  // 길이 검증은 1자 차이로 걸리지 않으므로 마침표 수를 따로 센다.
  // 인용구·URL 블록은 텍스트 컴포넌트에 안 들어가므로 기대값에서 뺀다.
  const expectedTextBlocks = plainBody
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith(QUOTE_PREFIX) && !/^https?:\/\/\S+$/.test(b));
  const expectedPeriods = expectedTextBlocks.join(' ').split('.').length - 1;
  const gotPeriods = bodyOnly.split('.').length - 1;
  if (expectedPeriods > 0 && gotPeriods < expectedPeriods) {
    return `문장부호 유실 (마침표 기대 ${expectedPeriods}개, 실제 ${gotPeriods}개) — 색상 팝업이 입력을 먹었을 수 있습니다`;
  }

  const lastTextBlock = plainBody
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b && !/^https?:\/\/\S+$/.test(b) && !b.startsWith('{{image:'))
    .at(-1);
  if (lastTextBlock) {
    const tail = norm(lastTextBlock).slice(0, 20);
    if (!flat.includes(tail)) return `본문 끝부분 누락 (기대: "${tail}...")`;
  }

  if (draft.outsideUrl) {
    const hasCard = await editor
      .locator(`.se-oglink a[href*="${new URL(draft.outsideUrl).host}"], .se-oglink-thumbnail`)
      .count()
      .catch(() => 0);
    if (!flat.includes(norm(draft.outsideUrl)) && hasCard === 0) {
      return 'outside 딥링크 누락 (평문·오글링크 카드 모두 없음)';
    }
  }

  const quoteCount = await editor.locator(SEL.quotation).count().catch(() => 0);
  if (quoteCount < FORMAT.quoteMin || quoteCount > FORMAT.quoteMax) {
    return `인용구 ${quoteCount}개 (규격 ${FORMAT.quoteMin}~${FORMAT.quoteMax})`;
  }
  const quoteTexts = await editor.locator(SEL.quotation).allInnerTexts().catch(() => []);
  for (const text of quoteTexts) {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length > 40) return `인용구에 본문이 섞임: "${compact.slice(0, 40)}..."`;
  }

  const boldCount = await countBoldDom(editor);
  if (boldCount < FORMAT.boldMin || boldCount > FORMAT.boldMax) {
    return `실제 볼드 ${boldCount}회 (규격 ${FORMAT.boldMin}~${FORMAT.boldMax})`;
  }
  const colorMarkers = [...draft.body.matchAll(/\[\[([rb]):(.+?)\]\]/g)];
  const wantedColor = colorMarkers.length;
  const wantedColorChars = colorMarkers.reduce((n, m) => n + m[2].replace(/\s+/g, '').length, 0);
  const color = await measureColorDom(editor);
  if (wantedColor > 0 && color.count < wantedColor) {
    return `실제 색상 ${color.count}개 (초안 마커 ${wantedColor}개)`;
  }
  // 번짐 검출: 색상 리셋이 실패하면 이후 문단 전체가 색을 물려받는다.
  const colorBudget = Math.max(wantedColorChars * 2 + 20, 40);
  if (color.chars > colorBudget) {
    return `색상이 번졌습니다 (색상 글자 ${color.chars}자 > 허용 ${colorBudget}자, 마커 ${wantedColorChars}자) — 리셋 실패`;
  }

  const ctaAfter = await editor.evaluate(() => {
    const components = [...document.querySelectorAll('.se-component')];
    const cta = components.findIndex((el) => el.classList.contains('se-oglink') || el.querySelector('.se-oglink'));
    if (cta === -1) return -1;
    return components.slice(cta + 1).filter((el) => el.classList.contains('se-image') || el.classList.contains('se-quotation')).length;
  }).catch(() => 0);
  if (ctaAfter > 0) return `CTA 뒤 컴포넌트 ${ctaAfter}개`;

  return null;
}

function formatVerifyError(reason: string, shot: string): string {
  return [
    '발행 전 검증 실패 — 발행 버튼을 누르지 않습니다.',
    `실패 항목: ${reason}`,
    '수정 또는 재생성 명령: npm run naver:draft -- --out .naver-blog/verify/draft.json',
    `검증 스크린샷 경로: ${shot}`,
  ].join('\n');
}

async function selectCategory(editor: Frame, page: Page, name = 'StockMatrix'): Promise<void> {
  const layer = editor.locator(SEL.categoryLayer).first();
  if ((await layer.count()) === 0) {
    throw new Error('카테고리 선택 UI를 찾지 못했습니다 — 마지막 사용값에 의존하지 않고 중단합니다');
  }
  await layer.click({ timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(300);
  const option = editor.getByText(name, { exact: true }).filter({ visible: true }).first();
  if ((await option.count()) === 0) {
    throw new Error(`카테고리 "${name}" 옵션이 없습니다`);
  }
  await option.click({ timeout: 5_000 });
  const selected = await layer.innerText().catch(() => '');
  if (!selected.includes(name)) {
    throw new Error(`카테고리 선택 실패 (실제: "${selected.slice(0, 40)}")`);
  }
}

async function assertSnapshotFresh(draft: Draft): Promise<void> {
  const snap = draft.meta?.sourceSnapshot;
  if (!snap || !draft.themeId || snap.score == null || snap.change7d == null) return;
  const res = await fetch(`https://stockmatrix.co.kr/api/tli/themes/${draft.themeId}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`상세 API ${res.status} — 초안을 재생성하라`);
  const json = await res.json() as { data?: { score?: { change7d?: number; updatedAt?: string; value?: number } } };
  const live = json.data?.score;
  if (!live) return;
  if (live.value !== snap.score || live.change7d !== snap.change7d) {
    throw new Error(
      `초안 스냅샷과 현재 상세 API가 다릅니다 (초안 score=${snap.score} change7d=${snap.change7d}, ` +
        `API score=${live.value} change7d=${live.change7d}). 초안을 재생성하라.`,
    );
  }
}

async function getEditor(page: Page): Promise<Frame> {
  const frame = page.frame({ name: 'mainFrame' }) ?? page.frames().find((f) => f.url().includes('postwrite'));
  if (!frame) throw new Error('에디터 프레임을 찾지 못했습니다 (셀렉터 재보정 필요)');
  return frame;
}

/** FORMAT-SPEC — 0장은 발행 차단, 부분 성공도 미달로 본다 */
const MIN_IMAGES = FORMAT.minImages;

/** 서식 마커를 제거한 순수 텍스트 — 검증 대조용 */
export function stripMarkers(text: string): string {
  return stripFormat(text);
}

async function countBoldDom(editor: Frame): Promise<number> {
  return editor.evaluate(() => {
    let count = 0;
    for (const el of document.querySelectorAll('.se-component:not(.se-section-documentTitle) span, .se-component b, .se-component strong')) {
      const weight = getComputedStyle(el).fontWeight;
      if (parseInt(weight, 10) >= 600 || weight === 'bold') count += 1;
    }
    return count;
  });
}

/**
 * 색상 적용 실측 — 개수와 **글자 수**를 함께 센다.
 *
 * 개수만 세면 리셋 실패로 문단 전체가 빨강이 되어도 "색상 N개"로 통과한다
 * (실측 보고서에 빨강 번짐이 기록돼 있다). 색상 글자 수가 초안 마커의 글자 수보다
 * 크게 많으면 번진 것이다.
 */
async function measureColorDom(editor: Frame): Promise<{ chars: number; count: number }> {
  return editor.evaluate(() => {
    let count = 0;
    let chars = 0;
    for (const el of document.querySelectorAll('.se-component span, .se-component font')) {
      const color = getComputedStyle(el).color;
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!match) continue;
      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      const red = r > 180 && g < 90 && b < 90;
      const blue = b > 150 && r < 90 && g < 140;
      if (!red && !blue) continue;
      // 중첩 span을 이중 계산하지 않는다 — 같은 색의 자식이 있으면 부모는 건너뛴다
      if (el.querySelector('span, font')) continue;
      count += 1;
      chars += (el.textContent ?? '').replace(/\s+/g, '').length;
    }
    return { chars, count };
  });
}

async function countColorDom(editor: Frame): Promise<number> {
  return (await measureColorDom(editor)).count;
}

async function typeBold(page: Page, editor: Frame, text: string): Promise<void> {
  await assertBodyFormattingToolbar(editor, '볼드');
  const before = await countBoldDom(editor);
  const tryOnce = async (mod: string) => {
    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.type(text, { delay: 8 });
    await page.keyboard.press(`${mod}+b`);
  };
  await tryOnce(process.platform === 'darwin' ? 'Meta' : 'Control');
  if ((await countBoldDom(editor)) > before) return;

  await tryOnce(process.platform === 'darwin' ? 'Control' : 'Meta');
  if ((await countBoldDom(editor)) > before) return;

  const btn = editor.locator(SEL.boldButton).filter({ visible: true }).first();
  if ((await btn.count()) > 0) {
    await btn.click({ timeout: 5_000 });
    await page.keyboard.type(text, { delay: 8 });
    await btn.click({ timeout: 5_000 }).catch(() => {});
    if ((await countBoldDom(editor)) > before) return;
  }
  throw new Error(`볼드 적용 실패 ("${text.slice(0, 20)}") — 단축키·툴바 모두 실패, 발행 중단`);
}

async function pickPaletteColor(editor: Frame, hex: string): Promise<boolean> {
  // 반드시 팔레트 셀 안에서만 찾는다.
  //
  // 예전 구현은 실패 시 문서 전체(button/span/div/i/em)에서 배경색 근사 매칭으로
  // 아무 요소나 클릭했다. 실측에서 그 폴백이 툴바의 「번역」 버튼을 눌러 Papago 모달이
  // 본문을 덮었고, 이후 이미지 삽입이 filechooser 타임아웃으로 전부 실패했다.
  // 팔레트 셀은 `.se-color-palette` + `data-color`(2026-08-27 실측 71개)로 특정된다.
  const exact = editor
    .locator(`.se-color-palette[data-color="${hex}"], [data-color="${hex}"].se-color-palette`)
    .filter({ visible: true })
    .first();
  if ((await exact.count()) > 0) {
    await exact.click({ timeout: 5_000 });
    return true;
  }

  // 팔레트 안에서만 근사 매칭한다. 팔레트에 없는 색을 상수로 잡아둔 경우를 위한 안전망이며,
  // 이 경로를 타면 경고를 남겨 상수를 실측값으로 고치게 한다.
  const nearest = await editor.evaluate((targetHex) => {
    const n = parseInt(targetHex.slice(1), 16);
    const target = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    let best: { el: HTMLElement; dist: number } | null = null;
    for (const el of document.querySelectorAll('.se-color-palette[data-color]')) {
      if (!(el instanceof HTMLElement)) continue;
      const cellHex = el.getAttribute('data-color') ?? '';
      if (!/^#[0-9a-fA-F]{6}$/.test(cellHex)) continue;
      const c = parseInt(cellHex.slice(1), 16);
      const dist =
        Math.abs(((c >> 16) & 255) - target[0]) +
        Math.abs(((c >> 8) & 255) - target[1]) +
        Math.abs((c & 255) - target[2]);
      if (!best || dist < best.dist) best = { el, dist };
    }
    if (!best || best.dist > 90) return null;
    best.el.click();
    return best.el.getAttribute('data-color');
  }, hex);

  if (nearest) {
    console.warn(`[Publish] 팔레트에 ${hex}가 없어 ${nearest}로 대체했습니다 — 상수를 실측값으로 고치세요`);
    return true;
  }
  return false;
}

async function typeColor(page: Page, editor: Frame, color: 'b' | 'r', text: string): Promise<void> {
  const hex = color === 'r' ? RED_HEX : BLUE_HEX;
  await assertBodyFormattingToolbar(editor, `색상 ${hex}`);
  const btn = editor.locator(SEL.colorButton).filter({ visible: true }).first();
  if ((await btn.count()) === 0) {
    throw new Error('색상 툴바를 찾지 못했습니다 — 볼드로 강등하지 않고 발행을 중단합니다');
  }
  const before = await countColorDom(editor);
  await btn.click({ timeout: 5_000 });
  await page.waitForTimeout(300);
  if (!(await pickPaletteColor(editor, hex))) {
    await page.keyboard.press('Escape').catch(() => {});
    throw new Error(`색상 ${hex} 팔레트 셀을 찾지 못했습니다 — 발행 중단`);
  }
  await page.keyboard.type(text, { delay: 8 });
  await btn.click({ timeout: 3_000 }).catch(() => {});
  await closeColorPopup(page, editor); // 팝업이 남으면 다음 입력의 첫 글자를 먹는다
  if ((await countColorDom(editor)) <= before) {
    throw new Error(`색상 적용이 DOM에 반영되지 않았습니다 (${hex}, "${text}") — 발행 중단`);
  }
  await resetTypingColor(page, editor);
}

/**
 * 색상 팔레트 팝업을 닫고 닫힘을 확인한다.
 *
 * 팝업이 열린 채로 다음 문자를 타이핑하면 **첫 글자가 팝업에 먹힌다.** 실측:
 * 발행글에서 `[[r:늘었습니다]].` 뒤의 마침표가 사라져 두 문장이 한 줄로 붙었다
 * (logNo=224392242076, "늘었습니다 검색 관심도의 …"). 눈에 잘 띄지 않는 데다
 * 길이 검증도 1자 차이로는 걸리지 않아 그대로 공개됐다.
 */
async function closeColorPopup(page: Page, editor: Frame): Promise<void> {
  const palette = editor.locator('.se-color-palette').filter({ visible: true }).first();
  if ((await palette.count()) === 0) return;
  await page.keyboard.press('Escape').catch(() => {});
  await palette.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(150);
}

async function resetTypingColor(page: Page, editor: Frame): Promise<void> {
  const btn = editor.locator(SEL.colorButton).filter({ visible: true }).first();
  if ((await btn.count()) === 0) return;
  await btn.click({ timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(200);
  for (const hex of [RESET_HEX, '#333333', '#000000']) {
    if (await pickPaletteColor(editor, hex)) {
      await closeColorPopup(page, editor);
      return;
    }
  }
  await closeColorPopup(page, editor);
}

async function typeRich(page: Page, editor: Frame, text: string): Promise<void> {
  for (const segment of parseRich(text)) {
    if (segment.kind === 'text') await page.keyboard.type(segment.text, { delay: 8 });
    else if (segment.kind === 'bold') await typeBold(page, editor, segment.text);
    else await typeColor(page, editor, segment.color, segment.text);
  }
}

async function startPlainParagraph(page: Page, editor: Frame): Promise<void> {
  await dismissHelp(editor, page);
  const lastQuote = editor.locator(SEL.quotation).last();
  if ((await lastQuote.count()) > 0) {
    const box = await lastQuote.boundingBox();
    if (box) {
      await page.mouse.click(box.x + Math.min(80, box.width / 2), box.y + box.height + 28);
      await page.waitForTimeout(200);
    }
  }
  const plus = editor.locator('[class*="plus"], .se-add-component, .se-canvas-bottom-button').filter({ visible: true }).last();
  if ((await plus.count()) > 0) {
    await plus.click({ timeout: 3_000 }).catch(() => {});
  }
  const textBtn = editor.locator(SEL.textButton).filter({ visible: true }).first();
  if ((await textBtn.count()) > 0) {
    await textBtn.click({ timeout: 5_000 });
    await page.waitForTimeout(400);
  }
  const inQuote = await editor.evaluate(() => {
    const node = document.getSelection()?.anchorNode;
    const el = node instanceof Element ? node : node?.parentElement;
    return Boolean(el?.closest('.se-quotation, .se-component.se-quotation'));
  }).catch(() => false);
  if (inQuote) {
    const outside = editor.locator('.se-component:not(.se-quotation) .se-text-paragraph').last();
    if ((await outside.count()) > 0) await outside.click({ timeout: 5_000 });
  }
}

async function assertQuoteTitle(editor: Frame, expected: string): Promise<void> {
  const last = editor.locator(SEL.quotation).last();
  if ((await last.count()) === 0) throw new Error(`인용구 컴포넌트가 없습니다 (기대: ${expected})`);
  const raw = (await last.innerText()).replace(/내용을 입력하세요\.?|출처 입력/g, '');
  const text = raw.replace(/\s+/g, ' ').trim();
  const want = expected.replace(/\s+/g, ' ').trim();
  if (text !== want) {
    throw new Error(`인용구가 소제목 한 줄이 아닙니다. 기대="${want}" 실제="${text.slice(0, 80)}"`);
  }
}

async function typeBody(page: Page, editor: Frame, draft: Draft): Promise<number> {
  const actions = planBodyActions(draft.body, draft.imagePlacements ?? []);
  assertNoCtaTail(actions);
  let inserted = 0;

  for (const [i, action] of actions.entries()) {
    if (i > 0 && action.kind !== 'image') await page.keyboard.press('Enter');

    if (action.kind === 'quote') {
      const applied = await applyQuoteBlock(page, editor);
      if (!applied) throw new Error(`인용구 적용 실패: ${action.text}`);
      await page.keyboard.type(action.text, { delay: 8 });
      await assertQuoteTitle(editor, action.text);
      await startPlainParagraph(page, editor);
      continue;
    }

    if (action.kind === 'oglink') {
      if (await insertOgLink(page, editor, action.url)) {
        await refocusBody(editor);
        continue;
      }
      await page.keyboard.type(action.url, { delay: 8 });
      continue;
    }

    if (action.kind === 'image') {
      await page.keyboard.press('Enter');
      if (await insertImage(page, editor, action.path)) inserted += 1;
      else throw new Error(`이미지 삽입 실패: ${action.path}`);
      await startPlainParagraph(page, editor);
      if (action.caption) await page.keyboard.type(action.caption, { delay: 8 });
      await refocusBody(editor);
      await page.waitForTimeout(1_800);
      continue;
    }

    await typeRich(page, editor, action.text);
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
      // 오버레이가 하나라도 떠 있으면 사진 버튼 클릭이 가로채여 filechooser가 열리지 않는다.
      // 실측: 번역(Papago) 모달과 도움말 패널이 그렇게 3회 재시도를 전부 태웠다.
      await clearOverlays(page, editor);
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
/**
 * 에디터 위에 뜬 오버레이를 걷어낸다.
 *
 * 도움말 패널은 닫아도 다시 열리고, 번역(Papago)·복구 팝업은 dim으로 클릭을 가로챈다.
 * 가로채인 클릭은 "filechooser 타임아웃"처럼 엉뚱한 증상으로 나타나므로, 남아 있으면
 * 실패시켜 원인을 보이게 한다.
 */
/**
 * "작성 중인 글이 있습니다" 복구 팝업을 확실히 닫는다.
 *
 * dry-run이 본문을 입력하면 네이버가 임시저장을 남긴다. 그래서 **다음 실행은 반드시**
 * 이 팝업을 만난다 — 실측 CI에서 1차 dry-run 뒤 2차가 제목 클릭 단계에서
 * `<div class="se-container"> intercepts pointer events`로 죽었다(run 33052741707).
 * 고정 대기 2초로는 부족하고, 닫힌 것을 확인하지 않으면 이후 모든 클릭이 가로채인다.
 */
async function dismissRecoveryPopup(page: Page, editor: Frame): Promise<void> {
  const blocker = () =>
    editor.locator('.se-popup-dim, .se-popup-alert').filter({ visible: true });

  // 팝업은 로드 후 비동기로 뜬다. 최대 8초 기다리고 안 뜨면 그냥 통과한다.
  await blocker().first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  if ((await blocker().count()) === 0) return;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    for (const scope of [editor, page]) {
      const btn = scope
        .locator('button, [role="button"], a')
        .filter({ hasText: /^\s*(취소|새로\s*작성|아니오)\s*$/ })
        .filter({ visible: true })
        .first();
      if ((await btn.count()) > 0) {
        await btn.click({ timeout: 3_000 }).catch(() => {});
        break;
      }
    }
    await page.keyboard.press('Escape').catch(() => {});
    await blocker().first().waitFor({ state: 'hidden', timeout: 4_000 }).catch(() => {});
    if ((await blocker().count()) === 0) {
      console.log(`[Naver] 복구 팝업 닫음 (${attempt}회차)`);
      return;
    }
  }

  throw new Error(
    '작성 중인 글 복구 팝업을 닫지 못했습니다 — 이 상태에서는 모든 클릭이 오버레이에 가로채입니다. ' +
      '팝업 버튼 셀렉터를 재확인하세요.',
  );
}

async function clearOverlays(page: Page, editor: Frame): Promise<void> {
  await dismissHelp(editor, page);

  for (const scope of [editor, page]) {
    const close = scope
      .locator('button, [role="button"], a')
      .filter({ hasText: /^\s*(닫기|취소|완료)\s*$/ })
      .filter({ visible: true })
      .first();
    if ((await close.count()) > 0) {
      await close.click({ timeout: 2_000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  await page.keyboard.press('Escape').catch(() => {});

  const blockers = await editor
    .locator('.se-popup-dim, .se-popup-alert, [class*="papago"], [class*="translation-layer"]')
    .filter({ visible: true })
    .count()
    .catch(() => 0);
  if (blockers > 0) {
    throw new Error(
      `에디터 위에 오버레이 ${blockers}개가 남아 클릭이 가로채입니다 (번역·복구·도움말 팝업). 스크린샷을 확인하세요.`,
    );
  }
}

async function dismissHelp(editor: Frame, page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => {});
  const help = editor.locator(SEL.helpClose);
  if (await help.count()) await help.first().click({ timeout: 3_000 }).catch(() => {});
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
}

async function applyQuoteBlock(page: Page, editor: Frame): Promise<boolean> {
  try {
    await dismissHelp(editor, page);
    const before = await editor.locator(SEL.quotation).count();
    const toolbarBtn = editor.locator('button:has-text("인용구")').filter({ visible: true }).first();
    if ((await toolbarBtn.count()) === 0) {
      const fallback = editor.locator(SEL.quoteButton).filter({ visible: true }).first();
      if ((await fallback.count()) === 0) return false;
      await fallback.click({ timeout: 5_000 });
    } else {
      await toolbarBtn.click({ timeout: 5_000 });
    }
    await page.waitForTimeout(400);

    const style = editor.locator(SEL.quoteStyle).filter({ visible: true }).first();
    if ((await style.count()) > 0) {
      await style.click({ timeout: 5_000 });
      await page.waitForTimeout(400);
    }
    const after = await editor.locator(SEL.quotation).count();
    if (after > before) return true;
    const last = editor.locator(SEL.quotation).last();
    if (after === before && (await last.count()) > 0) {
      const text = (await last.innerText()).replace(/\s+/g, '');
      if (/내용을입력하세요/.test(text) || text.length === 0) return true;
    }
    await page.keyboard.press('Escape').catch(() => {});
    return false;
  } catch {
    await page.keyboard.press('Escape').catch(() => {});
    return false;
  }
}

async function refocusBody(editor: Frame): Promise<void> {
  const outside = editor.locator('.se-component:not(.se-quotation) .se-text-paragraph').last();
  if ((await outside.count()) > 0) {
    await outside.click({ timeout: 5_000 }).catch(() => {});
    return;
  }
  await editor.locator(SEL.body).last().click({ timeout: 5_000 }).catch(() => {});
}

/**
 * 서식 툴바가 본문 모드인지 확인한다.
 *
 * 스마트에디터는 캐럿 위치에 따라 속성 툴바를 **교체**한다. 제목 컴포넌트에 캐럿이
 * 있으면 `title-font-size`만 남고 `bold`·`font-color` 버튼은 DOM에서 사라진다
 * (2026-08-27 실측). 그 상태에서 색상을 적용하려 하면 "팔레트 셀을 찾지 못했습니다"
 * 같은 엉뚱한 오류가 나서 진짜 원인이 묻힌다. 여기서 원인을 확정한다.
 */
async function assertBodyFormattingToolbar(editor: Frame, what: string): Promise<void> {
  const bold = await editor.locator('button[data-name="bold"]').filter({ visible: true }).count();
  if (bold > 0) return;
  const titleMode = await editor.locator('button[data-name="title-font-size"]').filter({ visible: true }).count();
  throw new Error(
    `서식 툴바가 본문 모드가 아닙니다 (${what}). ` +
      (titleMode > 0
        ? '캐럿이 제목 컴포넌트에 있습니다 — 본문을 먼저 클릭해야 합니다.'
        : '툴바를 찾지 못했습니다 — 복구 팝업이 남아 있거나 셀렉터가 바뀌었습니다.'),
  );
}

/**
 * 에디터에 들어간 이미지 **컴포넌트** 수.
 *
 * 예전에는 `.se-component.se-image, .se-module-image img` 합집합을 셌다. 후자는 전자의
 * 자식이라 장당 2회 계산됐고(4장 → 8), 그 결과 두 가지가 동시에 깨졌다:
 *   1) 발행 전 검증이 "이미지 8장 (최대 7)"으로 정상 글을 반려했다.
 *   2) insertImage가 `nth(before)`로 존재하지 않는 인덱스를 기다려 장당 30초를 태웠다.
 * 컴포넌트만 센다.
 */
async function countImages(editor: Frame): Promise<number> {
  return editor.locator('.se-component.se-image').count().catch(() => 0);
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
    // 제목이 달라도 최근 표식은 자동으로 지우지 않는다. A 글이 실제로 올라갔는지
    // 모르는 상태에서 표식을 없애면, 나중에 A를 다시 실행할 때 중복 게시를 못 막는다.
    const ageMs = Date.now() - Date.parse(pending.at);
    const STALE_MS = 24 * 60 * 60 * 1000;
    if (Number.isFinite(ageMs) && ageMs < STALE_MS) {
      throw new Error(
        `이전 실행(${pending.at})이 "${pending.title}" 발행을 시도했지만 결과가 확인되지 않았습니다.\n` +
          '네이버 블로그에서 그 글의 게시 여부를 먼저 확인하세요.\n' +
          '확인 후 .naver-blog/state/pending-publish.json 을 지우고 다시 실행하세요.',
      );
    }
    console.warn(`[Naver] 24시간 지난 발행 표식(${pending.title})을 정리합니다.`);
    clearPublishPending();
  }

  await assertSnapshotFresh(draft);

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
    // 세션 주인을 MyBlog 리다이렉트로 확인한다. NAVER_BLOG_ID가 있으면 우선하되,
    // 세션 계정이 대상(stock-matrix)과 다르면 로그인 재실행을 요구한다.
    await page.goto('https://blog.naver.com/MyBlog.naver', { waitUntil: 'domcontentloaded' });
    const detected = detectBlogIdFromUrl(page.url());
    const blogId = resolveBlogId(detected, process.env.NAVER_BLOG_ID);
    console.log(`블로그 ID: ${blogId}${detected && detected !== blogId ? ` (감지 ${detected})` : ''}`);

    await page.goto(`https://blog.naver.com/${blogId}/postwrite`, { waitUntil: 'domcontentloaded' });

    // 세션이 만료되면 에디터 대신 로그인 페이지가 뜬다. 에디터를 찾기 전에 확인해야
    // "프레임을 찾지 못했습니다"가 아니라 진짜 원인이 보고된다.
    if (page.url().includes('nid.naver.com')) {
      throw new Error('세션이 만료되었습니다. npm run naver:login 을 다시 실행하고 NAVER_SESSION_B64를 갱신하세요.');
    }

    const editor = await getEditor(page);
    await dismissHelp(editor, page);

    await dismissRecoveryPopup(page, editor);

    // 팝업을 닫은 직후에도 잔여 레이어가 클릭을 가로챌 수 있다 — 한 번 재시도한다.
    const titleField = editor.locator(SEL.title).first();
    try {
      await titleField.click({ timeout: 15_000 });
    } catch {
      await dismissRecoveryPopup(page, editor);
      await clearOverlays(page, editor);
      await titleField.click({ timeout: 15_000 });
    }
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
      throw new Error(formatVerifyError(verdict, shot));
    }
    console.log('발행 전 검증 통과 (제목·본문·인용구·볼드·색상·이미지·CTA)');

    // 도움말 패널이 발행 버튼의 pointer events를 가로챈다(실측: se-help-title 조상 컨테이너).
    await page.keyboard.press('Escape').catch(() => {});
    const help = editor.locator(SEL.helpClose);
    if (await help.count()) await help.first().click({ timeout: 3_000 }).catch(() => {});
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

    const openBtn = editor
      .locator('button, [role="button"]')
      .filter({ hasText: /발행/ })
      .filter({ visible: true })
      .first();
    await openBtn.click({ timeout: 10_000 });

    await selectCategory(editor, page);

    if (draft.tags?.length) {
      const tagInput = editor.locator(SEL.tagInput).first();
      if ((await tagInput.count()) === 0) {
        throw new Error('태그 입력기를 찾지 못했습니다 (SEL.tagInput 재보정 필요) — 태그 없이 발행하지 않습니다');
      }
      const wanted = tagsToEnter(draft.tags);
      for (const tag of wanted) {
        await tagInput.click();
        await page.keyboard.type(tag, { delay: 12 });
        await page.keyboard.press('Enter');
      }
      // 칩의 클래스는 해시(tag_item__ISVjt)라 배포마다 바뀐다. 실측에서 태그 11개가
      // 정상 입력됐는데도 클래스 미스로 발행이 막혔다. 클래스 대신 **우리가 넣은 태그가
      // `#태그` 형태로 패널에 보이는지**를 센다 — 본문에는 '#'가 없어 오검출이 없다.
      const entered = await editor.evaluate((tags) => {
        const text = document.body.innerText;
        return tags.filter((tag) => text.includes(`#${tag}`)).length;
      }, wanted);
      if (entered !== wanted.length) {
        throw new Error(
          `태그가 ${entered}/${wanted.length}개만 확인됩니다 — 초안과 불일치, 발행하지 않습니다`,
        );
      }
    }

    await page.screenshot({ path: shot, fullPage: true });
    console.log(`설정 패널 스크린샷: ${shot}`);

    if (!publish) {
      console.log('\ndry-run 입니다. 브라우저에서 확인 후 직접 발행하세요.');
      console.log('실제 발행까지 자동으로 하려면 --publish 를 붙이세요.');
      if (!headless) {
        console.log('창을 닫으면 종료됩니다.');
        await page.waitForEvent('close', { timeout: 0 });
      }
      return;
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

    if (outcome === 'error') {
      // 네이버가 명시적으로 발행 오류를 반환했다 = 게시되지 않았다. 표식을 남기면
      // 다음 날 실행이 "결과 미확인"으로 판단해 사람 확인을 요구하며 멈춘다(발행 0건).
      clearPublishPending();
    }
    if (outcome !== 'ok') {
      const detail = outcome === 'error'
        ? '네이버가 발행 오류를 반환했습니다(문서가 너무 크거나 이미지 처리 실패).'
        : '발행 후 페이지 이동이 확인되지 않았습니다.';
      throw new Error(`${detail} 스크린샷을 확인하세요.`);
    }

    // 기록은 발행이 실제로 끝난 뒤에만. 초안 생성 시점에 기록하면 발행이 깨진 날도
    // 그 테마가 14일간 후보에서 빠져 소재만 잃는다.
    //
    // 순서가 중요하다: 이력을 먼저 쓰고 표식을 나중에 지운다. 반대로 하면 그 사이
    // 프로세스가 죽었을 때 "게시는 됐는데 이력도 표식도 없는" 상태가 되어,
    // 재실행이 중복 게시하고 주간 상한도 넘긴다.
    const publishedAt = Date.now();
    recordPublish(publishedAt);
    if (draft.themeId) recordTheme(draft.themeId, publishedAt, THEME_COOLDOWN_DAYS);
    clearPublishPending();
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
