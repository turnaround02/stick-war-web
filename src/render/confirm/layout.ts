/**
 * The "return to menu?" confirm overlay, as pure geometry + copy.
 *
 * Phaser-free for the usual reason: whether the panel fits, whether the two
 * buttons overlap, and what the title says are all decidable by assertion.
 * `index.ts` turns the answers into objects.
 *
 * The overlay exists because returning to the menu DISCARDS the running match
 * (no in-progress state is stored — spec §10.1.1). A mis-click must not cost a
 * 3-minute level-3 grind, so the direct action is guarded.
 */

import { t } from '../../i18n';

export interface ConfirmRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CONFIRM_LAYOUT = { w: 320, h: 150, buttonW: 120, buttonH: 40, gap: 16 } as const;

const MARGIN = 16;
const BOTTOM_PAD = 18;

/** Centred panel that always fits the viewport. */
export function confirmPanelRect(width: number, height: number): ConfirmRect {
  const w = Math.min(CONFIRM_LAYOUT.w, Math.max(0, width - MARGIN * 2));
  const h = Math.min(CONFIRM_LAYOUT.h, Math.max(0, height - MARGIN * 2));
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/** The two buttons, side by side under the text. */
export function confirmButtonRects(
  width: number,
  height: number,
): { yes: ConfirmRect; no: ConfirmRect } {
  const panel = confirmPanelRect(width, height);
  const gap = CONFIRM_LAYOUT.gap;
  const w = Math.max(0, Math.min(CONFIRM_LAYOUT.buttonW, (panel.w - gap - 24) / 2));
  const h = Math.min(CONFIRM_LAYOUT.buttonH, Math.max(0, panel.h / 4));
  const totalW = w * 2 + gap;
  const startX = panel.x + (panel.w - totalW) / 2;
  const y = panel.y + panel.h - h - BOTTOM_PAD;
  return {
    yes: { x: startX, y, w, h },
    no: { x: startX + w + gap, y, w, h },
  };
}

export function confirmTitle(): string {
  return t('confirm.menu.title');
}

export function confirmYesLabel(): string {
  return t('confirm.menu.yes');
}

export function confirmNoLabel(): string {
  return t('confirm.menu.no');
}
