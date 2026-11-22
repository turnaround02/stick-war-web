/**
 * Pure decision: which renderer to use for a given unit state + preference.
 * No Phaser, no DOM — unit-testable in node (iron rule #7).
 *
 * The rule (Q2 "only replace the static pose"):
 *   - When the preference is `skeleton`, ALWAYS use the skeleton.
 *   - When the preference is `sprite`, use the sprite image for the
 *     `idle` and `stunned` states; fall back to the skeleton for
 *     `move`, `gather`, `attack`, `dead`.
 *
 * `idle` and `stunned` are both standing still, so a static portrait is
 * honest. `move` / `gather` need the walk cycle and `attack` needs the swing,
 * so they stay skeletal.
 */

import type { UnitState } from '../../sim/types';
import type { RendererPref } from '../../save/storage';

/** States for which a static portrait is acceptable (no walk / no attack). */
export const SPRITE_STATES: ReadonlySet<UnitState> = new Set<UnitState>([
  'idle',
  'stunned',
]);

/**
 * Decide which renderer to use.
 * @param pref  The user's saved preference.
 * @param state The unit's current sim state.
 * @returns `true` if the sprite image should be shown for this unit right now.
 */
export function shouldUseSprite(pref: RendererPref, state: UnitState): boolean {
  if (pref === 'skeleton') return false;
  return SPRITE_STATES.has(state);
}
