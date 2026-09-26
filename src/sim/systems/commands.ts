/**
 * Step 2 of 6: consume this tick's Command[]. AI tactical decisions are
 * emitted here too.
 *
 * Still a stub after M2: commands and the tactical AI layer are M3's scope.
 * The harness and the render demo both set stance at spawn time instead, so
 * nothing currently produces a Command.
 */
import type { TickContext } from '../types';

export function commandsSystem(_ctx: TickContext): void {
  // M3: apply train orders and stance changes.
}
