/**
 * Decides whether a pointer-down should be ignored by the unit-selection path.
 *
 * Phaser-free so it can be tested: this is exactly the kind of geometry that
 * "looks right" but is off by a few pixels, and getting it wrong means a click
 * on the HUD or the frontline indicator silently (de)selects units.
 *
 * The frontline indicator lives at the TOP CENTRE (spec §7.3.1). The original
 * guard only reserved the left/right 240px of the top strip, so a click on the
 * indicator leaked through. Routing selection through this function keeps the
 * reserved regions in one place, derived from the same layout the renderer uses.
 */

import { FRONTLINE_METRICS, frontlinePanelRect, type FrontlineMetrics } from './frontline/layout';

export interface ClickGuardConfig {
  /** Width of the reserved top-left / top-right corners (resource bar, speed/pause). */
  cornerW: number;
  /** Height of the reserved top strip. */
  topH: number;
  /** Height of the bottom HUD bar. */
  hudH: number;
}

export const CLICK_GUARD: ClickGuardConfig = {
  cornerW: 240,
  topH: 56,
  hudH: 64,
};

/**
 * True when the pointer is over HUD chrome rather than the battlefield.
 *
 * Reserved regions, in screen space:
 *  - the bottom HUD bar,
 *  - the top-left resource readout,
 *  - the top-right speed / pause cluster,
 *  - the top-centre frontline indicator (its actual layout rect, so it tracks
 *    the viewport width instead of a hardcoded span).
 */
export function shouldIgnoreClick(
  x: number,
  y: number,
  width: number,
  height: number,
  guard: ClickGuardConfig = CLICK_GUARD,
  metrics: FrontlineMetrics = FRONTLINE_METRICS,
): boolean {
  if (y >= height - guard.hudH) return true;

  if (y <= guard.topH) {
    if (x <= guard.cornerW || x >= width - guard.cornerW) return true;

    const panel = frontlinePanelRect(width, metrics);
    if (x >= panel.x && x <= panel.x + panel.w && y >= panel.y && y <= panel.y + panel.h) {
      return true;
    }
  }

  return false;
}
