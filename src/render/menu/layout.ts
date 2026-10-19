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
import type { GameSpeedPref } from '../../save/storage';

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

/** One row in the level list: index into LEVELS plus its on-screen rect. */
export interface MenuRow {
  levelIndex: number;
  rect: MenuRect;
  /** Unlocked = the save's furthest level has reached this index. */
  enabled: boolean;
  /** Display name from the i18n table. */
  label: string;
  /** True for the endless row — flagged so the scene can style it differently. */
  endless: boolean;
}

/** The centred panel that holds everything. */
export function menuPanelRect(width: number, height: number): MenuRect {
  const w = Math.min(MENU_LAYOUT.panelW, Math.max(0, width - MARGIN * 2));
  // Panel grows with its content: title + rows + toggles + aux button.
  const contentH =
    MENU_LAYOUT.titleH +
    LEVELS.length * MENU_LAYOUT.rowH +
    (LEVELS.length - 1) * MENU_LAYOUT.rowGap +
    MENU_LAYOUT.rowGap +
    MENU_LAYOUT.toggleH + // toggles row
    MENU_LAYOUT.rowGap +
    MENU_LAYOUT.buttonH + // aux button
    MARGIN;
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
  const rowW = Math.min(360, Math.max(0, panel.w - MARGIN * 2));
  const startX = panel.x + (panel.w - rowW) / 2;

  const rows: MenuRow[] = [];
  let y = panel.y + MENU_LAYOUT.titleH;
  for (let i = 0; i < LEVELS.length; i++) {
    const cfg = LEVELS[i];
    rows.push({
      levelIndex: i,
      rect: { x: startX, y, w: rowW, h: MENU_LAYOUT.rowH },
      enabled: furthestLevel >= i,
      label: t(`level.${cfg.levelId}.name`),
      endless: cfg.endless === true,
    });
    y += MENU_LAYOUT.rowH + MENU_LAYOUT.rowGap;
  }
  return rows;
}

/** The "reset progress" button, centred under the rows and toggles. */
export function menuAuxRect(width: number, height: number): MenuRect {
  const panel = menuPanelRect(width, height);
  const rows = menuRows(width, height, 0);
  const last = rows[rows.length - 1];
  const lastBottom = last ? last.rect.y + last.rect.h : panel.y + MENU_LAYOUT.titleH;
  const togglesBottom = lastBottom + MENU_LAYOUT.rowGap + MENU_LAYOUT.toggleH;
  const w = Math.min(MENU_LAYOUT.auxW, Math.max(0, panel.w - MARGIN * 2));
  return {
    x: panel.x + (panel.w - w) / 2,
    y: Math.min(togglesBottom + MENU_LAYOUT.rowGap, panel.y + panel.h - MENU_LAYOUT.buttonH),
    w,
    h: MENU_LAYOUT.buttonH,
  };
}

/**
 * The two preference toggles, side by side under the level rows.
 *
 * Click cycles the value (sfx: on/off; speed: 1x → 2x → 4x). One rect each,
 * no overlap with the rows or the aux button — asserted in layout.test.ts.
 */
export function menuToggleRects(width: number, height: number): { speed: MenuRect; sfx: MenuRect } {
  const panel = menuPanelRect(width, height);
  const rows = menuRows(width, height, 0);
  const last = rows[rows.length - 1];
  const lastBottom = last ? last.rect.y + last.rect.h : panel.y + MENU_LAYOUT.titleH;
  const y = Math.min(
    lastBottom + MENU_LAYOUT.rowGap,
    panel.y + panel.h - MENU_LAYOUT.toggleH - MARGIN,
  );
  const gap = MENU_LAYOUT.rowGap;
  const w = Math.max(0, (Math.min(360, Math.max(0, panel.w - MARGIN * 2)) - gap) / 2);
  const startX = panel.x + (panel.w - (w * 2 + gap)) / 2;
  return {
    speed: { x: startX, y, w, h: MENU_LAYOUT.toggleH },
    sfx: { x: startX + w + gap, y, w, h: MENU_LAYOUT.toggleH },
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
