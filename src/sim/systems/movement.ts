/**
 * Step 4 of 6: position integration, then the separation constraint.
 *
 * MUST run before combat, or every range check uses last tick's positions and
 * melee engagements are systematically off by one tick (spec §6.1).
 *
 * Internal order is fixed (spec §6.2):
 *   1. record prevX
 *   2. integrate by stance/target
 *   3. same-side separation
 *   4. enemy blocking
 *   5. clamp to [0, worldWidth]
 *
 * Separation runs after integration so that pushing cannot be undone by
 * movement in the same tick.
 */

import { BASE_RADIUS } from '../../data/constants';
import { UNITS } from '../../data/units';
import { UNIT_TICKS } from '../../data/unitTicks';
import { MINE_ARRIVAL_TOLERANCE } from '../economy';
import { distanceToTarget, targetX } from '../targeting';
import { separationSystem } from './separation';
import type { TickContext, Unit } from '../types';

export function movementSystem(ctx: TickContext): void {
  for (const unit of ctx.world.units) {
    unit.prevX = unit.x;
  }

  for (const unit of ctx.world.units) {
    integrate(ctx, unit);
  }

  separationSystem(ctx);
}

function integrate(ctx: TickContext, unit: Unit): void {
  if (unit.state === 'dead' || unit.state === 'stunned' || unit.state === 'gather') return;

  const def = UNITS[unit.typeId];
  const speed = UNIT_TICKS[unit.typeId].speedPerTick;
  const dir = unit.side === 'player' ? 1 : -1;

  switch (unit.stance) {
    case 'retreat':
      integrateRetreat(ctx, unit, speed, dir);
      return;
    case 'hold':
      // Holding units stay put; aiSystem decides whether they can attack.
      return;
    case 'advance':
      integrateAdvance(ctx, unit, speed, dir, def.attackRange);
      return;
  }
}

/**
 * Falls back toward the unit's own base, stopping at its FRONT (the
 * battlefield-facing edge).
 *
 * Not behind the base: with mines on the battlefield side, withdrawing units
 * and miners would share a lane, and the base front is where the line is meant
 * to re-form anyway. The sign matters — `+` puts the stop point on the
 * battlefield side, `-` would put it behind the base.
 */
function integrateRetreat(ctx: TickContext, unit: Unit, speed: number, dir: number): void {
  if (unit.state === 'attack') return; // still swings while withdrawing

  const base = ctx.world.bases[unit.side];
  const stopX = base.x + dir * (BASE_RADIUS + UNITS[unit.typeId].bodyRadius);
  const delta = stopX - unit.x;
  if (Math.abs(delta) < 1e-9) return;
  // Never overshoot the stop line.
  unit.x += Math.sign(delta) * Math.min(speed, Math.abs(delta));
}

function integrateAdvance(
  ctx: TickContext,
  unit: Unit,
  speed: number,
  dir: number,
  attackRange: number,
): void {
  if (unit.state === 'attack') return; // planted while swinging

  const targetXPos = targetX(ctx.world, unit.target);
  if (targetXPos === null) {
    // No target: keep walking toward the enemy side so the lines eventually meet.
    unit.x += dir * speed;
    return;
  }

  // Miners navigate to POINTS, not to things with an attack range. Two
  // differences from the generic path below:
  //   - a mine is reached when the miner is at its X
  //   - "home" for a miner is the base FRONT, where gold changes hands, not the
  //     base edge that distanceToTarget measures to. Walking to the edge would
  //     overshoot the banking point and the load would never be delivered.
  if (unit.typeId === 'miner') {
    const destX = minerDestinationX(ctx, unit);
    if (destX !== null) {
      const toTarget = destX - unit.x;
      if (Math.abs(toTarget) <= MINE_ARRIVAL_TOLERANCE) return;
      // Math.max(0, ...) matters: without it the remaining-distance-minus-tolerance
      // goes negative near the target and the miner steps BACKWARD past it.
      const travel = Math.min(speed, Math.max(0, Math.abs(toTarget) - MINE_ARRIVAL_TOLERANCE));
      unit.x += Math.sign(toTarget) * travel;
      return;
    }
  }

  const distance = distanceToTarget(ctx.world, unit);
  // Ranged units stop at their own range; melee closes to contact.
  if (distance <= attackRange) return;

  const step = Math.min(speed, distance - attackRange);
  unit.x += Math.sign(targetXPos - unit.x) * step;
}

/** Where a miner should walk to, or null if its target is not a navigation point. */
function minerDestinationX(ctx: TickContext, unit: Unit): number | null {
  const target = unit.target;
  if (target === null) return null;
  if (target.kind === 'mine') return ctx.world.mines[target.side].x;
  if (target.kind === 'base') {
    const dir = unit.side === 'player' ? 1 : -1;
    return ctx.world.bases[target.side].x + dir * (BASE_RADIUS + UNITS[unit.typeId].bodyRadius);
  }
  return null;
}
