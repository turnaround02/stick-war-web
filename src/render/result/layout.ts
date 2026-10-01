/**
 * Result-overlay geometry and copy, as pure functions.
 *
 * Phaser-free on purpose: the project's rule is that anything in the render
 * layer which could be judged by an assertion must live in a module a test can
 * import. "Is the panel on screen", "do the buttons overlap", "what does the
 * title say" are all decidable here; `index.ts` only turns the answers into
 * objects — the same split as `hud/layout.ts` vs `hud/index.ts`.
 */

import { TICKS_PER_SEC } from '../../data/constants';
import { t } from '../../i18n';
import type { Outcome, World } from '../../sim/types';

export interface HudRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Preferred panel size; it shrinks to fit a small viewport rather than overflow. */
export const RESULT_PANEL = { w: 420, h: 220, buttonW: 160, buttonH: 48, gap: 16 } as const;

/** Margin kept between the panel and the viewport edge. */
const MARGIN = 16;
/** Gap between the buttons and the panel's bottom edge. */
const BOTTOM_PAD = 20;

/** The overlay appears only once the match is decided. */
export function shouldShowResult(world: World): boolean {
  return world.outcome !== 'ongoing';
}

export function resultTitle(outcome: Outcome): string {
  return outcome === 'playerWin' ? t('result.win') : t('result.lose');
}

/**
 * Ticks as `m:ss`.
 *
 * Formatted in code rather than through i18n interpolation: the string table is
 * a flat key->string map with no parameter support, and adding interpolation for
 * a single call site would be mechanism for one use.
 */
export function formatDuration(ticks: number): string {
  const total = Math.max(0, Math.floor(ticks / TICKS_PER_SEC));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function resultSubtitle(levelId: string, ticks: number): string {
  return `${t(`level.${levelId}.name`)} · ${t('result.time')} ${formatDuration(ticks)}`;
}

/** A centred panel that always fits the viewport. */
export function resultPanelRect(width: number, height: number): HudRect {
  const w = Math.min(RESULT_PANEL.w, Math.max(0, width - MARGIN * 2));
  const h = Math.min(RESULT_PANEL.h, Math.max(0, height - MARGIN * 2));
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/** The two action buttons, side by side under the text. */
export function resultButtonRects(
  width: number,
  height: number,
): { replay: HudRect; next: HudRect } {
  const panel = resultPanelRect(width, height);
  const gap = RESULT_PANEL.gap;
  // Shrink rather than overflow: a narrow panel must still hold both buttons.
  const w = Math.max(0, Math.min(RESULT_PANEL.buttonW, (panel.w - gap - 24) / 2));
  const h = Math.min(RESULT_PANEL.buttonH, Math.max(0, panel.h / 4));
  const totalW = w * 2 + gap;
  const startX = panel.x + (panel.w - totalW) / 2;
  const y = panel.y + panel.h - h - BOTTOM_PAD;
  return {
    replay: { x: startX, y, w, h },
    next: { x: startX + w + gap, y, w, h },
  };
}
