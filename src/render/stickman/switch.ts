/**
 * Pure decision: which renderer to use for a unit (M15 step-2).
 *
 * No Phaser, no DOM — unit-testable in node (iron rule #7).
 *
 * M14 shipped a hybrid: sprites for idle/stunned, skeleton for everything
 * else. M15 replaces that with FULL-FRAME sprite animation (walk + attack
 * strips, gather reusing walk), so a sprite-preferred unit is ALWAYS drawn as
 * a sprite — the skeleton only appears when the preference is `skeleton` or
 * when a strip is missing (per-type fallback in sprite.ts, the same
 * "missing asset falls back" rule as M14).
 *
 * The contract got SIMPLER, not more complex: the state no longer matters.
 * Death is a render-layer ghost (sprite frame fade for sprite units), so
 * every sim state has a sprite representation.
 */

import type { RendererPref } from '../../save/storage';

/**
 * Decide which renderer to use.
 * @param pref  The user's saved preference.
 * @returns `true` if the unit should be drawn as a pixel-art sprite.
 */
export function shouldUseSprite(pref: RendererPref): boolean {
  return pref === 'sprite';
}
