/**
 * Step 3 of 6: per-unit target selection and state transitions.
 *
 * Runs BEFORE movement so movement can use this tick's decisions. The tactical
 * layer (choosing what to build, when to push) lives in commands.ts and is
 * driven by the same Command type the player uses — the AI literally presses
 * the player's buttons (spec §9.1).
 */

import { UNITS } from '../../data/units';
import { UNIT_TICKS } from '../../data/unitTicks';
import { acquireTarget, distanceToTarget, shouldKeepTarget } from '../targeting';
import type { TickContext, Unit } from '../types';

export function aiSystem(ctx: TickContext): void {
  for (const unit of ctx.world.units) {
    if (unit.state === 'dead' || unit.hp <= 0) continue;

    if (unit.state === 'stunned') {
      if (unit.stunTicksLeft > 0) unit.stunTicksLeft -= 1;
      if (unit.stunTicksLeft === 0) transition(ctx, unit, 'idle');
      continue;
    }

    // A retreating unit never seeks new targets; it keeps what it has so it can
    // fight back while withdrawing (spec §6.3).
    const keep = shouldKeepTarget(ctx.world, unit);
    if (!keep) {
      unit.target = unit.stance === 'retreat' ? null : acquireTarget(ctx.world, unit);
    }

    decideState(ctx, unit);
  }
}

function decideState(ctx: TickContext, unit: Unit): void {
  const def = UNITS[unit.typeId];

  if (unit.target === null) {
    // No target: return to idle. transition() is idempotent, so this does not
    // churn stateEnteredTick while the unit sits idle.
    transition(ctx, unit, 'idle');
    return;
  }

  const distance = distanceToTarget(ctx.world, unit);
  const inRange = distance <= def.attackRange;

  if (def.attackType === 'none') {
    // A unit that cannot attack never enters the attack state.
    transition(ctx, unit, 'move');
    return;
  }

  if (!inRange) {
    transition(ctx, unit, 'move');
    return;
  }

  transition(ctx, unit, 'attack');

  // Start a windup only when idle in the attack state: an in-flight windup is
  // never restarted (spec §6.3 rule 1).
  if (unit.windupTicksLeft === 0 && unit.cooldownTicksLeft === 0) {
    unit.windupTicksLeft = UNIT_TICKS[unit.typeId].windup;
  }
}

/** Sets the state and stamps the tick, so the renderer can derive animation phase. */
function transition(ctx: TickContext, unit: Unit, state: Unit['state']): void {
  if (unit.state === state) return;
  unit.state = state;
  unit.stateEnteredTick = ctx.world.tick;
}
