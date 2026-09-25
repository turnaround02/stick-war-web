/** Step 6 of 6: remove dead units and spent projectiles, then resolve the outcome. */
import type { TickContext } from '../tick';

export function cleanupSystem(_ctx: TickContext): void {
  // M2: filter out dead units, resolve base damage, set world.outcome.
}
