/**
 * The six-step tick orchestrator (spec §6.1).
 *
 * ORDER IS LOAD-BEARING AND MUST NOT CHANGE:
 *   economy -> commands -> ai -> movement -> combat -> cleanup
 *
 * Two constraints in particular:
 *   - movement before combat, or range checks use last tick's positions and
 *     every melee engagement is off by one tick.
 *   - combat before cleanup, or a unit marked dead this tick still lands a hit
 *     (corpse double-kill).
 *
 * Changing this order changes simulation results for the same seed, which
 * invalidates replay and batch balance runs. tick.test.ts asserts the order.
 *
 * Never use Math.random / Date.now / performance.now in here or in systems/.
 */

import type { Command, TickContext, TickSystem, World } from './types';
import { economySystem } from './systems/economy';
import { commandsSystem } from './systems/commands';
import { aiSystem } from './systems/ai';
import { movementSystem } from './systems/movement';
import { combatSystem } from './systems/combat';
import { cleanupSystem } from './systems/cleanup';

// Re-exported so callers that already import from tick.ts keep working.
export type { TickContext, TickSystem };

/**
 * The fixed system order. `step` iterates this array, so the declaration here
 * and the execution order can never drift apart.
 */
export const TICK_SYSTEMS: readonly TickSystem[] = [
  economySystem,
  commandsSystem,
  aiSystem,
  movementSystem,
  combatSystem,
  cleanupSystem,
];

/** Advances the world by exactly one logic tick. */
export function step(world: World, commands: Command[]): void {
  const ctx: TickContext = { world, commands };
  for (const system of TICK_SYSTEMS) {
    system(ctx);
  }
  world.tick += 1;
}
