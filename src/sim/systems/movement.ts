/** Step 4 of 6: desired-position integration, then the separation constraint. */
import type { TickContext } from '../tick';
import { separationSystem } from './separation';

export function movementSystem(ctx: TickContext): void {
  // M2: record prevX, advance x by stance/target, then resolve overlaps.
  separationSystem(ctx);
}
