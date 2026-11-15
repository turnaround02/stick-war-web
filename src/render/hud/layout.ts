/**
 * HUD layout and labelling, kept free of Phaser so it is unit-testable.
 *
 * The scene's HUD objects position themselves from these results. Keeping the
 * arithmetic here means "does the bar fit on screen", "do the buttons
 * overlap", and "is the button greyed out" are all answerable without a canvas
 * — and they are the parts that actually break when the window resizes.
 */

import { UNITS, type UnitTypeId } from '../../data/units';
import { canQueue } from '../../sim/training';
import { t } from '../../i18n';
import { SPEED_STEPS, type GameSpeed } from '../timestep';
import type { Side, Stance, World } from '../../sim/types';

/** A screen-space rectangle for one HUD element. */
export interface HudRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Dimensions shared by the layout functions. */
export interface HudMetrics {
  buttonW: number;
  buttonH: number;
  gap: number;
  barHeight: number;
}

/** The six trainable types, in button order. */
export const TRAINABLE: readonly UnitTypeId[] = ['miner', 'swordsman', 'archer', 'spearman', 'giant', 'mage'];

/** The three army-wide stance orders, in button order. */
export const STANCE_BUTTONS: readonly { stance: Stance; key: string }[] = [
  { stance: 'advance', key: 'ui.advanceAll' },
  { stance: 'hold', key: 'ui.holdAll' },
  { stance: 'retreat', key: 'ui.retreatAll' },
];

/**
 * The metrics the scene draws the HUD with.
 *
 * LIVES HERE, not in `index.ts` (M8): the click guard derives the top-right
 * reserve from the button cluster, and importing from `index.ts` would drag
 * the Phaser renderer into a pure-arithmetic module — ESM resolves that as
 * `undefined`, which is exactly how the first attempt shipped a silent
 * `metrics.gap` crash. Layout owns the numbers; the renderer imports them.
 */
export const HUD_METRICS: HudMetrics = { buttonW: 108, buttonH: 44, gap: 8, barHeight: 64 };

const SIDE_PADDING = 16;
const SPEED_BUTTON_W = 52;
const SPEED_BUTTON_H = 30;
const SPEED_TOP = 14;
/** Wider than a speed button: the label is two characters, not three. */
const PAUSE_BUTTON_W = 64;
/** Same height as the speed buttons, so the top-right row lines up. */
const PAUSE_BUTTON_H = SPEED_BUTTON_H;
/** Same row, left of the pause button: returns to the level menu (M8). */
const MENU_BUTTON_W = 64;
const MENU_BUTTON_H = SPEED_BUTTON_H;

/** The resource readout: gold and population against the cap. */
export function resourceText(world: World, side: Side): string {
  const gold = Math.floor(world.gold[side]);
  const pop = world.popUsed[side];
  const cap = world.popCap[side];
  return `${t('ui.gold')} ${gold}    ${t('ui.population')} ${pop}/${cap}`;
}

/** The resource readout split into TWO lines (narrow viewports, M9b). */
export function resourceLines(world: World, side: Side): { line1: string; line2: string } {
  const gold = Math.floor(world.gold[side]);
  const pop = world.popUsed[side];
  const cap = world.popCap[side];
  return {
    line1: `${t('ui.gold')} ${gold}`,
    line2: `${t('ui.population')} ${pop}/${cap}`,
  };
}

/**
 * The width the resource readout needs.
 *
 * Wide viewports render the single-line form (≈230px); narrow ones stack the
 * two lines (≈110px). The caller passes which form it renders so the 240px
 * CLICK_RESERVE and this number cannot disagree — the reserve is exactly this
 * plus padding, derived, not hardcoded twice.
 */
export function resourceReserveWidth(narrow: boolean): number {
  // Two-line form: the wider line is "人口 8/60" ≈ 108px at 16px monospace.
  return narrow ? 132 : 240;
}

/**
 * The endless wave readout, or '' for a non-endless match.
 *
 * In endless mode "which wave you reached" IS the score (spec §13.8 Q17), so it
 * gets its own HUD line. A campaign level has no such score — showing a wave
 * number there would imply a meaning the mode does not have — hence the empty
 * string rather than a hidden element with content.
 */
export function waveText(world: World): string {
  if (!world.endless) return '';
  return `${t('ui.wave')} ${world.waveIndex}`;
}

/** Label, enabled state, and — when disabled — why. */
export function trainButtonState(
  world: World,
  side: Side,
  typeId: UnitTypeId,
): { label: string; enabled: boolean; reason: string } {
  const def = UNITS[typeId];
  const check = canQueue(world, side, typeId);
  return {
    label: `${t(def.nameKey)} ${def.goldCost}`,
    enabled: check.ok,
    // A greyed-out button with a reason tells the player what to fix; one that
    // silently vanishes makes them think they mis-clicked.
    reason: check.ok ? '' : check.reason === 'gold' ? t('ui.noGold') : t('ui.popFull'),
  };
}

/** Bottom-bar rows, centred on the viewport width. */
function barRowY(height: number, metrics: HudMetrics): number {
  return height - metrics.barHeight / 2;
}

function rowWidthOf(count: number, buttonW: number, gap: number): number {
  return count * buttonW + (count - 1) * gap;
}

function rowWidth(count: number, metrics: HudMetrics): number {
  return rowWidthOf(count, metrics.buttonW, metrics.gap);
}

function layoutRowAt(
  count: number,
  startX: number,
  y: number,
  buttonW: number,
  buttonH: number,
  gap: number,
): HudRect[] {
  const rects: HudRect[] = [];
  let x = startX;
  for (let i = 0; i < count; i++) {
    rects.push({ x, y, w: buttonW, h: buttonH });
    x += buttonW + gap;
  }
  return rects;
}

function layoutRow(
  count: number,
  startX: number,
  height: number,
  metrics: HudMetrics,
  buttonW = metrics.buttonW,
): HudRect[] {
  return layoutRowAt(count, startX, barRowY(height, metrics) - metrics.buttonH / 2, buttonW, metrics.buttonH, metrics.gap);
}

/** Vertical padding above/below the bottom-bar rows. 64 = 44 + 2×10 today. */
const BOTTOM_PAD = 10;

/** Squeezed buttons never shrink below this; below ~340px the row may clip. */
const BUTTON_W_FLOOR = 32;

/**
 * The bottom bar's squeeze ladder (M13b).
 *
 * The bar is 9 fixed buttons (6 train + 3 stance). At HUD_METRICS that row is
 * 1036px wide; centred on a narrower viewport it overflowed BOTH edges, putting
 * the miner, swordsman, hold and retreat buttons physically off-screen (seen
 * live at 718px). The ladder, widest band first:
 *
 *   ≥ trainRow + stanceRow + padding  — one row, full-size buttons (unchanged)
 *   ≥ trainRow + padding              — one row, squeezed buttons, two-line
 *                                       labels (`compact`)
 *   below                             — two stacked rows: train on the BOTTOM
 *                                       (most-used, closest to the edge),
 *                                       stance above it; the 6-button train
 *                                       row sets the button width
 *
 * Every threshold is DERIVED from rowWidth + SIDE_PADDING, never a bare
 * constant — the same rule M9b enforced for the top bar. The renderer and the
 * click guard both read `bottomBarLayout`/`bottomBarHeight`, so the drawn bar,
 * the hit areas and the reserved region cannot disagree.
 */
export interface BottomBarLayout {
  /** 1 = one row of 9; 2 = train row + stance row stacked. */
  rows: 1 | 2;
  /** Effective button width for THIS viewport (may be < HUD_METRICS.buttonW). */
  buttonW: number;
  buttonH: number;
  gap: number;
  /** Total bar height: the renderer's background and the click guard use it. */
  barHeight: number;
  /** True when labels must render as two lines (name / price-or-reason). */
  compact: boolean;
}

export function bottomBarLayout(width: number, metrics: HudMetrics): BottomBarLayout {
  const allCount = TRAINABLE.length + STANCE_BUTTONS.length;
  if (width >= rowWidth(allCount, metrics) + 2 * SIDE_PADDING) {
    return {
      rows: 1,
      buttonW: metrics.buttonW,
      buttonH: metrics.buttonH,
      gap: metrics.gap,
      barHeight: metrics.barHeight,
      compact: false,
    };
  }
  if (width >= rowWidth(TRAINABLE.length, metrics) + 2 * SIDE_PADDING) {
    const buttonW = Math.floor(
      (width - 2 * SIDE_PADDING - (allCount - 1) * metrics.gap) / allCount,
    );
    return {
      rows: 1,
      buttonW,
      buttonH: metrics.buttonH,
      gap: metrics.gap,
      barHeight: metrics.barHeight,
      compact: true,
    };
  }
  const buttonW = Math.max(
    BUTTON_W_FLOOR,
    Math.floor((width - 2 * SIDE_PADDING - (TRAINABLE.length - 1) * metrics.gap) / TRAINABLE.length),
  );
  return {
    rows: 2,
    buttonW,
    buttonH: metrics.buttonH,
    gap: metrics.gap,
    barHeight: 2 * metrics.buttonH + metrics.gap + 2 * BOTTOM_PAD,
    compact: true,
  };
}

/** The bar height at this width — the single source for renderer and guard. */
export function bottomBarHeight(width: number, metrics: HudMetrics = HUD_METRICS): number {
  return bottomBarLayout(width, metrics).barHeight;
}

export function layoutTrainButtons(width: number, height: number, metrics: HudMetrics): HudRect[] {
  const bl = bottomBarLayout(width, metrics);
  if (bl.rows === 1) {
    const total = rowWidthOf(TRAINABLE.length + STANCE_BUTTONS.length, bl.buttonW, bl.gap);
    return layoutRow(TRAINABLE.length, Math.round((width - total) / 2), height, metrics, bl.buttonW);
  }
  const startX = Math.round((width - rowWidthOf(TRAINABLE.length, bl.buttonW, bl.gap)) / 2);
  const y = height - BOTTOM_PAD - bl.buttonH;
  return layoutRowAt(TRAINABLE.length, startX, y, bl.buttonW, bl.buttonH, bl.gap);
}

export function layoutStanceButtons(width: number, height: number, metrics: HudMetrics): HudRect[] {
  const bl = bottomBarLayout(width, metrics);
  if (bl.rows === 1) {
    const trainW = rowWidthOf(TRAINABLE.length, bl.buttonW, bl.gap) + bl.gap;
    const total = rowWidthOf(TRAINABLE.length + STANCE_BUTTONS.length, bl.buttonW, bl.gap);
    return layoutRow(STANCE_BUTTONS.length, Math.round((width - total) / 2) + trainW, height, metrics, bl.buttonW);
  }
  const startX = Math.round((width - rowWidthOf(STANCE_BUTTONS.length, bl.buttonW, bl.gap)) / 2);
  const y = height - BOTTOM_PAD - bl.buttonH - bl.gap - bl.buttonH;
  return layoutRowAt(STANCE_BUTTONS.length, startX, y, bl.buttonW, bl.buttonH, bl.gap);
}

/**
 * A squeezed train button's TWO-LINE label (M13b).
 *
 * `trainButtonState` composes "name price" for the wide row; a squeezed button
 * cannot hold that on one line, so the name goes on top and the price below.
 * A DISABLED button shows the reason instead of the price: the price is what
 * the player already knows, the reason is what tells them what to fix.
 */
export function compactTrainLabel(
  typeId: UnitTypeId,
  enabled: boolean,
  reason: string,
): { line1: string; line2: string } {
  const def = UNITS[typeId];
  return {
    line1: t(def.nameKey),
    line2: enabled ? `${def.goldCost}` : reason,
  };
}

/**
 * Speed buttons, anchored to the RIGHT edge.
 *
 * Right-anchored rather than centred: with absolute coordinates the group would
 * drift toward the middle of the screen as the window widened.
 */
export function layoutSpeedButtons(width: number, metrics: HudMetrics): HudRect[] {
  const count = SPEED_STEPS.length;
  const total = count * SPEED_BUTTON_W + (count - 1) * metrics.gap;
  let x = width - SIDE_PADDING - total;
  // A very narrow window could push the group off the left edge; clamp it.
  if (x < SIDE_PADDING) x = SIDE_PADDING;

  const rects: HudRect[] = [];
  for (let i = 0; i < count; i++) {
    rects.push({ x, y: SPEED_TOP, w: SPEED_BUTTON_W, h: SPEED_BUTTON_H });
    x += SPEED_BUTTON_W + metrics.gap;
  }
  return rects;
}

/** Speed-button dimensions, exported so the scene does not hardcode them. */
export const SPEED_BUTTON = { w: SPEED_BUTTON_W, h: SPEED_BUTTON_H, top: SPEED_TOP } as const;

/** The pause button's label for the current state. */
export function pauseLabel(paused: boolean): string {
  return t(paused ? 'ui.resume' : 'ui.pause');
}

/** The in-game menu button's label (M8). Static — the action never changes. */
export function menuLabel(): string {
  return t('ui.menu');
}

/**
 * A speed button's label, e.g. `1x`.
 *
 * Exists because the buttons shipped as three BLANK rectangles: `setSpeed` set
 * only the fill colour and nothing ever called `setText` on their labels. There
 * was a `pauseLabel` helper and no speed counterpart, which is how the gap hid.
 */
export function speedLabel(speed: GameSpeed): string {
  return `${speed}x`;
}

/**
 * The pause button, immediately left of the speed group.
 *
 * Spec §7.3 lists it beside the speed control. It is DERIVED from the speed
 * layout rather than positioned independently, so the two cannot drift apart or
 * overlap at any window width.
 */
export function layoutPauseButton(width: number, metrics: HudMetrics): HudRect {
  const first = layoutSpeedButtons(width, metrics)[0];
  return {
    x: Math.max(0, first.x - PAUSE_BUTTON_W - metrics.gap),
    y: first.y,
    w: PAUSE_BUTTON_W,
    h: PAUSE_BUTTON_H,
  };
}

/** Pause-button dimensions, so the renderer cannot silently disagree with the layout. */
export const PAUSE_BUTTON = { w: PAUSE_BUTTON_W, h: PAUSE_BUTTON_H } as const;

/**
 * The in-game menu button, immediately left of the pause button (M8).
 *
 * Derived from the pause layout the same way pause is derived from the speed
 * group — one chain, no independent coordinates, no possible overlap.
 */
export function layoutMenuButton(width: number, metrics: HudMetrics): HudRect {
  const pause = layoutPauseButton(width, metrics);
  return {
    x: Math.max(0, pause.x - MENU_BUTTON_W - metrics.gap),
    y: pause.y,
    w: MENU_BUTTON_W,
    h: MENU_BUTTON_H,
  };
}

/** Menu-button dimensions, exported for the same reason as PAUSE_BUTTON. */
export const MENU_BUTTON = { w: MENU_BUTTON_W, h: MENU_BUTTON_H } as const;

/** The top-left screen reserve for the resource readout (see clickGuard). */
export const RESOURCE_RESERVE_X = 240;

/**
 * The right-hand HUD cluster's total width (menu + pause + speed + gaps).
 *
 * The frontline indicator shrinks to the band between this and the resource
 * reserve on narrow viewports; one function here is the single source both the
 * guard and the indicator derive from.
 */
export function topRightClusterWidth(metrics: HudMetrics): number {
  const speedTotal = SPEED_STEPS.length * SPEED_BUTTON_W + (SPEED_STEPS.length - 1) * metrics.gap;
  return speedTotal + metrics.gap + PAUSE_BUTTON_W + metrics.gap + MENU_BUTTON_W;
}

/**
 * The x where the speed cluster's header text should sit, or null when there
 * is no room for it.
 *
 * M8b: the header previously sat at `menu.x - gap` unconditionally. A narrow
 * viewport (menu.x ≈ 267 at 532px wide) pushed the two-character header into
 * the top-left resource readout AND under the menu button's label — three
 * texts stacked on one spot. The rule now: the header only renders if the
 * space between the resource reserve (240px) and the menu button can hold it
 * with breathing room; otherwise the caller hides it (the speed buttons are
 * self-labelling "1x/2x/4x", so the header is a nicety, not information).
 */
export function speedHeaderRight(width: number, metrics: HudMetrics): number | null {
  const menu = layoutMenuButton(width, metrics);
  const x = menu.x - metrics.gap;
  return x - RESOURCE_RESERVE_X >= 48 ? x : null;
}
