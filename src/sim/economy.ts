/**
 * Mining and banking, as pure functions over a world and one unit.
 *
 * Kept separate from economySystem so the gather cycle can be tested without
 * running the whole tick pipeline. economySystem's job is orchestration:
 * decide *which* units to call these on, and in what order.
 *
 * Two timings that must not be conflated:
 *   - the mine's goldLeft drops when GATHERING COMPLETES (the seam really lost
 *     the gold)
 *   - the side's gold rises when the miner REACHES THE BASE (the gold really
 *     arrived)
 * So a miner killed in transit is a genuine economic loss, and a depleted seam
 * is a separate one.
 */

import { BASE_RADIUS } from '../data/constants';
import { UNITS } from '../data/units';
import type { Unit, World } from './types';

/** How close to the base front counts as "arrived", in px. */
export const MINE_ARRIVAL_TOLERANCE = 8;

/** Advances a miner's gather timer; on completion it loads up and depletes the seam. */
export function advanceGather(world: World, unit: Unit): void {
  if (unit.state !== 'gather') return;
  if (unit.typeId !== 'miner') return;
  if (unit.gatherTicksLeft <= 0) return;

  unit.gatherTicksLeft -= 1;
  if (unit.gatherTicksLeft > 0) return;

  const mine = world.mines[unit.side];
  const capacity = UNITS.miner.carryCapacity;
  // Take only what is left: the last trip out of a nearly empty seam carries
  // less, and an exhausted seam loads nothing.
  const load = Math.max(0, Math.min(capacity, mine.goldLeft));
  mine.goldLeft -= load;
  unit.carrying = load;
}

/**
 * Banks a miner's load if it has reached its own base front.
 * Returns true when gold changed hands, so the caller can pick a new target.
 */
export function tryBankGold(world: World, unit: Unit): boolean {
  if (unit.typeId !== 'miner') return false;
  if (unit.carrying <= 0) return false;

  const base = world.bases[unit.side];
  const dir = unit.side === 'player' ? 1 : -1;
  const front = base.x + dir * (BASE_RADIUS + UNITS.miner.bodyRadius);

  if (Math.abs(unit.x - front) > MINE_ARRIVAL_TOLERANCE) return false;

  world.gold[unit.side] += unit.carrying;
  unit.carrying = 0;
  return true;
}
