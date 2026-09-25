/**
 * Sub-step of step 4: the 1D sort-and-separate constraint (spec §6.2).
 * Not a top-level tick step — called by movementSystem.
 */
import type { TickContext } from '../tick';

export function separationSystem(_ctx: TickContext): void {
  // M2: sort by x per side, push apart neighbours closer than minGap,
  // block opposing units from interpenetrating, clamp x to [0, worldWidth].
}
