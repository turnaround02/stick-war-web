/**
 * Step 3 of 6: per-unit target selection and state transitions.
 *
 * Runs BEFORE movement so movement can use this tick's decisions. The tactical
 * layer (choosing what to build, when to push) lives in commands.ts and is
 * driven by the same Command type the player uses — the AI literally presses
 * the player's buttons (spec §9.1).
 */

import { TARGET_ACQUIRE_RANGE } from '../../data/constants';
import { UNITS } from '../../data/units';
import { UNIT_TICKS } from '../../data/unitTicks';
import { acquireTarget, distanceToTarget, isTargetAlive, shouldKeepTarget } from '../targeting';
import type { TickContext, Unit } from '../types';

export function aiSystem(ctx: TickContext): void {
  for (const unit of ctx.world.units) {
    if (unit.state === 'dead' || unit.hp <= 0) continue;

    if (unit.state === 'stunned') {
      if (unit.stunTicksLeft > 0) unit.stunTicksLeft -= 1;
      if (unit.stunTicksLeft === 0) transition(ctx, unit, 'idle');
      continue;
    }

    // Miners run a different rule set: their job is the seam, not the fight.
    if (unit.typeId === 'miner') {
      updateMiner(ctx, unit);
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

/**
 * Miners have three priorities (spec §6.3.1):
 *   1. an enemy nearby while retreating -> run home, abandoning the trip
 *   2. an enemy nearby otherwise         -> keep mining
 *   3. no enemy                          -> mine
 *
 * Priority 2 matters because a miner's attack is 0: switching it into a combat
 * state would only make it stand still and be killed. Its one defence is
 * retreat, which is exactly the lever the player has.
 *
 * The miner's STANCE is derived from its job rather than left as the player
 * set it, EXCEPT for `retreat`. createWorld spawns starting miners on 'hold',
 * and movementSystem returns early for 'hold' — a miner that acquired a mine
 * target but stayed on hold would never move and the economy would never start.
 * `retreat` is the one stance that stays player-owned, because fleeing is a real
 * order; a retreating miner keeps it, and movementSystem's retreat branch is
 * what actually carries it home.
 */
function updateMiner(ctx: TickContext, unit: Unit): void {
  // Gathering is the one state the miner holds on its own; economySystem owns
  // the transition out of it.
  if (unit.state === 'gather') return;

  const enemyNear = nearestEnemyDistance(ctx, unit) <= TARGET_ACQUIRE_RANGE;

  if (enemyNear && unit.stance === 'retreat') {
    unit.target = { kind: 'base', side: unit.side };
    // The stance is NOT overwritten: movementSystem's `retreat` branch walks the
    // unit to its own base front regardless of `target`, so leaving it alone
    // produces the right movement AND keeps the player's order visible and
    // sticky. Overwriting it here would erase the order on the next tick and
    // make the HUD's stance field a lie.
    transition(ctx, unit, 'move');
    return;
  }

  // Keep (or resume) the mining trip — but never clobber a valid target.
  // The go-home leg is expressed as a base target, and overwriting it with the
  // mine every tick would make the miner oscillate between the two and never
  // bank anything.
  const targetValid = unit.target !== null && isTargetAlive(ctx.world, unit.target);
  if (!targetValid) {
    const mine = { kind: 'mine', side: unit.side } as const;
    // A depleted seam is a dead end: go idle rather than loop an animation
    // that produces nothing.
    unit.target = isTargetAlive(ctx.world, mine) ? mine : null;
  }

  if (unit.target === null) {
    unit.stance = 'hold';
    transition(ctx, unit, 'idle');
    return;
  }

  unit.stance = 'advance';
  transition(ctx, unit, 'move');
}

/** Distance to the closest living enemy unit, or Infinity when there is none. */
function nearestEnemyDistance(ctx: TickContext, unit: Unit): number {
  let best = Infinity;
  for (const other of ctx.world.units) {
    if (other.side === unit.side) continue;
    if (other.state === 'dead' || other.hp <= 0) continue;
    const d = Math.abs(other.x - unit.x);
    if (d < best) best = d;
  }
  return best;
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
