/**
 * Step 1 of 6: mining progress, gold income, population accounting, training
 * queue.
 *
 * Still a stub after M2: M2's scope was movement and combat, and it spawns its
 * units directly via MatchConfig.initialUnits. Nothing consumes
 * World.trainingQueue yet — M3 owns the economy and must wire it up here.
 */
import type { TickContext } from '../types';

export function economySystem(_ctx: TickContext): void {
  // M3: advance miner gather timers, bank carried gold, tick down the training queue.
}
