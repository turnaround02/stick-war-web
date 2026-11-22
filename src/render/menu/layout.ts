/**
 * Level-select menu geometry and state, kept free of Phaser.
 *
 * Same split as `hud/layout.ts` and `result/layout.ts`: "is this level
 * unlocked", "does the button fit", "which rows overlap" are all decidable
 * here with plain arithmetic; `MenuScene` only turns the answers into objects.
 *
 * Unlock rule reads the SAME save field the BootScene resume uses
 * (`SaveData.furthestLevel`, advanced only on a win and capped at the last
 * campaign level), so the menu can never offer a level the resume would not
 * start.
 */

import { LEVELS, LAST_CAMPAIGN_INDEX } from '../../data/levels';
import { t } from '../../i18n';
import type { GameSpeedPref, RendererPref } from '../../save/storage';

export interface MenuRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Panel and row dimensions. Rows shrink to fit a small viewport, like the result panel. */
export const MENU_LAYOUT = {
  panelW: 420,
  rowH: 48,
  rowGap: 12,
  titleH: 64,
  buttonH: 40,
  /** The auxiliary action under the level list (reset progress). */
  auxW: 200,
  /**
   * The two preference toggles (speed / sfx), side by side between the rows
   * and the reset button. Each takes half the row width minus a gap.
   */
  toggleH: 36,
} as const;

const MARGIN = 16;

/**
 * The smallest a level row may shrink to before the panel is considered
 * out of its supported envelope. Below this the content is allowed to
 * overflow rather than become unreadable slivers.
 */
const MIN_ROW_H = 28;

/** One row in the level list: index into LEVELS plus its on-screen rect. */
export interface MenuRow {
  levelIndex: number;
  rect: MenuRect;
  /** Unlocked = the save's furthest level has reached this index. */
  enabled: boolean;
  /** Display name from the i18n table. */
  label: string;
  /**
   * One-line mechanic description (M8). Exists because level 1's "the enemy
   * has NO economy" reads as a BUG to a player who never saw the data — the
   * enemy field has no miners, so the player looked for them. The mechanics a
   * player cannot see must be stated, not discovered.
   */
  description: string;
  /** True for the endless row — flagged so the scene can style it differently. */
  endless: boolean;
}

/**
 * The vertical chrome around the level rows, in px: title + the three section
 * gaps + the two toggle rows + the aux button + the bottom margin.
 *
 * Every vertical position in the menu is derived from this single number plus
 * the row height, so the panel can never be sized from a different sum than
 * the one the rows are laid out with.
 */
function menuChromeH(): number {
  return (
    MENU_LAYOUT.titleH +
    MENU_LAYOUT.rowGap * 3 + // rows→toggles, toggles→renderer, renderer→aux
    MENU_LAYOUT.toggleH * 2 + // speed+sfx row, renderer row
    MENU_LAYOUT.buttonH +
    MARGIN
  );
}

/**
 * The row height that fits the viewport.
 *
 * On a tall viewport this is `MENU_LAYOUT.rowH` (48) — the frozen desktop
 * value. On a short one the rows SHRINK so the panel still fits: the menu grew
 * a second toggle row in M14, and without this a 640×480 viewport overflowed
 * its panel (the aux button slid out the bottom). Same philosophy as the M13b
 * bottom-bar squeeze ladder: squeeze at the threshold, never move the desktop.
 *
 * Below `MIN_ROW_H` the viewport is outside the supported envelope and the
 * content is allowed to overflow rather than become unreadable slivers.
 */
export function menuRowHeight(height: number): number {
  const avail = Math.max(0, height - MARGIN * 2);
  const forRows = avail - menuChromeH();
  const n = LEVELS.length;
  const gaps = (n - 1) * MENU_LAYOUT.rowGap;
  const full = n * MENU_LAYOUT.rowH + gaps;
  if (forRows >= full) return MENU_LAYOUT.rowH;
  return Math.max(MIN_ROW_H, (forRows - gaps) / n);
}

/** The centred panel that holds everything. */
export function menuPanelRect(width: number, height: number): MenuRect {
  const w = Math.min(MENU_LAYOUT.panelW, Math.max(0, width - MARGIN * 2));
  const rowH = menuRowHeight(height);
  const contentH =
    menuChromeH() + LEVELS.length * rowH + (LEVELS.length - 1) * MENU_LAYOUT.rowGap;
  const h = Math.min(contentH, Math.max(0, height - MARGIN * 2));
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/**
 * The level rows, stacked under the title.
 *
 * A level is unlocked when `furthestLevel >= index` — `furthestLevel` points at
 * the furthest REACHED level (winning level i unlocks i+1), so index 0 is
 * always playable and the endless row opens only after the last campaign level
 * is beaten.
 */
export function menuRows(width: number, height: number, furthestLevel: number): MenuRow[] {
  const panel = menuPanelRect(width, height);
  const rowH = menuRowHeight(height);
  const rowW = Math.min(360, Math.max(0, panel.w - MARGIN * 2));
  const startX = panel.x + (panel.w - rowW) / 2;

  const rows: MenuRow[] = [];
  let y = panel.y + MENU_LAYOUT.titleH;
  for (let i = 0; i < LEVELS.length; i++) {
    const cfg = LEVELS[i];
    rows.push({
      levelIndex: i,
      rect: { x: startX, y, w: rowW, h: rowH },
      enabled: furthestLevel >= i,
      label: t(`level.${cfg.levelId}.name`),
      description: t(`level.${cfg.levelId}.desc`),
      endless: cfg.endless === true,
    });
    y += rowH + MENU_LAYOUT.rowGap;
  }
  return rows;
}

/**
 * The bottom of the last level row — the single cursor every element below the
 * list continues from. Exported so the toggles and the aux button cannot drift
 * from the rows: they all walk the same chain.
 */
function rowsBottom(panel: MenuRect, rows: MenuRow[]): number {
  const last = rows[rows.length - 1];
  return last ? last.rect.y + last.rect.h : panel.y + MENU_LAYOUT.titleH;
}

/** The "reset progress" button, centred under the rows and toggles. */
export function menuAuxRect(width: number, height: number): MenuRect {
  const panel = menuPanelRect(width, height);
  const rows = menuRows(width, height, 0);
  // TWO toggle rows sit between the level list and this button (speed+sfx,
  // then renderer). The panel is sized from the SAME chrome sum, so the cursor
  // walk lands inside it without clamping — clamping was what let the renderer
  // toggle and the reset button overlap at 640×480 (M14 layout bug).
  const togglesBottom =
    rowsBottom(panel, rows) +
    MENU_LAYOUT.rowGap +
    MENU_LAYOUT.toggleH +
    MENU_LAYOUT.rowGap +
    MENU_LAYOUT.toggleH;
  const w = Math.min(MENU_LAYOUT.auxW, Math.max(0, panel.w - MARGIN * 2));
  return {
    x: panel.x + (panel.w - w) / 2,
    y: togglesBottom + MENU_LAYOUT.rowGap,
    w,
    h: MENU_LAYOUT.buttonH,
  };
}

/**
 * The preference toggles, under the level rows.
 *
 * Row 1: speed + sfx, side by side (each half the content width).
 * Row 2: renderer, full content width — the label "形象: 精灵/骨架" is longer
 * than the others, and giving it its own row keeps it readable at every
 * viewport instead of gambling on a third column fitting.
 *
 * Click cycles the value (sfx: on/off; speed: 1x → 2x → 4x; renderer:
 * sprite/skeleton). No overlap with the rows or the aux button — asserted in
 * layout.test.ts.
 */
export function menuToggleRects(
  width: number,
  height: number,
): { speed: MenuRect; sfx: MenuRect; renderer: MenuRect } {
  const panel = menuPanelRect(width, height);
  const rows = menuRows(width, height, 0);
  // The panel's height is derived from the same chrome sum, so the toggles
  // always land inside it. No clamp — clamping is what caused the overlap.
  const y = rowsBottom(panel, rows) + MENU_LAYOUT.rowGap;
  const gap = MENU_LAYOUT.rowGap;
  const contentW = Math.min(360, Math.max(0, panel.w - MARGIN * 2));
  const halfW = Math.max(0, (contentW - gap) / 2);
  const startX = panel.x + (panel.w - (halfW * 2 + gap)) / 2;
  const rendererY = y + MENU_LAYOUT.toggleH + gap;
  return {
    speed: { x: startX, y, w: halfW, h: MENU_LAYOUT.toggleH },
    sfx: { x: startX + halfW + gap, y, w: halfW, h: MENU_LAYOUT.toggleH },
    renderer: {
      x: panel.x + (panel.w - contentW) / 2,
      y: rendererY,
      w: contentW,
      h: MENU_LAYOUT.toggleH,
    },
  };
}

/** Speed preferences cycle in this order. */
export const SPEED_CYCLE: readonly GameSpeedPref[] = [1, 2, 4];

/** The next speed after the current one, wrapping through SPEED_CYCLE. An
 * unknown value recovers to the first entry (1x). */
export function nextSpeed(current: GameSpeedPref): GameSpeedPref {
  const i = SPEED_CYCLE.indexOf(current);
  if (i < 0) return SPEED_CYCLE[0]!;
  return SPEED_CYCLE[(i + 1) % SPEED_CYCLE.length]!;
}

/** The speed toggle's label: the value that WILL apply to the next match. */
export function speedToggleLabel(current: GameSpeedPref): string {
  return `${t('menu.speedPref')}: ${current}x`;
}

/** The sfx toggle's label: the state after clicking (the target state). */
export function sfxToggleLabel(muted: boolean): string {
  return `${t('menu.sfxPref')}: ${t(muted ? 'menu.sfxOff' : 'menu.sfxOn')}`;
}

/** Renderer preferences cycle in this order (M14). */
export const RENDERER_CYCLE: readonly RendererPref[] = ['sprite', 'skeleton'];

/** The next renderer after the current one, wrapping. Unknown → 'sprite'. */
export function nextRenderer(current: RendererPref): RendererPref {
  const i = RENDERER_CYCLE.indexOf(current);
  if (i < 0) return RENDERER_CYCLE[0]!;
  return RENDERER_CYCLE[(i + 1) % RENDERER_CYCLE.length]!;
}

/** The renderer toggle's label: the value that WILL apply to the next match. */
export function rendererToggleLabel(current: RendererPref): string {
  return `${t('menu.rendererPref')}: ${t(current === 'sprite' ? 'menu.rendererSprite' : 'menu.rendererSkeleton')}`;
}

/**
 * Guard for the aux button: progress may only be reset when there IS progress.
 * Resetting a fresh save is a no-op the scene should not offer.
 */
export function canResetProgress(furthestLevel: number, endlessBestWave: number): boolean {
  return furthestLevel > 0 || endlessBestWave > 0;
}

/**
 * Which level a "resume" should start, matching BootScene's rule.
 *
 * Kept here so the menu's highlighted row and the resume behaviour agree by
 * construction — two places deriving "furthest" from the same field is how
 * drift starts. Capped at the last CAMPAIGN level, exactly like the save's
 * own cap: beating the final level must not park a resume in endless.
 */
export function resumeLevelIndex(furthestLevel: number): number {
  return Math.min(Math.max(0, furthestLevel), LAST_CAMPAIGN_INDEX);
}
