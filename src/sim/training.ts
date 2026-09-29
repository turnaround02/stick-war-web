/**
 * The training queue (spec §6.3.2).
 *
 * A serial, uncancellable, unlimited-length queue per side. Unlimited is safe
 * because gold is the hard constraint and the population cap is the second
 * gate. Uncancellable is a deliberate M3 simplification: refunds need the
 * order's original price and a rule for partially-trained units, which is
 * polish rather than core loop.
 *
 * Gold is deducted WHEN THE ORDER IS PLACED, population is taken WHEN THE UNIT
 * SPAWNS. That split is what makes "queue now, afford it later" impossible —
 * and population is checked at order time as well, so the limit shows up as a
 * greyed-out button instead of a queue that silently stops advancing.
 */

import { BASE_RADIUS } from '../data/constants';
import { UNITS, type UnitTypeId } from '../data/units';
import { UNIT_TICKS } from '../data/unitTicks';
import { spawnUnit } from './spawn';
import type { Side, World } from './types';

/** Gap left between a new unit and anything already at the spawn point. */
const SPAWN_CLEARANCE = 4;

export interface QueueCheck {
  ok: boolean;
  reason?: 'gold' | 'pop';
}

/** Whether an order would be accepted. Does not mutate anything. */
export function canQueue(world: World, side: Side, typeId: UnitTypeId): QueueCheck {
  const def = UNITS[typeId];

  if (world.gold[side] < def.goldCost) return { ok: false, reason: 'gold' };

  // Count queued units too, or a player could queue 60 units at pop 59 and
  // only discover the cap when they stop appearing.
  let pending = 0;
  for (const order of world.trainingQueue[side]) {
    pending += UNITS[order.typeId].popCost;
  }
  if (world.popUsed[side] + pending + def.popCost > world.popCap[side]) {
    return { ok: false, reason: 'pop' };
  }

  return { ok: true };
}

/** Places an order, deducting gold immediately. Returns false if rejected. */
export function queueUnit(world: World, side: Side, typeId: UnitTypeId): boolean {
  const check = canQueue(world, side, typeId);
  if (!check.ok) return false;

  world.gold[side] -= UNITS[typeId].goldCost;
  world.trainingQueue[side].push({
    typeId,
    ticksLeft: UNIT_TICKS[typeId].trainTime,
  });
  return true;
}

/** Advances the head order and spawns a unit when it completes. */
export function advanceTrainingQueue(world: World, side: Side): void {
  const queue = world.trainingQueue[side];
  if (queue.length === 0) return;

  const head = queue[0];
  head.ticksLeft -= 1;
  if (head.ticksLeft > 0) return;

  queue.shift();

  const x = findSpawnX(world, side, head.typeId);
  const unit = spawnUnit({
    id: world.nextUnitId++,
    side,
    typeId: head.typeId,
    x,
    // Miners hold by default so a fresh one does not walk into the fight
    // before the player has told it where to mine. Combat units advance.
    stance: head.typeId === 'miner' ? 'hold' : 'advance',
  });
  world.units.push(unit);
}

/**
 * Finds a clear spot just outside the base front.
 *
 * Spawning everything at one point would bury new units inside existing ones;
 * separation would resolve it, but the result is a violent burst that can shove
 * units past the base front and scramble the formation. Searching outward is a
 * few lines and makes the spawn position predictable enough to assert on.
 *
 * Only units the newcomer would actually be separated from count as blockers.
 * Miners are transparent to combat units (they must be able to walk through
 * their own front — see separationSystem), so letting a crowd of miners push a
 * new soldier 130px up the field made it arrive alone, ahead of the line that
 * was supposed to screen it, and die without ever fighting in formation. The
 * spawn point must depend on the BATTLE line, not on where the economy happens
 * to be standing.
 */
export function findSpawnX(world: World, side: Side, typeId: UnitTypeId): number {
  const base = world.bases[side];
  const dir = side === 'player' ? 1 : -1;
  const radius = UNITS[typeId].bodyRadius;
  const front = base.x + dir * (BASE_RADIUS + radius);

  const spawningMiner = typeId === 'miner';
  const blockers = world.units.filter(
    (u) => u.side === side && (u.typeId === 'miner') === spawningMiner,
  );

  // Step outward in units of this type's width until the spot is clear.
  const step = radius * 2 + SPAWN_CLEARANCE;
  for (let i = 0; i < 200; i++) {
    const x = front + dir * i * step;
    if (x < 0 || x > world.worldWidth) break;

    const blocked = blockers.some(
      (u) => Math.abs(u.x - x) < UNITS[u.typeId].bodyRadius + radius + SPAWN_CLEARANCE,
    );
    if (!blocked) return x;
  }

  // Every candidate was taken: fall back to the front and let separation sort
  // it out rather than dropping the unit off the map.
  return front;
}
