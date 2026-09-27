/**
 * Step 1 of 6: mining progress, gold income, population accounting, and the
 * training queue.
 *
 * Runs FIRST so that gold earned this tick is available to the commands step
 * in the same tick — a player who banks a load and immediately queues a unit
 * should not wait an extra tick.
 *
 * The heavy lifting lives in sim/economy.ts and sim/training.ts as pure
 * functions; this file only orchestrates them.
 */

import { UNITS } from '../../data/units';
import { UNIT_TICKS } from '../../data/unitTicks';
import { MINE_ARRIVAL_TOLERANCE, advanceGather, tryBankGold } from '../economy';
import { targetX } from '../targeting';
import { advanceTrainingQueue } from '../training';
import type { Side, TickContext, World } from '../types';

const SIDES: readonly Side[] = ['player', 'enemy'];

export function economySystem(ctx: TickContext): void {
  const { world } = ctx;

  for (const unit of world.units) {
    if (unit.typeId !== 'miner') continue;
    if (unit.state === 'dead' || unit.hp <= 0) continue;

    // Mining in progress: count it down, and on completion take the load.
    if (unit.state === 'gather') {
      advanceGather(world, unit);
      // Still mining. This early-out is load-bearing: `carrying` is 0 for the
      // whole gather, so testing it directly would read "no load" as "the seam
      // was dry" and abandon the trip on its first tick — the miner would then
      // be sent back, re-enter gather, and loop forever without producing gold.
      if (unit.gatherTicksLeft > 0) continue;

      if (unit.carrying > 0) {
        // Loaded: head home. Expressing "home" as targeting our own base keeps
        // `target` the single source of truth for where a unit is going.
        unit.target = { kind: 'base', side: unit.side };
        // Leave `gather` as well, or movementSystem's early-out for that state
        // keeps the miner planted at the seam while it carries a full load.
        unit.state = 'move';
      } else {
        // The seam really was dry. Do not loop a gather animation that produces
        // nothing — that is the worst failure mode, because the animation
        // says "working" while the treasury says otherwise.
        unit.state = 'idle';
        unit.target = null;
      }
      continue;
    }

    // In transit home with a load: bank it on arrival.
    if (tryBankGold(world, unit)) {
      unit.target = { kind: 'mine', side: unit.side };
      continue;
    }

    // Arrived at the mine: start gathering — but only if the seam still holds
    // gold. With two miners on one seam the second can arrive after the first
    // drained it, and without this check it would play a full 90-tick gather
    // animation and produce nothing: a "working" animation with no output,
    // which is the failure mode the depleted-seam rule exists to prevent.
    if (unit.target !== null && unit.target.kind === 'mine') {
      const mineX = targetX(world, unit.target);
      const seamHasGold = world.mines[unit.target.side].goldLeft > 0;
      if (seamHasGold && mineX !== null && Math.abs(unit.x - mineX) <= MINE_ARRIVAL_TOLERANCE) {
        unit.state = 'gather';
        unit.gatherTicksLeft = UNIT_TICKS.miner.gatherTime;
      } else if (!seamHasGold) {
        unit.state = 'idle';
        unit.target = null;
      }
    }
  }

  for (const side of SIDES) {
    advanceTrainingQueue(world, side);
  }

  recountPopulation(world);
}

/**
 * Population is derived from the living units, so it can never drift.
 *
 * Dead units are skipped even though cleanup removes them at the end of the
 * previous tick: a unit that reached hp <= 0 during this tick would otherwise
 * be counted for one tick, and population is a spendable resource.
 */
function recountPopulation(world: World): void {
  const counts: Record<Side, number> = { player: 0, enemy: 0 };
  for (const unit of world.units) {
    if (unit.state === 'dead' || unit.hp <= 0) continue;
    counts[unit.side] += UNITS[unit.typeId].popCost;
  }
  world.popUsed = counts;
}
