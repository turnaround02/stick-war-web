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
 *
 * M8: the top-right reserve is DERIVED from the actual button cluster
 * (menu + pause + speed) instead of a hardcoded 240px — the menu button pushed
 * the cluster's left edge to x=948 at 1280 wide, far outside a 1040 boundary,
 * so a click on the new button would have selected units 900px away.
 */

import { FRONTLINE_METRICS, frontlinePanelRect, type FrontlineMetrics } from './frontline/layout';
import { layoutMenuButton, RESOURCE_RESERVE_X, HUD_METRICS } from './hud/layout';

export interface ClickGuardConfig {
  /** Width of the reserved top-left corner (resource bar). */
  cornerW: number;
  /** Height of the reserved top strip. */
  topH: number;
  /** Height of the bottom HUD bar. */
  hudH: number;
}

export const CLICK_GUARD: ClickGuardConfig = {
  cornerW: RESOURCE_RESERVE_X,
  topH: 56,
  hudH: 64,
};

/**
 * The LEFT EDGE of the whole top-right button cluster (menu → pause → speed).
 *
 * Derived from the same layout chain the renderer positions from, so a future
 * button in the cluster automatically widens the reserve — the failure mode
 * that M8's hardcoded-240 guard would have shipped.
 */
function topRightReserveX(width: number): number {
  const menu = layoutMenuButton(width, HUD_METRICS);
  return menu.x;
}

/**
 * True when the pointer is over HUD chrome rather than the battlefield.
 *
 * Reserved regions, in screen space:
 *  - the bottom HUD bar,
 *  - the top-left resource readout,
 *  - the top-right menu/pause/speed cluster (its real extent),
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
    if (x <= guard.cornerW) return true;
    if (x >= topRightReserveX(width)) return true;

    const panel = frontlinePanelRect(width, metrics).rect;
    if (x >= panel.x && x <= panel.x + panel.w && y >= panel.y && y <= panel.y + panel.h) {
      return true;
    }
  }

  return false;
}
