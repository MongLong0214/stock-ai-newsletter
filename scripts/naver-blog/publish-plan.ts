/**
 * 본문 입력 순서 — 문단 인덱스가 아니라 슬롯·의미 블록으로 이미지를 넣는다.
 * 배치 실패 이미지를 글 끝에 붙이지 않는다.
 */

import {
  IMAGE_SLOT_RE,
  QUOTE_PREFIX,
  type ImagePlacement,
} from './draft-model';

export type BodyAction =
  | { caption: string; kind: 'image'; path: string }
  | { kind: 'oglink'; url: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string };

const URL_ONLY = /^(https?:\/\/\S+)$/;

function placementForSlot(
  slotId: string,
  placements: readonly ImagePlacement[],
): ImagePlacement | undefined {
  return placements.find(
    (item) => item.id === slotId || item.sourceSection === slotId || item.path.endsWith(`${slotId}.png`),
  );
}

export function planBodyActions(
  body: string,
  placements: readonly ImagePlacement[],
): BodyAction[] {
  const used = new Set<string>();
  const actions: BodyAction[] = [];
  const parts = body.split('\n\n').map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    const slot = part.match(/^\{\{image:([^}]+)\}\}$/);
    if (slot) {
      const placed = placementForSlot(slot[1], placements);
      if (!placed) continue;
      if (used.has(placed.path)) continue;
      used.add(placed.path);
      actions.push({ kind: 'image', path: placed.path, caption: placed.caption });
      continue;
    }

    if (part.startsWith(QUOTE_PREFIX)) {
      actions.push({ kind: 'quote', text: part.slice(QUOTE_PREFIX.length).trim() });
      continue;
    }

    const url = part.match(URL_ONLY);
    if (url) {
      actions.push({ kind: 'oglink', url: url[1] });
      continue;
    }

    if (IMAGE_SLOT_RE.test(part)) {
      throw new Error(`이미지 슬롯이 문단 안에 섞여 있습니다: ${part.slice(0, 40)}`);
    }

    actions.push({ kind: 'paragraph', text: part });
  }

  const unused = placements.filter((item) => !used.has(item.path));
  if (unused.length) {
    throw new Error(
      `배치되지 않은 이미지: ${unused.map((item) => item.id).join(', ')} — 글 끝에 붙이지 않고 중단한다`,
    );
  }

  for (let i = 1; i < actions.length; i += 1) {
    if (actions[i].kind === 'image' && actions[i - 1].kind === 'image') {
      throw new Error('이미지가 연속 배치됨 — 발행 중단');
    }
  }

  const last = actions.at(-1);
  if (!last || last.kind !== 'oglink') {
    throw new Error('CTA 오글링크가 마지막 컴포넌트가 아님 — 발행 중단');
  }

  return actions;
}

export function assertNoCtaTail(actions: readonly BodyAction[]): void {
  const ctaIndex = actions.findIndex((action) => action.kind === 'oglink');
  if (ctaIndex === -1) throw new Error('CTA 오글링크 없음');
  const after = actions.slice(ctaIndex + 1);
  if (after.length) {
    throw new Error(`CTA 뒤 컴포넌트 ${after.length}개 — 발행 중단`);
  }
}
