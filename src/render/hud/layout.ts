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

const SIDE_PADDING = 16;
const SPEED_BUTTON_W = 52;
const SPEED_BUTTON_H = 30;
const SPEED_TOP = 14;
/** Wider than a speed button: the label is two characters, not three. */
const PAUSE_BUTTON_W = 64;
/** Same height as the speed buttons, so the top-right row lines up. */
const PAUSE_BUTTON_H = SPEED_BUTTON_H;

/** The resource readout: gold and population against the cap. */
export function resourceText(world: World, side: Side): string {
  const gold = Math.floor(world.gold[side]);
  const pop = world.popUsed[side];
  const cap = world.popCap[side];
  return `${t('ui.gold')} ${gold}    ${t('ui.population')} ${pop}/${cap}`;
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

function rowWidth(count: number, metrics: HudMetrics): number {
  return count * metrics.buttonW + (count - 1) * metrics.gap;
}

function layoutRow(
  count: number,
  startX: number,
  height: number,
  metrics: HudMetrics,
): HudRect[] {
  const rects: HudRect[] = [];
  let x = startX;
  const y = barRowY(height, metrics) - metrics.buttonH / 2;
  for (let i = 0; i < count; i++) {
    rects.push({ x, y, w: metrics.buttonW, h: metrics.buttonH });
    x += metrics.buttonW + metrics.gap;
  }
  return rects;
}

/** Left edge of the whole bottom bar, so train + stance sit as one group. */
function barStartX(width: number, metrics: HudMetrics): number {
  const count = TRAINABLE.length + STANCE_BUTTONS.length;
  return Math.round((width - rowWidth(count, metrics)) / 2);
}

export function layoutTrainButtons(width: number, height: number, metrics: HudMetrics): HudRect[] {
  return layoutRow(TRAINABLE.length, barStartX(width, metrics), height, metrics);
}

export function layoutStanceButtons(width: number, height: number, metrics: HudMetrics): HudRect[] {
  const trainW = rowWidth(TRAINABLE.length, metrics) + metrics.gap;
  return layoutRow(STANCE_BUTTONS.length, barStartX(width, metrics) + trainW, height, metrics);
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
 * The x where the speed cluster's header text should sit.
 *
 * Exported because the header is drawn by the renderer while the buttons are
 * positioned from the layout; computing it in one place is what keeps the text
 * out of the pause button's rectangle.
 */
export function speedHeaderRight(width: number, metrics: HudMetrics): number {
  const pause = layoutPauseButton(width, metrics);
  return pause.x - metrics.gap;
}
