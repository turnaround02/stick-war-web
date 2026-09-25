/** Step 5 of 6: wind-up, damage resolution, death marking. Must run before cleanup. */
import type { TickContext } from '../tick';

export function combatSystem(_ctx: TickContext): void {
  // M2: advance windupTicksLeft, resolve damage, mark state = 'dead'.
}
