/**
 * The "how to play" overlay geometry + copy, as pure functions.
 *
 * Same shape as `confirm/layout.ts`: panel + line items, all decidable here.
 * The menu opens it; the content states the controls a player cannot discover
 * from the UI alone (A/D scroll, stance hotkeys, pause, replay, touch).
 */

import { t } from '../../i18n';

export interface HelpRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const HELP_LAYOUT = { w: 520, h: 320, lineH: 26, pad: 24 } as const;

const MARGIN = 16;

/** Centred panel that always fits the viewport. */
export function helpPanelRect(width: number, height: number): HelpRect {
  const w = Math.min(HELP_LAYOUT.w, Math.max(0, width - MARGIN * 2));
  const h = Math.min(HELP_LAYOUT.h, Math.max(0, height - MARGIN * 2));
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/** The control lines, in display order. */
export function helpLines(): string[] {
  return [
    t('help.scroll'),
    t('help.stance'),
    t('help.pause'),
    t('help.replay'),
    t('help.touch'),
  ];
}

/** The close button, centred at the panel's bottom. */
export function helpCloseRect(width: number, height: number): HelpRect {
  const panel = helpPanelRect(width, height);
  const w = 120;
  const h = 36;
  return { x: panel.x + (panel.w - w) / 2, y: panel.y + panel.h - h - 14, w, h };
}

export function helpTitle(): string {
  return t('help.title');
}

export function helpCloseLabel(): string {
  return t('help.close');
}
