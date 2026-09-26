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

/** Falls back toward the player's own base, stopping just outside it. */
function integrateRetreat(ctx: TickContext, unit: Unit, speed: number, dir: number): void {
  if (unit.state === 'attack') return; // still swings while withdrawing

  const base = ctx.world.bases[unit.side];
  const stopX = base.x - dir * (BASE_RADIUS + UNITS[unit.typeId].bodyRadius);
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

  const distance = distanceToTarget(ctx.world, unit);
  // Ranged units stop at their own range; melee closes to contact.
  if (distance <= attackRange) return;

  const step = Math.min(speed, distance - attackRange);
  unit.x += Math.sign(targetXPos - unit.x) * step;
}
